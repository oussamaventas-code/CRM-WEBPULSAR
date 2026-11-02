import { Router } from 'express';
import { db, nowIso, tx } from '../db/index.js';
import { can } from '../middleware/auth.js';
import { findOr404, insert, paginate, update } from '../lib/query.js';
import { f, parse, z } from '../lib/validate.js';
import { badRequest, notFound } from '../lib/errors.js';
import { record } from '../lib/audit.js';
import { notify } from '../lib/notify.js';

const router = Router();
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'investigating', 'in_progress', 'pending', 'resolved', 'closed'];
const CLOSED = new Set(['resolved', 'closed']);
const LABEL = { open: 'Abierta', investigating: 'En investigación', in_progress: 'En progreso', pending: 'Pendiente', resolved: 'Resuelta', closed: 'Cerrada' };
const PRIORITY_LABEL = { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica' };

const fields = {
  title: f.text(200),
  description: f.optText(10000),
  category: f.oneOf(['infrastructure', 'application', 'billing', 'support', 'security', 'other']).default('infrastructure'),
  client_id: f.optId(),
  project_id: f.optId(),
  server_id: f.optId(),
  domain_id: f.optId(),
  database_id: f.optId(),
  priority: f.oneOf(PRIORITIES).default('medium'),
  status: f.oneOf(STATUSES).default('open'),
  assignee_user_id: f.optId(),
  opened_at: z.string().datetime({ offset: true }).optional(),
  resolution: f.optText(5000),
};

const FROM = `(SELECT i.*, c.name AS client_name, p.name AS project_name, s.name AS server_name, d.name AS domain_name, u.name AS assignee_name
  FROM incidents i LEFT JOIN clients c ON c.id = i.client_id LEFT JOIN projects p ON p.id = i.project_id
  LEFT JOIN servers s ON s.id = i.server_id LEFT JOIN domains d ON d.id = i.domain_id LEFT JOIN users u ON u.id = i.assignee_user_id) x`;

router.get('/', can('incidents.read'), async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.view === 'inbox' || !req.query.view) where.push("x.status NOT IN ('resolved', 'closed')");
  if (req.query.view === 'history') where.push("x.status IN ('resolved', 'closed')");
  if (PRIORITIES.includes(req.query.priority)) where.push('x.priority = ?') && params.push(req.query.priority);
  if (STATUSES.includes(req.query.status)) where.push('x.status = ?') && params.push(req.query.status);
  if (req.query.client_id) where.push('x.client_id = ?') && params.push(Number(req.query.client_id));
  if (req.query.project_id) where.push('x.project_id = ?') && params.push(Number(req.query.project_id));
  if (req.query.server_id) where.push('x.server_id = ?') && params.push(Number(req.query.server_id));
  if (req.query.mine === '1') where.push('x.assignee_user_id = ?') && params.push(req.user.id);
  res.json(
    await (paginate(req.query, {
      from: FROM,
      where,
      params,
      searchColumns: ['x.title', 'x.description', 'x.client_name', 'x.server_name', 'x.domain_name'],
      sortMap: {
        priority: "CASE x.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END",
        opened_at: 'x.opened_at',
        status: 'x.status',
        updated_at: 'x.updated_at',
        resolved_at: 'x.resolved_at',
      },
      defaultSort: req.query.view === 'history' ? ['resolved_at', 'desc'] : ['priority', 'asc'],
      tiebreak: 'x.opened_at DESC',
    })),
  );
});

const load = async (id) => await (db.get(`SELECT * FROM ${FROM} WHERE x.id = ?`, [id]));

router.get('/:id', can('incidents.read'), async (req, res) => {
  const incident = await (load(req.params.id));
  if (!incident) throw notFound('Incidencia no encontrada');
  res.json({
    incident,
    events: await (db.all('SELECT e.*, u.name AS user_name FROM incident_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.incident_id = ? ORDER BY e.created_at, e.id', [incident.id])),
    alerts: await (db.all('SELECT id, title, severity, status, opened_at, resolved_at FROM monitoring_alerts WHERE incident_id = ?', [incident.id])),
  });
});

