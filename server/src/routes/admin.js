import { Router } from 'express';
import { db, nowIso, tx } from '../db/index.js';
import { can, confirmPassword } from '../middleware/auth.js';
import { findOr404, insert, paginate, update } from '../lib/query.js';
import { f, parse, z } from '../lib/validate.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { record, verifyAuditChain } from '../lib/audit.js';
import { getSetting, setSetting, SETTING_DEFAULTS } from '../lib/settings.js';
import { hashPassword, passwordProblem } from '../lib/password.js';
import { destroyUserSessions } from '../auth/session.js';
import { PERMISSIONS, ROLE_DEFINITIONS } from '../auth/rbac.js';
import { createResetToken } from './auth.js';
import { backupPath, createBackup, listBackups } from '../services/backup.js';
import { clearDemoData, loadDemoData } from '../seed/demo.js';

// Actividad, auditoría, notificaciones, usuarios, configuración, copias de seguridad y datos DEMO.
const router = Router();

// ── Actividad ────────────────────────────────────────────
router.get('/activity', can('activity.read'), (req, res) => {
  const where = [];
  const params = [];
  if (!getSetting('demo').loaded) where.push('x.is_demo = 0');
  if (req.query.entity_type) where.push('x.entity_type = ?') && params.push(String(req.query.entity_type));
  if (req.query.user_id) where.push('x.user_id = ?') && params.push(Number(req.query.user_id));
  if (req.query.client_id) where.push('x.client_id = ?') && params.push(Number(req.query.client_id));
  if (req.query.from) where.push('x.created_at >= ?') && params.push(String(req.query.from));
  if (req.query.to) where.push('x.created_at <= ?') && params.push(`${req.query.to}T23:59:59.999Z`);
  if (req.query.action) where.push('x.action LIKE ?') && params.push(`${String(req.query.action).replace(/[%_]/g, '')}%`);
  res.json(
    paginate(req.query, {
      from: '(SELECT a.*, u.name AS user_name FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id) x',
      where,
      params,
      searchColumns: ['x.summary', 'x.entity_label', 'x.user_name'],
      sortMap: { created_at: 'x.created_at' },
      defaultSort: ['created_at', 'desc'],
      tiebreak: 'x.id DESC',
    }),
  );
});

router.get('/audit', can('audit.read'), (req, res) => {
  res.json(
    paginate(req.query, {
      from: '(SELECT a.id, a.user_id, a.action, a.entity_type, a.entity_id, a.before_data, a.after_data, a.ip, a.created_at, a.hash, u.name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id) x',
      searchColumns: ['x.action', 'x.entity_type', 'x.user_name'],
      sortMap: { created_at: 'x.created_at' },
      defaultSort: ['created_at', 'desc'],
      tiebreak: 'x.id DESC',
    }),
  );
});

router.get('/audit/verify', can('audit.read'), (_req, res) => res.json(verifyAuditChain()));

router.get('/access-logs', can('audit.read'), (req, res) => {
  res.json(
    paginate(req.query, {
      from: '(SELECT l.*, u.name AS user_name FROM access_logs l LEFT JOIN users u ON u.id = l.user_id) x',
      searchColumns: ['x.email', 'x.ip', 'x.event'],
      sortMap: { created_at: 'x.created_at' },
      defaultSort: ['created_at', 'desc'],
      tiebreak: 'x.id DESC',
    }),
  );
});

// ── Notificaciones del usuario ───────────────────────────
router.get('/notifications', (req, res) => {
  res.json({
    unread: db.value('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user.id]),
    items: db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY read_at IS NOT NULL, created_at DESC LIMIT 40', [req.user.id]),
  });
});

router.post('/notifications/read-all', (req, res) => {
  db.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [nowIso(), req.user.id]);
  res.json({ ok: true });
});

router.post('/notifications/:id/read', (req, res) => {
  db.run('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?', [nowIso(), req.params.id, req.user.id]);
  res.json({ ok: true });
});

// ── Usuarios y roles ─────────────────────────────────────
const USER_SELECT = 'SELECT u.id, u.email, u.name, u.status, u.is_owner, u.last_login_at, u.created_at, u.locked_until, r.key AS role, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id';

router.get('/users', can('users.manage'), (_req, res) => res.json(db.all(`${USER_SELECT} ORDER BY u.is_owner DESC, u.name`)));

