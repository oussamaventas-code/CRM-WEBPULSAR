import { Router } from 'express';
import { db, nowIso, tx } from '../db/index.js';
import { can } from '../middleware/auth.js';
import { findOr404, insert, update } from '../lib/query.js';
import { f, parse, z } from '../lib/validate.js';
import { badRequest, conflict } from '../lib/errors.js';
import { record } from '../lib/audit.js';
import { getSetting } from '../lib/settings.js';
import { createIncidentFromAlert, evaluateEntity, executeCheck, uptime, uptimeBars } from '../services/monitoring.js';

const router = Router();
const TYPES = ['http', 'tcp', 'heartbeat', 'domain_expiry', 'ssl_expiry', 'integration', 'd1_query'];
const ENTITIES = ['server', 'domain', 'database', 'application', 'integration'];

const checkSchema = z
  .object({
    name: f.text(150),
    type: f.oneOf(TYPES),
    target: f.optText(500),
    entity_type: f.optOneOf(ENTITIES),
    entity_id: f.optId(),
    interval_s: f.int(30, 86400).optional(),
    timeout_ms: f.int(1000, 60000).default(10000),
    expected_status: z.string().trim().regex(/^\d{3}(-\d{3})?(,\s*\d{3}(-\d{3})?)*$/, 'Formato: 200-399 o 200,301').default('200-399'),
    keyword: f.optText(200),
    failure_threshold: f.int(1, 20).optional(),
    latency_warn_ms: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().min(50).max(60000).nullable()).optional(),
    enabled: f.bool().default(true),
  })
  .superRefine((d, ctx) => {
    if (d.type === 'http' && !/^https?:\/\/[^\s]+$/i.test(d.target ?? '')) ctx.addIssue({ code: 'custom', path: ['target'], message: 'Introduce una URL http(s) completa' });
    if (d.type === 'tcp' && !/^[\w.-]+:\d{1,5}$/.test(d.target ?? '')) ctx.addIssue({ code: 'custom', path: ['target'], message: 'Formato host:puerto' });
    if (d.type === 'ssl_expiry' && !/^[\w.-]+(:\d{1,5})?$/.test(d.target ?? '')) ctx.addIssue({ code: 'custom', path: ['target'], message: 'Introduce el dominio (ej. ejemplo.com)' });
    if (d.type === 'integration' && !['hostinger', 'cloudflare'].includes(d.target)) ctx.addIssue({ code: 'custom', path: ['target'], message: 'hostinger o cloudflare' });
    if (['heartbeat', 'domain_expiry', 'd1_query'].includes(d.type) && !(d.entity_type && d.entity_id)) ctx.addIssue({ code: 'custom', path: ['entity_id'], message: 'Selecciona el recurso' });
    if (d.type === 'heartbeat' && d.entity_type !== 'server') ctx.addIssue({ code: 'custom', path: ['entity_type'], message: 'El heartbeat es de un servidor' });
    if (d.type === 'd1_query' && d.entity_type !== 'database') ctx.addIssue({ code: 'custom', path: ['entity_type'], message: 'La consulta D1 es de una base de datos' });
  });

const ENTITY_NAME_SQL = `CASE c.entity_type
  WHEN 'server' THEN (SELECT name FROM servers WHERE id = c.entity_id)
  WHEN 'domain' THEN (SELECT name FROM domains WHERE id = c.entity_id)
  WHEN 'database' THEN (SELECT name FROM databases WHERE id = c.entity_id)
  WHEN 'application' THEN (SELECT name FROM applications WHERE id = c.entity_id) END`;

router.get('/checks', can('monitoring.read'), async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.entity_type) where.push('c.entity_type = ?') && params.push(String(req.query.entity_type));
  if (req.query.entity_id) where.push('c.entity_id = ?') && params.push(Number(req.query.entity_id));
  const rows = await (db.all(`SELECT c.*, ${ENTITY_NAME_SQL} AS entity_name FROM monitoring_checks c ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY CASE c.last_status WHEN 'down' THEN 0 WHEN 'degraded' THEN 1 WHEN 'unknown' THEN 2 ELSE 3 END, c.name`, params));
  res.json(await Promise.all(rows.map(async (c) => ({ ...c, uptime_24h: await uptime(c.id, 24), uptime_7d: await uptime(c.id, 168), uptime_30d: await uptime(c.id, 720), bars: await uptimeBars(c.id, 48) }))));
});

router.get('/checks/:id/results', can('monitoring.read'), async (req, res) => {
  const check = await (findOr404('monitoring_checks', req.params.id, { message: 'Comprobación no encontrada' }));
  const hours = { '24h': 24, '7d': 168, '30d': 720 }[req.query.range] ?? 24;
  res.json(await (db.all('SELECT status, latency_ms, status_code, message, checked_at FROM monitoring_results WHERE check_id = ? AND checked_at >= ? ORDER BY checked_at', [check.id, new Date(Date.now() - hours * 3600_000).toISOString()])));
});

