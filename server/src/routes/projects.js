import { Router } from 'express';
import { db, nowIso, tx } from '../db/index.js';
import { can } from '../middleware/auth.js';
import { findOr404, insert, paginate, update } from '../lib/query.js';
import { f, parse, z } from '../lib/validate.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { record } from '../lib/audit.js';
import { notify } from '../lib/notify.js';
import { getSetting } from '../lib/settings.js';
import { sqlBilled, sqlCollected, sqlOutstanding } from '../services/finance.js';
import { normalizeRepo } from './github.js';

const router = Router();

export const PROJECT_TYPES = ['website', 'ecommerce', 'crm', 'webapp', 'custom_software', 'automation', 'api_integration', 'maintenance', 'infrastructure', 'other'];
export const PROJECT_STATUSES = ['quote', 'pending_approval', 'approved', 'in_development', 'in_review', 'waiting_client', 'finished', 'delivered', 'cancelled'];
const STATUS_LABEL = {
  quote: 'Presupuesto',
  pending_approval: 'Pendiente de aprobación',
  approved: 'Aprobado',
  in_development: 'En desarrollo',
  in_review: 'En revisión',
  waiting_client: 'Pendiente del cliente',
  finished: 'Finalizado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};
const DONE = new Set(['finished', 'delivered']);

const projectFields = {
  client_id: f.id(),
  name: f.text(150),
  type: f.oneOf(PROJECT_TYPES),
  description: f.optText(10000),
  owner_user_id: f.optId(),
  start_date: f.optDate(),
  due_date: f.optDate(),
  budget_cents: f.cents().default(0),
  status: f.oneOf(PROJECT_STATUSES).default('quote'),
  progress: f.int(0, 100).optional(),
  progress_mode: f.oneOf(['tasks', 'manual']).default('tasks'),
  github_repo: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().trim().transform((v) => normalizeRepo(v)).refine(Boolean, 'Usa el formato owner/repositorio o la URL de GitHub').nullable()).optional(),
  preview_url: f.url(),
};
const datesCheck = (d, ctx) => {
  if (d.start_date && d.due_date && d.due_date < d.start_date) ctx.addIssue({ code: 'custom', path: ['due_date'], message: 'La entrega no puede ser anterior al inicio' });
};

const LIST_FROM = `(
  SELECT p.*, c.name AS client_name, c.company AS client_company, u.name AS owner_name,
    (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id) AS tasks_total,
    (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.status = 'done') AS tasks_done
  FROM projects p JOIN clients c ON c.id = p.client_id LEFT JOIN users u ON u.id = p.owner_user_id
  WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL
) x`;

router.get('/', can('projects.read'), (req, res) => {
  const where = [];
  const params = [];
  if (req.query.status) {
    const statuses = String(req.query.status).split(',').filter((s) => PROJECT_STATUSES.includes(s));
    if (statuses.length) where.push(`x.status IN (${statuses.map(() => '?').join(', ')})`) && params.push(...statuses);
  }
  if (req.query.open === '1') where.push("x.status NOT IN ('finished', 'delivered', 'cancelled')");
  if (req.query.client_id) where.push('x.client_id = ?') && params.push(Number(req.query.client_id));
  if (PROJECT_TYPES.includes(req.query.type)) where.push('x.type = ?') && params.push(req.query.type);
  if (req.query.owner_user_id) where.push('x.owner_user_id = ?') && params.push(Number(req.query.owner_user_id));
  res.json(
    paginate(req.query, {
      from: LIST_FROM,
      where,
      params,
      searchColumns: ['x.name', 'x.client_name', 'x.client_company', 'x.description'],
      sortMap: { name: 'x.name COLLATE NOCASE', client: 'x.client_name COLLATE NOCASE', due_date: 'x.due_date', start_date: 'x.start_date', budget: 'x.budget_cents', progress: 'x.progress', status: 'x.status', created_at: 'x.created_at', updated_at: 'x.updated_at' },
      defaultSort: ['updated_at', 'desc'],
      tiebreak: 'x.id DESC',
    }),
  );
});