router.get('/roles', can('users.manage'), (_req, res) => {
  res.json({
    permissions: Object.entries(PERMISSIONS).map(([key, description]) => ({ key, description })),
    roles: Object.entries(ROLE_DEFINITIONS).map(([key, r]) => ({ key, name: r.name, description: r.description, permissions: r.permissions, users: db.value('SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id WHERE r.key = ?', [key]) })),
  });
});

const roleId = (key) => {
  const id = db.value('SELECT id FROM roles WHERE key = ?', [key]);
  if (!id) throw badRequest('Rol no válido', { role: 'Rol no válido' });
  return id;
};

router.post('/users', can('users.manage'), async (req, res) => {
  const data = parse(z.object({ name: f.text(120), email: f.email(), role: f.oneOf(Object.keys(ROLE_DEFINITIONS)), password: z.string().optional() }), req.body);
  if (data.password) {
    const problem = passwordProblem(data.password, data);
    if (problem) throw badRequest(problem, { password: problem });
  }
  const hash = await hashPassword(data.password || crypto.randomUUID() + crypto.randomUUID());
  const result = tx(() => {
    const id = insert('users', { name: data.name, email: data.email, role_id: roleId(data.role), password_hash: hash, password_changed_at: data.password ? nowIso() : null });
    record(req, { action: 'user.created', entityType: 'user', entityId: id, label: data.name, summary: `Usuario creado: ${data.name} (${ROLE_DEFINITIONS[data.role].name})` });
    return { id, reset: data.password ? null : createResetToken(id, req.user.id) };
  });
  res.status(201).json({ user: db.get(`${USER_SELECT} WHERE u.id = ?`, [result.id]), setup_link: result.reset?.url ?? null, expires_minutes: result.reset?.expiresMinutes });
});

router.patch('/users/:id', can('users.manage'), (req, res) => {
  const user = findOr404('users', req.params.id, { message: 'Usuario no encontrado' });
  const data = parse(z.object({ name: f.text(120), role: f.oneOf(Object.keys(ROLE_DEFINITIONS)), status: f.oneOf(['active', 'disabled']) }).partial(), req.body);
  if (user.is_owner && (data.status === 'disabled' || (data.role && data.role !== 'admin'))) throw conflict('El administrador principal no puede desactivarse ni perder el rol de administrador');
  if (user.id === req.user.id && data.status === 'disabled') throw conflict('No puedes desactivar tu propia cuenta');
  tx(() => {
    update('users', user.id, { name: data.name, status: data.status, role_id: data.role ? roleId(data.role) : undefined, ...(data.status === 'active' ? { failed_attempts: 0, locked_until: null } : {}) });
    if (data.status === 'disabled' || data.role) destroyUserSessions(user.id);
    record(req, { action: 'user.updated', entityType: 'user', entityId: user.id, label: user.name, summary: `Usuario actualizado: ${user.name}`, before: { name: user.name, status: user.status, role_id: user.role_id }, after: data });
  });
  res.json(db.get(`${USER_SELECT} WHERE u.id = ?`, [user.id]));
});

router.post('/users/:id/reset-link', can('users.manage'), (req, res) => {
  const user = findOr404('users', req.params.id, { message: 'Usuario no encontrado' });
  const reset = createResetToken(user.id, req.user.id);
  record(req, { action: 'user.reset_link', entityType: 'user', entityId: user.id, label: user.name, summary: `Enlace de restablecimiento generado para ${user.name}` });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ url: reset.url, expires_minutes: reset.expiresMinutes });
});

