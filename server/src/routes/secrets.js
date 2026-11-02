import { Router } from 'express';
import { db, nowIso, tx } from '../db/index.js';
import { can, confirmPassword } from '../middleware/auth.js';
import { sensitiveLimiter } from '../middleware/security.js';
import { findOr404, insert, update } from '../lib/query.js';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { f, parse, z } from '../lib/validate.js';
import { record } from '../lib/audit.js';

// Almacén de credenciales. Los listados nunca incluyen el valor; solo se descifra
// tras confirmar la contraseña, para copiarlo al portapapeles, y queda auditado.

const router = Router();

const fields = {
  label: f.text(150),
  kind: f.oneOf(['password', 'api_key', 'ssh_key', 'database', 'other']).default('password'),
  client_id: f.optId(),
  project_id: f.optId(),
  server_id: f.optId(),
  database_id: f.optId(),
  username: f.optText(200),
  url: f.url(),
  notes: f.optText(2000),
};

const SELECT = `SELECT s.id, s.label, s.kind, s.client_id, s.project_id, s.server_id, s.database_id, s.username, s.url, s.notes,
  s.last_used_at, s.created_at, s.updated_at, c.name AS client_name, p.name AS project_name, sv.name AS server_name, d.name AS database_name
  FROM secrets s LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN projects p ON p.id = s.project_id
  LEFT JOIN servers sv ON sv.id = s.server_id LEFT JOIN databases d ON d.id = s.database_id`;

router.get('/', can('secrets.use'), async (req, res) => {
  const where = [];
  const params = [];
  for (const key of ['client_id', 'project_id', 'server_id', 'database_id']) {
    if (req.query[key]) where.push(`s.${key} = ?`) && params.push(Number(req.query[key]));
  }
  res.json(await (db.all(`${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.label COLLATE NOCASE`, params)));
});

router.post('/', can('secrets.write'), async (req, res) => {
  const data = parse(z.object({ ...fields, value: z.string().min(1, 'Obligatorio').max(20000) }), req.body);
  const { value, ...meta } = data;
  const id = await (tx(async () => {
    const newId = await (insert('secrets', { ...meta, secret_enc: encryptSecret(value), created_by: req.user.id }));
    await (record(req, { action: 'secret.created', entityType: 'secret', entityId: newId, clientId: meta.client_id, label: meta.label, summary: `Credencial guardada: ${meta.label}` }));
    return newId;
  }));
  res.status(201).json(await (db.get(`${SELECT} WHERE s.id = ?`, [id])));
});

router.patch('/:id', can('secrets.write'), async (req, res) => {
  const secret = await (findOr404('secrets', req.params.id, { message: 'Credencial no encontrada' }));
  const data = parse(z.object({ ...fields, value: z.string().min(1).max(20000).optional() }).partial(), req.body);
  const { value, ...meta } = data;
  await (tx(async () => {
    await (update('secrets', secret.id, { ...meta, secret_enc: value ? encryptSecret(value) : undefined }));
    await (record(req, { action: value ? 'secret.rotated' : 'secret.updated', entityType: 'secret', entityId: secret.id, clientId: secret.client_id, label: secret.label, summary: value ? `Credencial actualizada (nuevo valor): ${secret.label}` : `Credencial editada: ${secret.label}` }));
  }));
  res.json(await (db.get(`${SELECT} WHERE s.id = ?`, [secret.id])));
});

router.delete('/:id', can('secrets.write'), async (req, res) => {
  const secret = await (findOr404('secrets', req.params.id, { message: 'Credencial no encontrada' }));
  await confirmPassword(req, req.body?.password);
  await (tx(async () => {
    await (db.run('DELETE FROM secrets WHERE id = ?', [secret.id]));
    await (record(req, { action: 'secret.deleted', entityType: 'secret', entityId: secret.id, clientId: secret.client_id, label: secret.label, summary: `Credencial eliminada: ${secret.label}` }));
  }));
  res.json({ ok: true });
});

router.post('/:id/use', can('secrets.use'), sensitiveLimiter, async (req, res) => {
  const secret = await (findOr404('secrets', req.params.id, { message: 'Credencial no encontrada' }));
  await confirmPassword(req, req.body?.password);
  await (db.run('UPDATE secrets SET last_used_at = ? WHERE id = ?', [nowIso(), secret.id]));
  await (record(req, { action: 'secret.used', entityType: 'secret', entityId: secret.id, clientId: secret.client_id, label: secret.label, summary: `Credencial copiada: ${secret.label}` }));
  res.setHeader('Cache-Control', 'no-store');
  res.json({ value: decryptSecret(secret.secret_enc) });
});

export default router;
