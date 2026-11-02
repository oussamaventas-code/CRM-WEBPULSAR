import { Router } from 'express';
import { db, tx } from '../db/index.js';
import { can } from '../middleware/auth.js';
import { findOr404, insert, paginate, update } from '../lib/query.js';
import { f, parse, z } from '../lib/validate.js';
import { badRequest, conflict } from '../lib/errors.js';
import { record } from '../lib/audit.js';
import { today } from '../lib/dates.js';

const router = Router();

export const SERVICE_CATEGORIES = ['web_design', 'web_dev', 'crm_dev', 'software_dev', 'hosting', 'maintenance', 'automation', 'integrations', 'consulting', 'other'];
const PERIODS = ['one_time', 'monthly', 'quarterly', 'yearly'];
const FREQ_FROM_PERIOD = { monthly: 'monthly', quarterly: 'quarterly', yearly: 'yearly' };

const serviceSchema = z.object({
  name: f.text(150),
  category: f.oneOf(SERVICE_CATEGORIES),
  description: f.optText(3000),
  price_cents: f.cents(),
  modality: f.oneOf(['fixed', 'hourly', 'recurring', 'custom']).default('fixed'),
  billing_period: f.oneOf(PERIODS).default('one_time'),
  internal_cost_cents: f.optCents(),
  status: f.oneOf(['active', 'inactive']).default('active'),
});

router.get('/', can('services.read'), async (req, res) => {
  const where = [];
  const params = [];
  if (SERVICE_CATEGORIES.includes(req.query.category)) where.push('x.category = ?') && params.push(req.query.category);
  if (req.query.status === 'active' || req.query.status === 'inactive') where.push('x.status = ?') && params.push(req.query.status);
  res.json(
    await (paginate(req.query, {
      from: `(SELECT s.*, (SELECT COUNT(*) FROM client_services cs WHERE cs.service_id = s.id AND cs.status = 'active') AS active_clients FROM services s) x`,
      where,
      params,
      searchColumns: ['x.name', 'x.description'],
      sortMap: { name: 'x.name COLLATE NOCASE', category: 'x.category', price: 'x.price_cents', clients: 'x.active_clients', created_at: 'x.created_at' },
      defaultSort: ['name', 'asc'],
      tiebreak: 'x.id DESC',
    })),
  );
});

router.post('/', can('services.write'), async (req, res) => {
  const data = parse(serviceSchema, req.body);
  const id = await (tx(async () => {
    const newId = await (insert('services', data));
    await (record(req, { action: 'service.created', entityType: 'service', entityId: newId, label: data.name, summary: `Servicio añadido al catálogo: ${data.name}`, after: data }));
    return newId;
  }));
  res.status(201).json(await (db.get('SELECT * FROM services WHERE id = ?', [id])));
});

router.patch('/:id', can('services.write'), async (req, res) => {
  const before = await (findOr404('services', req.params.id, { message: 'Servicio no encontrado' }));
  const data = parse(serviceSchema.partial(), req.body);
  await (tx(async () => {
    await (update('services', before.id, data));
    await (record(req, { action: 'service.updated', entityType: 'service', entityId: before.id, label: before.name, summary: `Servicio actualizado: ${before.name}`, before, after: data }));
  }));
  res.json(await (db.get('SELECT * FROM services WHERE id = ?', [before.id])));
});

router.delete('/:id', can('services.write'), async (req, res) => {
  const service = await (findOr404('services', req.params.id, { message: 'Servicio no encontrado' }));
  const used = await (db.value('SELECT (SELECT COUNT(*) FROM client_services WHERE service_id = ?) + (SELECT COUNT(*) FROM invoice_items WHERE service_id = ?)', [service.id, service.id]));
  if (used) throw conflict('El servicio está contratado o facturado. Márcalo como inactivo en lugar de eliminarlo.');
  await (tx(async () => {
    await (db.run('DELETE FROM services WHERE id = ?', [service.id]));
    await (record(req, { action: 'service.deleted', entityType: 'service', entityId: service.id, label: service.name, summary: `Servicio eliminado del catálogo: ${service.name}`, before: service }));
  }));
  res.json({ ok: true });
});

// ── Servicios contratados por clientes ───────────────────
export const clientServiceRouter = Router();