router.post('/', can('incidents.write'), async (req, res) => {
  const data = parse(z.object(fields), req.body);
  const id = await (tx(async () => {
    const opened = data.opened_at ?? nowIso();
    const newId = await (insert('incidents', {
      ...data,
      opened_at: opened,
      resolved_at: CLOSED.has(data.status) ? nowIso() : null,
      closed_at: data.status === 'closed' ? nowIso() : null,
      created_by: req.user.id,
    }));
    await (insert('incident_events', { incident_id: newId, user_id: req.user.id, type: 'created', body: data.description ?? null }));
    await (record(req, { action: 'incident.created', entityType: 'incident', entityId: newId, clientId: data.client_id, label: data.title, summary: `Incidencia ${PRIORITY_LABEL[data.priority].toLowerCase()}: ${data.title}` }));
    if (data.priority === 'critical' || (data.assignee_user_id && data.assignee_user_id !== req.user.id)) {
      await (notify({
        userIds: data.priority === 'critical' ? undefined : [data.assignee_user_id],
        excludeUserId: req.user.id,
        type: 'incident.created',
        title: `${data.priority === 'critical' ? 'Incidencia crítica' : 'Incidencia asignada'}: ${data.title}`,
        severity: data.priority === 'critical' ? 'critical' : 'warning',
        entityType: 'incident',
        entityId: newId,
        link: `/incidencias/${newId}`,
      }));
    }
    return newId;
  }));
  res.status(201).json(await (load(id)));
});

router.patch('/:id', can('incidents.write'), async (req, res) => {
  const before = await (findOr404('incidents', req.params.id, { message: 'Incidencia no encontrada' }));
  const data = parse(z.object(fields).partial(), req.body);
  if (data.status === 'resolved' && !(data.resolution ?? before.resolution)) throw badRequest('Describe la resolución antes de marcarla como resuelta', { resolution: 'Obligatorio al resolver' });
  await (tx(async () => {
    const changes = { ...data };
    if (data.status && data.status !== before.status) {
      if (CLOSED.has(data.status) && !before.resolved_at) changes.resolved_at = nowIso();
      if (data.status === 'closed') changes.closed_at = nowIso();
      if (!CLOSED.has(data.status)) Object.assign(changes, { resolved_at: null, closed_at: null });
      await (insert('incident_events', { incident_id: before.id, user_id: req.user.id, type: 'status_change', from_value: before.status, to_value: data.status, body: data.status === 'resolved' ? data.resolution ?? before.resolution : null }));
    }
    if (data.priority && data.priority !== before.priority) await (insert('incident_events', { incident_id: before.id, user_id: req.user.id, type: 'priority_change', from_value: before.priority, to_value: data.priority }));
    if ('assignee_user_id' in data && data.assignee_user_id !== before.assignee_user_id) {
      const name = data.assignee_user_id ? await (db.value('SELECT name FROM users WHERE id = ?', [data.assignee_user_id])) : 'nadie';
      await (insert('incident_events', { incident_id: before.id, user_id: req.user.id, type: 'assignment', to_value: name }));
      if (data.assignee_user_id && data.assignee_user_id !== req.user.id) {
        await (notify({ userIds: [data.assignee_user_id], type: 'incident.assigned', title: `Incidencia asignada: ${before.title}`, severity: 'warning', entityType: 'incident', entityId: before.id, link: `/incidencias/${before.id}` }));
      }
    }
    await (update('incidents', before.id, changes));
    const resolvedNow = data.status === 'resolved' && before.status !== 'resolved';
    await (record(req, {
      action: resolvedNow ? 'incident.resolved' : data.status && data.status !== before.status ? 'incident.status_changed' : 'incident.updated',
      entityType: 'incident',
      entityId: before.id,
      clientId: data.client_id ?? before.client_id,
      label: before.title,
      summary: resolvedNow ? `Incidencia resuelta: ${before.title}` : data.status && data.status !== before.status ? `Incidencia ${before.title}: ${LABEL[before.status]} → ${LABEL[data.status]}` : `Incidencia actualizada: ${before.title}`,
      before,
      after: data,
    }));
  }));
  res.json(await (load(before.id)));
});

router.post('/:id/comments', can('incidents.write'), async (req, res) => {
  const incident = await (findOr404('incidents', req.params.id, { message: 'Incidencia no encontrada' }));
  const { body } = parse(z.object({ body: f.text(10000) }), req.body);
  await (tx(async () => {
    await (insert('incident_events', { incident_id: incident.id, user_id: req.user.id, type: 'comment', body }));
    await (db.run('UPDATE incidents SET updated_at = ? WHERE id = ?', [nowIso(), incident.id]));
  }));
  res.status(201).json(await (db.all('SELECT e.*, u.name AS user_name FROM incident_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.incident_id = ? ORDER BY e.created_at, e.id', [incident.id])));
});

export default router;