// ── Configuración ────────────────────────────────────────
const settingSchemas = {
  company: z.object({
    name: f.text(120),
    legal_name: z.string().trim().max(200).default(''),
    tax_id: z.string().trim().max(20).default(''),
    address: z.string().trim().max(250).default(''),
    postal_code: z.string().trim().max(15).default(''),
    city: z.string().trim().max(100).default(''),
    province: z.string().trim().max(100).default(''),
    country: z.string().trim().max(80).default('España'),
    email: z.union([z.literal(''), z.string().trim().email('Email no válido')]).default(''),
    phone: z.string().trim().max(30).default(''),
    website: z.string().trim().max(200).default(''),
    iban: z.string().trim().toUpperCase().regex(/^$|^[A-Z]{2}\d{2}[A-Z0-9 ]{10,32}$/, 'IBAN no válido').default(''),
  }),
  invoicing: z.object({
    currency: z.literal('EUR').default('EUR'),
    tax_rates: z.array(f.pct()).min(1).max(10),
    default_tax_rate: f.pct(),
    withholding_rates: z.array(f.pct()).min(1).max(10),
    default_withholding: f.pct(),
    payment_terms_days: f.int(0, 365),
    footer: z.string().max(2000).default(''),
    verifactu_mode: f.oneOf(['not_configured', 'verifactu', 'no_verifactu']).default('not_configured'),
  }),
  monitoring: z.object({
    default_interval_s: f.int(60, 86400),
    failure_threshold: f.int(1, 20),
    latency_warn_ms: f.int(100, 60000),
    heartbeat_stale_s: f.int(60, 3600),
    cpu_warn_pct: f.int(10, 100),
    ram_warn_pct: f.int(10, 100),
    disk_warn_pct: f.int(10, 100),
    domain_expiry_days: f.int(1, 180),
    ssl_expiry_days: f.int(1, 90),
    results_retention_days: f.int(7, 730),
    metrics_retention_days: f.int(1, 365),
  }),
  automations: z.object({
    payment_due_reminder: f.bool(),
    invoice_overdue: f.bool(),
    server_down: f.bool(),
    domain_expiry: f.bool(),
    alert_to_incident: f.bool(),
    project_status_change: f.bool(),
    task_reminders: f.bool(),
    recurring_generation: f.bool(),
    email_notifications: f.bool(),
    integration_sync_hours: f.int(0, 168),
  }),
};

router.get('/settings', (req, res) => {
  const out = { invoicing: getSetting('invoicing'), company: getSetting('company'), demo: getSetting('demo') };
  if (req.perms.has('settings.manage') || req.perms.has('monitoring.read')) {
    out.monitoring = getSetting('monitoring');
    out.automations = getSetting('automations');
  }
  res.json(out);
});

router.put('/settings/:key', can('settings.manage'), (req, res) => {
  const schema = settingSchemas[req.params.key];
  if (!schema) throw badRequest('Ajuste desconocido');
  const data = parse(schema, { ...SETTING_DEFAULTS[req.params.key], ...req.body });
  if (req.params.key === 'invoicing' && !data.tax_rates.includes(data.default_tax_rate)) throw badRequest('El IVA por defecto debe estar en la lista', { default_tax_rate: 'No está en la lista' });
  const before = getSetting(req.params.key);
  const saved = setSetting(req.params.key, data, req.user.id);
  record(req, { action: 'settings.updated', entityType: 'settings', label: req.params.key, summary: `Configuración actualizada: ${{ company: 'empresa', invoicing: 'facturación', monitoring: 'umbrales de monitorización', automations: 'automatizaciones' }[req.params.key]}`, before, after: data });
  res.json(saved);
});

// ── Copias de seguridad ──────────────────────────────────
router.get('/backups', can('backups.manage'), (_req, res) => {
  res.json({ backups: listBackups(), last_jobs: db.all("SELECT job, status, started_at, finished_at, details FROM job_runs WHERE job IN ('maintenance', 'automations', 'integrations') ORDER BY id DESC LIMIT 10") });
});

router.post('/backups', can('backups.manage'), (req, res) => {
  const backup = createBackup();
  record(req, { action: 'backup.created', entityType: 'backup', label: backup.name, summary: `Copia de seguridad creada: ${backup.name}` });
  res.status(201).json(backup);
});

router.get('/backups/:name/download', can('backups.manage'), (req, res) => {
  const file = backupPath(req.params.name);
  if (!file) throw notFound('Copia no encontrada');
  record(req, { action: 'backup.downloaded', entityType: 'backup', label: req.params.name, summary: `Copia de seguridad descargada: ${req.params.name}` });
  res.setHeader('Cache-Control', 'no-store');
  res.download(file, req.params.name);
});

// ── Datos DEMO ───────────────────────────────────────────
router.post('/demo/load', can('backups.manage'), (req, res) => {
  if (getSetting('demo').loaded) throw conflict('Los datos DEMO ya están cargados');
  const summary = loadDemoData(req);
  res.json(summary);
});

router.post('/demo/clear', can('backups.manage'), async (req, res) => {
  await confirmPassword(req, req.body?.password);
  const summary = clearDemoData(req);
  res.json(summary);
});

export default router;