function loadProject(id) {
  const p = db.get(
    `SELECT p.*, c.name AS client_name, c.company AS client_company, u.name AS owner_name FROM projects p
     JOIN clients c ON c.id = p.client_id LEFT JOIN users u ON u.id = p.owner_user_id WHERE p.id = ? AND p.deleted_at IS NULL`,
    [id],
  );
  if (!p) throw notFound('Proyecto no encontrado');
  return p;
}

router.get('/:id', can('projects.read'), (req, res) => {
  const project = loadProject(req.params.id);
  const id = project.id;
  const finance = req.perms.has('finance.read')
    ? db.get(`SELECT ${sqlBilled('?', 'project_id')} AS billed_cents, ${sqlCollected('?', 'project_id')} AS collected_cents, ${sqlOutstanding('?', 'project_id')} AS pending_cents`, [id, id, id, id, id])
    : null;
  const infra = req.perms.has('infrastructure.read')
    ? {
        servers: db.all('SELECT id, name, ipv4, status FROM servers WHERE project_id = ? OR id IN (SELECT server_id FROM applications WHERE project_id = ? AND server_id IS NOT NULL)', [id, id]),
        domains: db.all('SELECT id, name, status, expires_at FROM domains WHERE project_id = ?', [id]),
        applications: db.all('SELECT id, name, kind, url, status FROM applications WHERE project_id = ?', [id]),
        databases: db.all('SELECT id, name, engine, environment, status FROM databases WHERE project_id = ?', [id]),
      }
    : null;
  res.json({
    project,
    finance,
    infrastructure: infra,
    services: db.all('SELECT cs.id, s.name, cs.price_cents, cs.billing_period, cs.status FROM client_services cs JOIN services s ON s.id = cs.service_id WHERE cs.project_id = ?', [id]),
    documents_count: db.value('SELECT COUNT(*) FROM documents WHERE project_id = ? AND deleted_at IS NULL', [id]),
    open_incidents: db.value("SELECT COUNT(*) FROM incidents WHERE project_id = ? AND status NOT IN ('resolved', 'closed')", [id]),
  });
});

router.get('/:id/history', can('projects.read'), (req, res) => {
  const project = loadProject(req.params.id);
  res.json(
    db.all(
      `SELECT a.id, a.action, a.summary, a.created_at, u.name AS user_name FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
       WHERE (a.entity_type = 'project' AND a.entity_id = ?) OR (a.entity_type = 'task' AND json_extract(a.data, '$.project_id') = ?)
       ORDER BY a.id DESC LIMIT 200`,
      [project.id, project.id],
    ),
  );
});

function assertClient(clientId) {
  const ok = db.value("SELECT 1 FROM clients WHERE id = ? AND deleted_at IS NULL AND status <> 'archived'", [clientId]);
  if (!ok) throw badRequest('Selecciona un cliente activo', { client_id: 'Cliente no válido o archivado' });
}

router.post('/', can('projects.write'), (req, res) => {
  const data = parse(z.object(projectFields).superRefine(datesCheck), req.body);
  assertClient(data.client_id);
  const id = tx(() => {
    const newId = insert('projects', {
      ...data,
      progress: data.progress_mode === 'manual' ? data.progress ?? 0 : 0,
      completed_at: DONE.has(data.status) ? nowIso() : null,
      created_by: req.user.id,
    });
    record(req, { action: 'project.created', entityType: 'project', entityId: newId, clientId: data.client_id, label: data.name, summary: `Proyecto creado: ${data.name}`, after: data });
    return newId;
  });
  res.status(201).json(loadProject(id));
});

