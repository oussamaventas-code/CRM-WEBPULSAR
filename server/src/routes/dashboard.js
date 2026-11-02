import { Router } from 'express';
import { db } from '../db/index.js';
import { addMonths, monthStart, today } from '../lib/dates.js';
import { escapeLike } from '../lib/query.js';
import { getSetting } from '../lib/settings.js';
import { financeTotals } from '../services/finance.js';

const router = Router();

const delta = (current, previous) => ({ current, previous, change: previous ? Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10 : null });

/** Indicadores principales calculados desde la base de datos. Cada bloque respeta los permisos. */
router.get('/dashboard', async (req, res) => {
  const can = (p) => req.perms.has(p);
  const t = today();
  const m0 = monthStart(t);
  const prevStart = addMonths(m0, -1);
  const prevSameDay = addMonths(t, -1);
  const out = { generated_at: new Date().toISOString(), demo: await (await (getSetting('demo'))).loaded };

  if (can('clients.read')) {
    const c = await (db.get(
      `SELECT COUNT(*) AS total, COUNT(CASE WHEN status = 'active' THEN 1 END) AS active,
              COUNT(CASE WHEN created_at < ? THEN 1 END) AS total_prev, COUNT(CASE WHEN created_at >= ? THEN 1 END) AS new_month
       FROM clients WHERE deleted_at IS NULL AND status <> 'archived'`,
      [`${m0}T00:00:00`, `${m0}T00:00:00`],
    ));
    out.clients = { total: delta(c.total, c.total_prev), active: c.active, new_this_month: c.new_month };
  }
  if (can('projects.read')) {
    const p = await (db.get(
      `SELECT COUNT(CASE WHEN status IN ('in_development', 'in_review', 'waiting_client') THEN 1 END) AS in_dev,
              COUNT(CASE WHEN status IN ('finished', 'delivered') THEN 1 END) AS completed,
              COUNT(CASE WHEN completed_at >= ? THEN 1 END) AS completed_month,
              COUNT(CASE WHEN completed_at >= ? AND completed_at < ? THEN 1 END) AS completed_prev,
              COUNT(CASE WHEN status NOT IN ('finished', 'delivered', 'cancelled') AND due_date < ? THEN 1 END) AS late
       FROM projects WHERE deleted_at IS NULL`,
      [`${m0}T00:00:00`, `${prevStart}T00:00:00`, `${m0}T00:00:00`, t],
    ));
    out.projects = { in_development: p.in_dev, completed: p.completed, completed_month: delta(p.completed_month, p.completed_prev), late: p.late };
  }
  if (can('finance.read')) {
    const billed = async (from, to) =>
      await (db.value("SELECT COALESCE(SUM(total_cents), 0) FROM invoices WHERE status NOT IN ('draft', 'cancelled') AND issue_date BETWEEN ? AND ?", [from, to])) +
      await (db.value("SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE invoice_id IS NULL AND status NOT IN ('cancelled', 'refunded') AND issued_on BETWEEN ? AND ?", [from, to]));
    const received = async (from, to) => await (db.value("SELECT COALESCE(SUM(amount_paid_cents), 0) FROM payments WHERE status NOT IN ('cancelled', 'refunded') AND paid_at BETWEEN ? AND ?", [from, to]));
    const totals = await (financeTotals());
    out.finance = {
      billed_month: delta(await (billed(m0, t)), await (billed(prevStart, prevSameDay))),
      received_month: delta(await (received(m0, t)), await (received(prevStart, prevSameDay))),
      outstanding_cents: totals.outstanding_cents,
      overdue_cents: totals.overdue_cents,
      overdue_count: totals.overdue_count,
      mrr_cents: totals.mrr_cents,
    };
  }
  if (can('incidents.read')) {
    out.incidents = await (db.get(
      `SELECT COUNT(CASE WHEN status NOT IN ('resolved', 'closed') THEN 1 END) AS open,
              COUNT(CASE WHEN status NOT IN ('resolved', 'closed') AND priority = 'critical' THEN 1 END) AS critical,
              COUNT(CASE WHEN opened_at >= ? THEN 1 END) AS opened_month, COUNT(CASE WHEN resolved_at >= ? THEN 1 END) AS resolved_month
       FROM incidents`,
      [`${m0}T00:00:00`, `${m0}T00:00:00`],
    ));
  }
  if (can('infrastructure.read')) {
    const counts = async (table) => await (db.get(`SELECT COUNT(*) AS total, COUNT(CASE WHEN status = 'operational' THEN 1 END) AS operational, COUNT(CASE WHEN status = 'warning' THEN 1 END) AS warning, COUNT(CASE WHEN status = 'down' THEN 1 END) AS down, COUNT(CASE WHEN status = 'unknown' THEN 1 END) AS unknown FROM ${table}`));
    out.infrastructure = {
      servers: await (counts('servers')),
      databases: await (counts('databases')),
      domains: await (counts('domains')),
      applications: await (counts('applications')),
      monitored_domains: await (db.value("SELECT COUNT(DISTINCT entity_id) FROM monitoring_checks WHERE entity_type = 'domain' AND enabled = 1")),
      active_services: await (db.value("SELECT COUNT(*) FROM client_services WHERE status = 'active'")),
      open_alerts: await (db.value("SELECT COUNT(*) FROM monitoring_alerts WHERE status <> 'resolved'")),
      servers_list: await (db.all("SELECT id, name, status, status_reason, ipv4, last_check_at FROM servers ORDER BY CASE status WHEN 'down' THEN 0 WHEN 'warning' THEN 1 WHEN 'unknown' THEN 2 ELSE 3 END, name LIMIT 8")),
    };
  }
  if (can('activity.read')) {
    out.activity = await (db.all(
      `SELECT a.id, a.action, a.summary, a.entity_type, a.entity_id, a.created_at, u.name AS user_name FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
       WHERE ${out.demo ? '1 = 1' : 'a.is_demo = 0'} AND a.action NOT IN ('document.downloaded', 'secret.used') ORDER BY a.id DESC LIMIT 12`,
    ));
  }
  res.json(out);
});