router.post('/checks', can('monitoring.write'), async (req, res) => {
  const data = parse(checkSchema, req.body);
  const m = await (getSetting('monitoring'));
  const id = await (tx(async () => {
    const newId = await (insert('monitoring_checks', { ...data, interval_s: data.interval_s ?? m.default_interval_s, failure_threshold: data.failure_threshold ?? m.failure_threshold, created_by: req.user.id }));
    await (record(req, { action: 'check.created', entityType: 'check', entityId: newId, label: data.name, summary: `Comprobación creada: ${data.name}` }));
    return newId;
  }));
  const check = await (db.get('SELECT * FROM monitoring_checks WHERE id = ?', [id]));
  if (check.enabled) await executeCheck(check, req);
  res.status(201).json(await (db.get('SELECT * FROM monitoring_checks WHERE id = ?', [id])));
});

router.patch('/checks/:id', can('monitoring.write'), async (req, res) => {
  const before = await (findOr404('monitoring_checks', req.params.id, { message: 'Comprobación no encontrada' }));
  const data = parse(checkSchema.innerType().partial(), req.body);
  await (tx(async () => {
    await (update('monitoring_checks', before.id, data));
    await (record(req, { action: 'check.updated', entityType: 'check', entityId: before.id, label: before.name, summary: `Comprobación actualizada: ${before.name}`, before, after: data }));
  }));
  if (before.entity_type) await (evaluateEntity(before.entity_type, before.entity_id));
  res.json(await (db.get('SELECT * FROM monitoring_checks WHERE id = ?', [before.id])));
});

router.delete('/checks/:id', can('monitoring.write'), async (req, res) => {
  const check = await (findOr404('monitoring_checks', req.params.id, { message: 'Comprobación no encontrada' }));
  await (tx(async () => {
    await (db.run("UPDATE monitoring_alerts SET status = 'resolved', resolved_at = ? WHERE check_id = ? AND status <> 'resolved'", [nowIso(), check.id]));
    await (db.run('DELETE FROM monitoring_checks WHERE id = ?', [check.id]));
    await (record(req, { action: 'check.deleted', entityType: 'check', entityId: check.id, label: check.name, summary: `Comprobación eliminada: ${check.name}` }));
  }));
  if (check.entity_type) await (evaluateEntity(check.entity_type, check.entity_id));
  res.json({ ok: true });
});

router.post('/checks/:id/run', can('monitoring.write'), async (req, res) => {
  const check = await (findOr404('monitoring_checks', req.params.id, { message: 'Comprobación no encontrada' }));
  const result = await executeCheck(check, req);
  res.json({ result, check: await (db.get('SELECT * FROM monitoring_checks WHERE id = ?', [check.id])) });
});

// ── Alertas ──────────────────────────────────────────────
router.get('/alerts', can('monitoring.read'), async (req, res) => {
  const status = req.query.status === 'resolved' ? "a.status = 'resolved'" : req.query.status === 'all' ? '1 = 1' : "a.status <> 'resolved'";
  res.json(
    await (db.all(
      `SELECT a.*, u.name AS acknowledged_by_name, i.title AS incident_title, i.status AS incident_status FROM monitoring_alerts a
       LEFT JOIN users u ON u.id = a.acknowledged_by LEFT JOIN incidents i ON i.id = a.incident_id
       WHERE ${status} ORDER BY a.status = 'resolved', a.severity = 'critical' DESC, a.last_seen_at DESC LIMIT 200`,
    )),
  );
});

router.post('/alerts/:id/ack', can('monitoring.write'), async (req, res) => {
  const alert = await (findOr404('monitoring_alerts', req.params.id, { message: 'Alerta no encontrada' }));
  if (alert.status !== 'open') throw conflict('La alerta no está abierta');
  await (db.run("UPDATE monitoring_alerts SET status = 'acknowledged', acknowledged_at = ?, acknowledged_by = ? WHERE id = ?", [nowIso(), req.user.id, alert.id]));
  await (record(req, { action: 'alert.acknowledged', entityType: 'alert', entityId: alert.id, label: alert.title, summary: `Alerta reconocida: ${alert.title}` }));
  res.json(await (db.get('SELECT * FROM monitoring_alerts WHERE id = ?', [alert.id])));
});

router.post('/alerts/:id/resolve', can('monitoring.write'), async (req, res) => {
  const alert = await (findOr404('monitoring_alerts', req.params.id, { message: 'Alerta no encontrada' }));
  if (alert.status === 'resolved') throw conflict('La alerta ya está resuelta');
  await (db.run("UPDATE monitoring_alerts SET status = 'resolved', resolved_at = ? WHERE id = ?", [nowIso(), alert.id]));
  await (record(req, { action: 'alert.resolved', entityType: 'alert', entityId: alert.id, label: alert.title, summary: `Alerta cerrada manualmente: ${alert.title}` }));
  res.json(await (db.get('SELECT * FROM monitoring_alerts WHERE id = ?', [alert.id])));
});

router.post('/alerts/:id/incident', can('incidents.write'), async (req, res) => {
  const alert = await (findOr404('monitoring_alerts', req.params.id, { message: 'Alerta no encontrada' }));
  if (alert.incident_id) throw badRequest('La alerta ya tiene una incidencia');
  const incidentId = await (tx(async () => await (createIncidentFromAlert(req, alert.id, { userId: req.user.id }))));
  res.status(201).json({ incident_id: incidentId });
});

export default router;
