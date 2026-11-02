import { Router } from 'express';
import { db, nowIso, tx } from '../db/index.js';
import { can } from '../middleware/auth.js';
import { findOr404, insert, update } from '../lib/query.js';
import { f, parse, z } from '../lib/validate.js';
import { badRequest, conflict } from '../lib/errors.js';
import { record } from '../lib/audit.js';
import { today } from '../lib/dates.js';

// Testimonios privados. Nunca se marca uno como publicable sin autorización registrada
// (fecha, quién autoriza y cómo consta). La base de datos refuerza esta regla con un CHECK.

const router = Router();
const CHANNELS = ['call', 'meeting', 'in_person', 'video_call', 'whatsapp', 'email', 'other'];

const baseFields = {
  client_id: f.id(),
  received_at: f.date(),
  service_id: f.optId(),
  project_id: f.optId(),
  channel: f.oneOf(CHANNELS),
  internal_notes: f.optText(5000),
  draft_text: f.optText(3000),
};

const SELECT = `SELECT t.*, c.name AS client_name, c.company AS client_company, s.name AS service_name, p.name AS project_name, u.name AS created_by_name
  FROM testimonials t JOIN clients c ON c.id = t.client_id LEFT JOIN services s ON s.id = t.service_id LEFT JOIN projects p ON p.id = t.project_id LEFT JOIN users u ON u.id = t.created_by`;

/** El estado se deriva del contenido salvo autorización/rechazo explícitos. */
const derivedStatus = (t) => (t.draft_text ? 'pending_approval' : t.internal_notes ? 'pending_draft' : 'received');

router.get('/', can('testimonials.read'), async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.status) where.push('t.status = ?') && params.push(String(req.query.status));
  if (req.query.client_id) where.push('t.client_id = ?') && params.push(Number(req.query.client_id));
  res.json(await (db.all(`${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t.received_at DESC, t.id DESC`, params)));
});

router.post('/', can('testimonials.write'), async (req, res) => {
  const data = parse(z.object(baseFields), req.body);
  if (!await (db.value('SELECT 1 FROM clients WHERE id = ? AND deleted_at IS NULL', [data.client_id]))) throw badRequest('Cliente no válido', { client_id: 'Selecciona un cliente' });
  const id = await (tx(async () => {
    const newId = await (insert('testimonials', { ...data, status: data.draft_text ? 'pending_approval' : 'received', created_by: req.user.id }));
    await (record(req, { action: 'testimonial.received', entityType: 'testimonial', entityId: newId, clientId: data.client_id, summary: 'Opinión verbal registrada (privada, pendiente de autorización)' }));
    return newId;
  }));
  res.status(201).json(await (db.get(`${SELECT} WHERE t.id = ?`, [id])));
});

router.patch('/:id', can('testimonials.write'), async (req, res) => {
  const before = await (findOr404('testimonials', req.params.id, { message: 'Testimonio no encontrado' }));
  const data = parse(z.object(baseFields).partial(), req.body);
  const textChanged = 'draft_text' in data && data.draft_text !== before.draft_text;
  if (before.status === 'authorized' && textChanged) {
    // Cualquier cambio en el texto autorizado invalida la autorización
    data.status = 'pending_approval';
  }
  await (tx(async () => {
    const merged = { ...before, ...data };
    const status = data.status ?? (['authorized', 'rejected'].includes(before.status) ? before.status : derivedStatus(merged));
    const resetApproval = status !== 'authorized';
    await (update('testimonials', before.id, { ...data, status, ...(resetApproval ? { can_publish: 0, approved_at: status === 'rejected' ? before.approved_at : null } : {}) }));
    await (record(req, {
      action: before.status === 'authorized' && textChanged ? 'testimonial.authorization_revoked' : 'testimonial.updated',
      entityType: 'testimonial',
      entityId: before.id,
      clientId: before.client_id,
      summary: before.status === 'authorized' && textChanged ? 'Texto de testimonio modificado: requiere nueva autorización' : 'Testimonio actualizado',
    }));
  }));
  res.json(await (db.get(`${SELECT} WHERE t.id = ?`, [before.id])));
});

router.post('/:id/authorize', can('testimonials.approve'), async (req, res) => {
  const t = await (findOr404('testimonials', req.params.id, { message: 'Testimonio no encontrado' }));
  if (!t.draft_text) throw conflict('Redacta primero el texto que el cliente debe aprobar');
  const data = parse(
    z.object({
      approved_at: f.date().refine((d) => d <= today(), 'No puede ser una fecha futura'),
      approved_by_name: f.text(150),
      approval_evidence: f.text(1000),
      can_publish: f.bool().default(false),
      confirm: z.literal(true, { errorMap: () => ({ message: 'Confirma que el cliente ha aprobado este texto exacto' }) }),
    }),
    req.body,
  );
  await (tx(async () => {
    await (update('testimonials', t.id, { status: 'authorized', approved_at: data.approved_at, approved_by_name: data.approved_by_name, approval_evidence: data.approval_evidence, can_publish: data.can_publish ? 1 : 0 }));
    await (record(req, {
      action: 'testimonial.authorized',
      entityType: 'testimonial',
      entityId: t.id,
      clientId: t.client_id,
      summary: `Testimonio autorizado por ${data.approved_by_name}${data.can_publish ? ' (con permiso de publicación)' : ' (sin permiso de publicación)'}`,
      data: { approved_at: data.approved_at, evidence: data.approval_evidence, text: t.draft_text },
    }));
  }));
  res.json(await (db.get(`${SELECT} WHERE t.id = ?`, [t.id])));
});

router.post('/:id/reject', can('testimonials.approve'), async (req, res) => {
  const t = await (findOr404('testimonials', req.params.id, { message: 'Testimonio no encontrado' }));
  const { reason } = parse(z.object({ reason: f.optText(1000) }), req.body);
  await (tx(async () => {
    await (update('testimonials', t.id, { status: 'rejected', can_publish: 0, approval_evidence: reason ?? t.approval_evidence }));
    await (record(req, { action: 'testimonial.rejected', entityType: 'testimonial', entityId: t.id, clientId: t.client_id, summary: 'Testimonio no autorizado por el cliente' }));
  }));
  res.json(await (db.get(`${SELECT} WHERE t.id = ?`, [t.id])));
});

router.delete('/:id', can('testimonials.write'), async (req, res) => {
  const t = await (findOr404('testimonials', req.params.id, { message: 'Testimonio no encontrado' }));
  await (tx(async () => {
    await (db.run('DELETE FROM testimonials WHERE id = ?', [t.id]));
    await (record(req, { action: 'testimonial.deleted', entityType: 'testimonial', entityId: t.id, clientId: t.client_id, summary: 'Registro de testimonio eliminado', before: t }));
  }));
  res.json({ ok: true });
});

export default router;