router.patch('/:id', can('projects.write'), (req, res) => {
  const before = loadProject(req.params.id);
  const data = parse(z.object(projectFields).partial().superRefine(datesCheck), { start_date: before.start_date, due_date: before.due_date, ...req.body });
  if (data.client_id && data.client_id !== before.client_id) assertClient(data.client_id);
  const statusChanged = data.status && data.status !== before.status;
  tx(() => {
    const changes = { ...data };
    if (statusChanged) changes.completed_at = DONE.has(data.status) ? before.completed_at ?? nowIso() : null;
    if ((data.progress_mode ?? before.progress_mode) === 'tasks') delete changes.progress;
    update('projects', before.id, changes);
    if ((data.progress_mode ?? before.progress_mode) === 'tasks') recomputeProgress(before.id);
    record(req, {
      action: statusChanged ? 'project.status_changed' : 'project.updated',
      entityType: 'project',
      entityId: before.id,
      clientId: data.client_id ?? before.client_id,
      label: before.name,
      summary: statusChanged ? `${before.name}: ${STATUS_LABEL[before.status]} → ${STATUS_LABEL[data.status]}` : `Proyecto actualizado: ${before.name}`,
      before: Object.fromEntries(Object.keys(data).map((k) => [k, before[k]])),
      after: data,
    });
    if (statusChanged && getSetting('automations').project_status_change) {
      notify({
        excludeUserId: req.user.id,
        type: 'project.status_changed',
        title: `Proyecto ${before.name}: ${STATUS_LABEL[data.status]}`,
        body: `${req.user.name} cambió el estado de ${STATUS_LABEL[before.status]} a ${STATUS_LABEL[data.status]}.`,
        entityType: 'project',
        entityId: before.id,
        link: `/proyectos/${before.id}`,
      });
    }
  });
  res.json(loadProject(before.id));
});