/** Contadores para la navegación (incidencias abiertas, alertas activas). */
router.get('/badges', async (req, res) => {
  res.json({
    incidents: req.perms.has('incidents.read') ? await (db.value("SELECT COUNT(*) FROM incidents WHERE status NOT IN ('resolved', 'closed')")) : 0,
    alerts: req.perms.has('monitoring.read') ? await (db.value("SELECT COUNT(*) FROM monitoring_alerts WHERE status <> 'resolved'")) : 0,
  });
});

/** Búsqueda global: clientes, proyectos, facturas, servidores, dominios e incidencias. */
router.get('/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) return res.json({ results: [] });
  const like = `%${escapeLike(q)}%`;
  const can = (p) => req.perms.has(p);
  const L = "LIKE ? ESCAPE '\\'";
  const results = [];
  if (can('clients.read')) {
    for (const r of await (db.all(`SELECT id, name, company, email FROM clients WHERE deleted_at IS NULL AND (name ${L} OR company ${L} OR email ${L} OR tax_id ${L} OR phone ${L}) ORDER BY status = 'archived', name LIMIT 6`, [like, like, like, like, like]))) {
      results.push({ type: 'client', id: r.id, title: r.company || r.name, subtitle: [r.company ? r.name : null, r.email].filter(Boolean).join(' · '), link: `/clientes/${r.id}` });
    }
  }
  if (can('projects.read')) {
    for (const r of await (db.all(`SELECT p.id, p.name, c.name AS client FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.deleted_at IS NULL AND (p.name ${L} OR c.name ${L}) ORDER BY p.updated_at DESC LIMIT 6`, [like, like]))) {
      results.push({ type: 'project', id: r.id, title: r.name, subtitle: r.client, link: `/proyectos/${r.id}` });
    }
  }
  if (can('finance.read')) {
    for (const r of await (db.all(`SELECT i.id, i.number, i.status, i.total_cents, c.name AS client FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.number ${L} OR c.name ${L} OR c.company ${L} ORDER BY i.id DESC LIMIT 6`, [like, like, like]))) {
      results.push({ type: 'invoice', id: r.id, title: r.number ?? `Borrador #${r.id}`, subtitle: r.client, amount_cents: r.total_cents, link: `/finanzas/facturas/${r.id}` });
    }
  }
  if (can('infrastructure.read')) {
    for (const r of await (db.all(`SELECT id, name, ipv4, hostname FROM servers WHERE name ${L} OR ipv4 ${L} OR hostname ${L} LIMIT 6`, [like, like, like]))) {
      results.push({ type: 'server', id: r.id, title: r.name, subtitle: [r.ipv4, r.hostname].filter(Boolean).join(' · '), link: `/infraestructura/servidores/${r.id}` });
    }
    for (const r of await (db.all(`SELECT id, name, expires_at FROM domains WHERE name ${L} LIMIT 6`, [like]))) {
      results.push({ type: 'domain', id: r.id, title: r.name, subtitle: r.expires_at ? `Caduca ${r.expires_at.slice(0, 10).split('-').reverse().join('/')}` : 'Dominio', link: `/infraestructura/dominios/${r.id}` });
    }
  }
  if (can('incidents.read')) {
    for (const r of await (db.all(`SELECT id, title, status FROM incidents WHERE title ${L} ORDER BY opened_at DESC LIMIT 5`, [like]))) {
      results.push({ type: 'incident', id: r.id, title: r.title, subtitle: 'Incidencia', link: `/incidencias/${r.id}` });
    }
  }
  res.json({ results });
});