const assignSchema = z.object({
  client_id: f.id(),
  service_id: f.id(),
  project_id: f.optId(),
  price_cents: f.cents().optional(),
  billing_period: f.oneOf(PERIODS).optional(),
  start_date: f.optDate(),
  end_date: f.optDate(),
  status: f.oneOf(['active', 'paused', 'cancelled', 'finished']).default('active'),
  notes: f.optText(2000),
  create_recurring: f.bool().default(false),
});

const CS_SELECT = `SELECT cs.*, s.name AS service_name, s.category, c.name AS client_name, c.company AS client_company, p.name AS project_name
  FROM client_services cs JOIN services s ON s.id = cs.service_id JOIN clients c ON c.id = cs.client_id LEFT JOIN projects p ON p.id = cs.project_id`;

clientServiceRouter.get('/', can('services.read'), async (req, res) => {
  const where = ['c.deleted_at IS NULL'];
  const params = [];
  if (req.query.client_id) where.push('cs.client_id = ?') && params.push(Number(req.query.client_id));
  if (req.query.service_id) where.push('cs.service_id = ?') && params.push(Number(req.query.service_id));
  if (req.query.status) where.push('cs.status = ?') && params.push(String(req.query.status));
  res.json(await (db.all(`${CS_SELECT} WHERE ${where.join(' AND ')} ORDER BY cs.status = 'active' DESC, cs.start_date DESC, cs.id DESC`, params)));
});

clientServiceRouter.post('/', can('services.write'), async (req, res) => {
  const data = parse(assignSchema, req.body);
  const service = await (findOr404('services', data.service_id, { message: 'Servicio no encontrado' }));
  const client = await (db.get('SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL', [data.client_id]));
  if (!client) throw badRequest('Cliente no válido', { client_id: 'Cliente no válido' });
  const period = data.billing_period ?? service.billing_period;
  if (data.create_recurring && !FREQ_FROM_PERIOD[period]) throw badRequest('Solo los servicios periódicos generan cobros recurrentes', { create_recurring: 'El servicio no es periódico' });
  if (data.create_recurring && !req.perms.has('finance.write')) throw badRequest('No tienes permiso para crear cobros recurrentes');

  const id = await (tx(async () => {
    const { create_recurring, ...rest } = data;
    const newId = await (insert('client_services', { ...rest, price_cents: data.price_cents ?? service.price_cents, billing_period: period, start_date: data.start_date ?? today() }));
    if (create_recurring) {
      const start = data.start_date ?? today();
      await (insert('recurring_payments', {
        client_id: client.id,
        client_service_id: newId,
        project_id: data.project_id,
        concept: service.name,
        category: service.category === 'hosting' ? 'hosting' : service.category === 'maintenance' ? 'maintenance' : 'subscription',
        amount_cents: data.price_cents ?? service.price_cents,
        frequency: FREQ_FROM_PERIOD[period],
        start_date: start,
        next_due_date: start,
        end_date: data.end_date,
        created_by: req.user.id,
      }));
    }
    await (record(req, { action: 'client_service.created', entityType: 'client', entityId: client.id, clientId: client.id, label: client.name, summary: `Servicio contratado por ${client.name}: ${service.name}` }));
    return newId;
  }));
  res.status(201).json(await (db.get(`${CS_SELECT} WHERE cs.id = ?`, [id])));
});

clientServiceRouter.patch('/:id', can('services.write'), async (req, res) => {
  const before = await (findOr404('client_services', req.params.id, { message: 'Contratación no encontrada' }));
  const { create_recurring: _ignored, ...data } = parse(assignSchema.partial(), req.body);
  delete data.client_id;
  await (tx(async () => {
    await (update('client_services', before.id, data));
    if (data.status && data.status !== 'active' && data.status !== before.status) {
      await (db.run("UPDATE recurring_payments SET status = CASE WHEN ? = 'paused' THEN 'paused' ELSE 'cancelled' END WHERE client_service_id = ? AND status = 'active'", [data.status, before.id]));
    }
    await (record(req, { action: 'client_service.updated', entityType: 'client', entityId: before.client_id, clientId: before.client_id, summary: 'Servicio contratado actualizado', before, after: data }));
  }));
  res.json(await (db.get(`${CS_SELECT} WHERE cs.id = ?`, [before.id])));
});

export default router;