router.delete('/:id', can('projects.delete'), (req, res) => {
  const project = loadProject(req.params.id);
  const linked = db.value('SELECT (SELECT COUNT(*) FROM invoices WHERE project_id = ?) + (SELECT COUNT(*) FROM payments WHERE project_id = ?)', [project.id, project.id]);
  if (linked > 0) throw conflict('El proyecto tiene facturas o cobros asociados. Cámbialo a "Cancelado" para conservar el historial.');
  tx(() => {
    db.run('UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), project.id]);
    record(req, { action: 'project.deleted', entityType: 'project', entityId: project.id, clientId: project.client_id, label: project.name, summary: `Proyecto eliminado: ${project.name}`, before: project });
  });
  res.json({ ok: true });
});

// ── Tareas ────────────────────────────────────────────────
export function recomputeProgress(projectId) {
  const p = db.get('SELECT progress_mode FROM projects WHERE id = ?', [projectId]);
  if (p?.progress_mode !== 'tasks') return;
  const { total, done } = db.get("SELECT COUNT(*) AS total, COUNT(CASE WHEN status = 'done' THEN 1 END) AS done FROM project_tasks WHERE project_id = ?", [projectId]);
  db.run('UPDATE projects SET progress = ? WHERE id = ?', [total ? Math.round((done / total) * 100) : 0, projectId]);
}

const taskFields = {
  title: f.text(200),
  description: f.optText(5000),
  assignee_user_id: f.optId(),
  priority: f.oneOf(['low', 'medium', 'high', 'critical']).default('medium'),
  due_date: f.optDate(),
  status: f.oneOf(['todo', 'in_progress', 'review', 'done']).default('todo'),
  position: f.int(0, 100000).optional(),
};

const TASK_SELECT = `SELECT t.*, u.name AS assignee_name, (SELECT COUNT(*) FROM task_comments c WHERE c.task_id = t.id) AS comments_count
  FROM project_tasks t LEFT JOIN users u ON u.id = t.assignee_user_id`;

router.get('/:id/tasks', can('projects.read'), (req, res) => {
  const project = loadProject(req.params.id);
  res.json(db.all(`${TASK_SELECT} WHERE t.project_id = ? ORDER BY t.status, t.position, t.id`, [project.id]));
});

router.post('/:id/tasks', can('projects.write'), (req, res) => {
  const project = loadProject(req.params.id);
  const data = parse(z.object(taskFields), req.body);
  const id = tx(() => {
    const position = data.position ?? (db.value('SELECT COALESCE(MAX(position), 0) + 1 FROM project_tasks WHERE project_id = ?', [project.id]) || 0);
    const newId = insert('project_tasks', { ...data, position, project_id: project.id, completed_at: data.status === 'done' ? nowIso() : null, created_by: req.user.id });
    recomputeProgress(project.id);
    record(req, { action: 'task.created', entityType: 'task', entityId: newId, clientId: project.client_id, label: data.title, summary: `Tarea creada en ${project.name}: ${data.title}`, data: { project_id: project.id } });
    return newId;
  });
  res.status(201).json(db.get(`${TASK_SELECT} WHERE t.id = ?`, [id]));
});

function loadTask(id) {
  const task = db.get('SELECT t.*, p.client_id, p.name AS project_name FROM project_tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ? AND p.deleted_at IS NULL', [id]);
  if (!task) throw notFound('Tarea no encontrada');
  return task;
}

export const taskRouter = Router();

taskRouter.get('/mine', can('projects.read'), (req, res) => {
  res.json(
    db.all(
      `${TASK_SELECT.replace('FROM project_tasks t', ', p.name AS project_name FROM project_tasks t JOIN projects p ON p.id = t.project_id')}
       WHERE t.assignee_user_id = ? AND t.status <> 'done' AND p.deleted_at IS NULL ORDER BY t.due_date IS NULL, t.due_date LIMIT 50`,
      [req.user.id],
    ),
  );
});

taskRouter.patch('/:taskId', can('projects.write'), (req, res) => {
  const task = loadTask(req.params.taskId);
  const data = parse(z.object(taskFields).partial(), req.body);
  tx(() => {
    const changes = { ...data };
    if (data.status && data.status !== task.status) changes.completed_at = data.status === 'done' ? nowIso() : null;
    update('project_tasks', task.id, changes);
    recomputeProgress(task.project_id);
    const statusChanged = data.status && data.status !== task.status;
    record(req, {
      action: statusChanged ? 'task.status_changed' : 'task.updated',
      entityType: 'task',
      entityId: task.id,
      clientId: task.client_id,
      label: task.title,
      summary: statusChanged && data.status === 'done' ? `Tarea completada: ${task.title}` : `Tarea actualizada: ${task.title}`,
      data: { project_id: task.project_id },
    });
    if (data.assignee_user_id && data.assignee_user_id !== task.assignee_user_id && data.assignee_user_id !== req.user.id) {
      notify({ userIds: [data.assignee_user_id], type: 'task.assigned', title: `Nueva tarea asignada: ${task.title}`, body: `Proyecto ${task.project_name}`, entityType: 'project', entityId: task.project_id, link: `/proyectos/${task.project_id}` });
    }
  });
  res.json(db.get(`${TASK_SELECT} WHERE t.id = ?`, [task.id]));
});

taskRouter.delete('/:taskId', can('projects.write'), (req, res) => {
  const task = loadTask(req.params.taskId);
  tx(() => {
    db.run('DELETE FROM project_tasks WHERE id = ?', [task.id]);
    recomputeProgress(task.project_id);
    record(req, { action: 'task.deleted', entityType: 'task', entityId: task.id, clientId: task.client_id, label: task.title, summary: `Tarea eliminada: ${task.title}`, data: { project_id: task.project_id }, before: task });
  });
  res.json({ ok: true });
});

taskRouter.get('/:taskId/comments', can('projects.read'), (req, res) => {
  const task = loadTask(req.params.taskId);
  res.json(db.all('SELECT c.*, u.name AS user_name FROM task_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.task_id = ? ORDER BY c.created_at', [task.id]));
});

taskRouter.post('/:taskId/comments', can('projects.write'), (req, res) => {
  const task = loadTask(req.params.taskId);
  const { body } = parse(z.object({ body: f.text(5000) }), req.body);
  const id = insert('task_comments', { task_id: task.id, user_id: req.user.id, body });
  if (task.assignee_user_id && task.assignee_user_id !== req.user.id) {
    notify({ userIds: [task.assignee_user_id], type: 'task.comment', title: `Comentario en "${task.title}"`, body: body.slice(0, 140), entityType: 'project', entityId: task.project_id, link: `/proyectos/${task.project_id}` });
  }
  res.status(201).json(db.get('SELECT c.*, u.name AS user_name FROM task_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = ?', [id]));
});

export default router;