/** Listas ligeras para selectores (id + etiqueta). */
router.get('/lookups', async (req, res) => {
  const can = (p) => req.perms.has(p);
  const include = new Set(String(req.query.include ?? '').split(','));
  const out = {};
  if (include.has('users')) out.users = await (db.all("SELECT id, name AS label FROM users WHERE status = 'active' ORDER BY name"));
  if (include.has('clients') && can('clients.read')) out.clients = await (db.all("SELECT id, COALESCE(NULLIF(company, ''), name) AS label, name AS contact, status FROM clients WHERE deleted_at IS NULL AND status <> 'archived' ORDER BY label COLLATE NOCASE"));
  if (include.has('projects') && can('projects.read')) out.projects = await (db.all("SELECT id, name AS label, client_id, status FROM projects WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE"));
  if (include.has('services') && can('services.read')) out.services = await (db.all("SELECT id, name AS label, price_cents, billing_period, category, description FROM services WHERE status = 'active' ORDER BY name COLLATE NOCASE"));
  if (can('infrastructure.read')) {
    if (include.has('servers')) out.servers = await (db.all('SELECT id, name AS label, client_id, project_id FROM servers ORDER BY name COLLATE NOCASE'));
    if (include.has('domains')) out.domains = await (db.all('SELECT id, name AS label, client_id, project_id FROM domains ORDER BY name COLLATE NOCASE'));
    if (include.has('databases')) out.databases = await (db.all('SELECT id, name AS label, client_id, project_id, engine FROM databases ORDER BY name COLLATE NOCASE'));
    if (include.has('applications')) out.applications = await (db.all('SELECT id, name AS label, client_id, project_id FROM applications ORDER BY name COLLATE NOCASE'));
  }
  if (include.has('series') && can('finance.read')) out.series = await (db.all('SELECT id, code, name AS label, kind, is_default FROM invoice_series WHERE active = 1 ORDER BY kind, is_default DESC, code'));
  if (include.has('open_invoices') && can('finance.read')) {
    out.open_invoices = await (db.all("SELECT id, number AS label, client_id, total_cents - paid_cents AS pending_cents FROM invoices WHERE status IN ('issued', 'partially_paid', 'overdue') ORDER BY issue_date DESC"));
  }
  res.json(out);
});

export default router;
