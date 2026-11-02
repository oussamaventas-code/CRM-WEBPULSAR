import { Router } from 'express';
import { db, nowIso, tx } from '../db/index.js';
import { can, confirmPassword } from '../middleware/auth.js';
import { findOr404, insert, parseJson, update } from '../lib/query.js';
import { f, parse, z } from '../lib/validate.js';
import { HttpError, badRequest, conflict } from '../lib/errors.js';
import { record } from '../lib/audit.js';
import { randomToken, safeEqual, sha256 } from '../lib/crypto.js';
import { getSetting } from '../lib/settings.js';
import path from 'node:path';
import { ROOT, config } from '../config.js';
import { powerAction, fetchVmMetrics, storeMetrics } from '../integrations/hostinger.js';
import { createDnsRecord, deleteDnsRecord, refreshZoneRecords, updateDnsRecord } from '../integrations/cloudflare.js';
import { getCredential } from '../integrations/store.js';
import { evaluateEntity, evaluateServer, executeCheck, uptime } from '../services/monitoring.js';

const router = Router();
const providerId = async (key) => await (db.value('SELECT id FROM providers WHERE key = ?', [key]));
const STATUS_COUNTS = async (table) => await (db.get(
  `SELECT COUNT(*) AS total, COUNT(CASE WHEN status = 'operational' THEN 1 END) AS operational, COUNT(CASE WHEN status = 'warning' THEN 1 END) AS warning,
          COUNT(CASE WHEN status = 'down' THEN 1 END) AS down, COUNT(CASE WHEN status = 'unknown' THEN 1 END) AS unknown FROM ${table}`,
));

router.get('/overview', can('infrastructure.read'), async (_req, res) => {
  const { domain_expiry_days: days } = await (getSetting('monitoring'));
  res.json({
    servers: await (STATUS_COUNTS('servers')),
    domains: { ...await (STATUS_COUNTS('domains')), expiring: await (db.value('SELECT COUNT(*) FROM domains WHERE expires_at IS NOT NULL AND expires_at <= ?', [new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10)])) },
    databases: await (STATUS_COUNTS('databases')),
    applications: await (STATUS_COUNTS('applications')),
    monitored_domains: await (db.value("SELECT COUNT(DISTINCT entity_id) FROM monitoring_checks WHERE entity_type = 'domain' AND enabled = 1")),
    checks: await (db.get("SELECT COUNT(*) AS total, COUNT(CASE WHEN last_status = 'up' THEN 1 END) AS up, COUNT(CASE WHEN last_status = 'down' THEN 1 END) AS down, COUNT(CASE WHEN last_status = 'degraded' THEN 1 END) AS degraded FROM monitoring_checks WHERE enabled = 1")),
    active_services: await (db.value("SELECT COUNT(*) FROM client_services WHERE status = 'active'")),
    buckets: await (db.value('SELECT COUNT(*) FROM storage_buckets')),
    open_alerts: await (db.all("SELECT id, title, severity, entity_type, entity_id, opened_at FROM monitoring_alerts WHERE status <> 'resolved' ORDER BY severity = 'critical' DESC, opened_at DESC LIMIT 8")),
    attention: await (db.all("SELECT 'server' AS type, id, name, status, status_reason FROM servers WHERE status IN ('down', 'warning') UNION ALL SELECT 'domain', id, name, status, status_reason FROM domains WHERE status IN ('down', 'warning') UNION ALL SELECT 'database', id, name, status, status_reason FROM databases WHERE status IN ('down', 'warning') LIMIT 10")),
  });
});

// ── Servidores ───────────────────────────────────────────
const serverFields = {
  name: f.text(120),
  provider_key: f.oneOf(['hostinger', 'cloudflare', 'other']).default('other'),
  hostname: f.optText(200),
  ipv4: emptyIp(4),
  ipv6: emptyIp(6),
  os: f.optText(100),
  region: f.optText(100),
  plan: f.optText(100),
  cpu_cores: f.optCents(),
  ram_mb: f.optCents(),
  disk_mb: f.optCents(),
  client_id: f.optId(),
  project_id: f.optId(),
  notes: f.optText(3000),
};
function emptyIp(version) {
  const re = version === 4 ? /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/ : /^[0-9a-f:]{2,45}$/i;
  return z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().trim().regex(re, `IPv${version} no válida`).nullable()).optional();
}

const SERVER_SELECT = `SELECT s.*, pr.key AS provider_key, pr.name AS provider_name, c.name AS client_name, p.name AS project_name,
  (SELECT COUNT(*) FROM monitoring_alerts a WHERE a.entity_type = 'server' AND a.entity_id = s.id AND a.status <> 'resolved') AS open_alerts,
  (SELECT cpu_pct FROM server_metrics m WHERE m.server_id = s.id ORDER BY collected_at DESC LIMIT 1) AS last_cpu_pct
  FROM servers s JOIN providers pr ON pr.id = s.provider_id LEFT JOIN clients c ON c.id = s.client_id LEFT JOIN projects p ON p.id = s.project_id`;

const sanitizeServer = (s) => {
  if (!s) return s;
  s.agent_configured = !!s.agent_token_hash;
  delete s.agent_token_hash;
  return s;
};

router.get('/servers', can('infrastructure.read'), async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.client_id) where.push('s.client_id = ?') && params.push(Number(req.query.client_id));
  if (req.query.project_id) where.push('s.project_id = ?') && params.push(Number(req.query.project_id));
  if (req.query.status) where.push('s.status = ?') && params.push(String(req.query.status));
  if (req.query.q) {
    where.push('(s.name LIKE ? OR s.hostname LIKE ? OR s.ipv4 LIKE ? OR c.name LIKE ?)');
    params.push(...Array(4).fill(`%${req.query.q}%`));
  }
  res.json(await (await (db.all(`${SERVER_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY CASE s.status WHEN 'down' THEN 0 WHEN 'warning' THEN 1 WHEN 'unknown' THEN 2 ELSE 3 END, s.name`, params))).map(sanitizeServer));
});

router.get('/servers/:id', can('infrastructure.read'), async (req, res) => {
  const server = sanitizeServer(await (db.get(`${SERVER_SELECT} WHERE s.id = ?`, [req.params.id])));
  if (!server) throw new HttpError(404, 'Servidor no encontrado');
  const id = server.id;
  const checks = await Promise.all((await db.all("SELECT * FROM monitoring_checks WHERE entity_type = 'server' AND entity_id = ? ORDER BY type", [id])).map(async (c) => ({ ...c, uptime_24h: await uptime(c.id, 24), uptime_7d: await uptime(c.id, 168) })));
  res.json({
    server,
    latest_metric: await (db.get('SELECT * FROM server_metrics WHERE server_id = ? ORDER BY collected_at DESC LIMIT 1', [id])),
    checks,
    alerts: await (db.all("SELECT * FROM monitoring_alerts WHERE entity_type = 'server' AND entity_id = ? ORDER BY status = 'resolved', opened_at DESC LIMIT 20", [id])),
    projects: await (db.all(
      `SELECT DISTINCT p.id, p.name, p.status FROM projects p WHERE p.deleted_at IS NULL AND (p.id = ? OR p.id IN (SELECT project_id FROM applications WHERE server_id = ?) OR p.id IN (SELECT project_id FROM domains WHERE server_id = ?))`,
      [server.project_id ?? -1, id, id],
    )),
    applications: await (db.all('SELECT id, name, kind, url, status FROM applications WHERE server_id = ?', [id])),
    domains: await (db.all('SELECT id, name, status, expires_at FROM domains WHERE server_id = ?', [id])),
    databases: await (db.all('SELECT id, name, engine, environment, status FROM databases WHERE server_id = ?', [id])),
    incidents: await (db.all("SELECT id, title, priority, status, opened_at FROM incidents WHERE server_id = ? ORDER BY status IN ('resolved', 'closed'), opened_at DESC LIMIT 10", [id])),
    hostinger_actions: server.source === 'hostinger' && !!await (getCredential('hostinger')),
  });
});

router.get('/servers/:id/metrics', can('infrastructure.read'), async (req, res) => {
  const server = await (findOr404('servers', req.params.id, { message: 'Servidor no encontrado' }));
  const hours = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 }[req.query.range] ?? 24;
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const preferred = await (db.value("SELECT COUNT(*) FROM server_metrics WHERE server_id = ? AND source = 'agent' AND collected_at >= ?", [server.id, since])) ? 'agent' : 'hostinger';
  res.json({
    source: preferred,
    points: await (db.all('SELECT collected_at, cpu_pct, ram_used_bytes, ram_total_bytes, disk_used_bytes, disk_total_bytes, net_in_bytes, net_out_bytes, load_1, uptime_s FROM server_metrics WHERE server_id = ? AND source = ? AND collected_at >= ? ORDER BY collected_at', [server.id, preferred, since])),
  });
});

router.post('/servers', can('infrastructure.write'), async (req, res) => {
  const { provider_key, ...data } = parse(z.object(serverFields), req.body);
  const id = await (tx(async () => {
    const newId = await (insert('servers', { ...data, provider_id: await (providerId(provider_key)), source: 'manual', created_by: req.user.id }));
    await (record(req, { action: 'server.created', entityType: 'server', entityId: newId, clientId: data.client_id, label: data.name, summary: `Servidor añadido: ${data.name}`, after: data }));
    return newId;
  }));
  await (evaluateServer(id));
  res.status(201).json(sanitizeServer(await (db.get(`${SERVER_SELECT} WHERE s.id = ?`, [id]))));
});

router.patch('/servers/:id', can('infrastructure.write'), async (req, res) => {
  const before = await (findOr404('servers', req.params.id, { message: 'Servidor no encontrado' }));
  const { provider_key, ...data } = parse(z.object(serverFields).partial(), req.body);
  if (before.source === 'hostinger') for (const k of ['hostname', 'ipv4', 'ipv6', 'os', 'region', 'plan', 'cpu_cores', 'ram_mb', 'disk_mb']) delete data[k];
  await (tx(async () => {
    await (update('servers', before.id, { ...data, provider_id: provider_key && before.source === 'manual' ? await (providerId(provider_key)) : undefined }));
    await (record(req, { action: 'server.updated', entityType: 'server', entityId: before.id, clientId: data.client_id ?? before.client_id, label: before.name, summary: `Servidor actualizado: ${before.name}`, before, after: data }));
  }));
  res.json(sanitizeServer(await (db.get(`${SERVER_SELECT} WHERE s.id = ?`, [before.id]))));
});

router.delete('/servers/:id', can('infrastructure.write'), async (req, res) => {
  const server = await (findOr404('servers', req.params.id, { message: 'Servidor no encontrado' }));
  await confirmPassword(req, req.body?.password);
  const refs = await (db.value('SELECT (SELECT COUNT(*) FROM incidents WHERE server_id = ?) + (SELECT COUNT(*) FROM expenses WHERE server_id = ?)', [server.id, server.id]));
  if (refs) throw conflict('El servidor tiene incidencias o gastos asociados; desvincúlalos antes de eliminarlo');
  await (tx(async () => {
    await (db.run('UPDATE domains SET server_id = NULL WHERE server_id = ?', [server.id]));
    await (db.run('UPDATE applications SET server_id = NULL WHERE server_id = ?', [server.id]));
    await (db.run('UPDATE databases SET server_id = NULL WHERE server_id = ?', [server.id]));
    await (db.run('UPDATE secrets SET server_id = NULL WHERE server_id = ?', [server.id]));
    await (db.run("DELETE FROM monitoring_checks WHERE entity_type = 'server' AND entity_id = ?", [server.id]));
    await (db.run("DELETE FROM infrastructure_relationships WHERE (from_type = 'server' AND from_id = ?) OR (to_type = 'server' AND to_id = ?)", [server.id, server.id]));
    await (db.run('DELETE FROM servers WHERE id = ?', [server.id]));
    await (record(req, { action: 'server.deleted', entityType: 'server', entityId: server.id, clientId: server.client_id, label: server.name, summary: `Servidor eliminado del inventario: ${server.name}`, before: server }));
  }));
  res.json({ ok: true });
});

/** Genera un token de agente (se muestra una sola vez) y crea la comprobación de heartbeat. */
router.post('/servers/:id/agent-token', can('infrastructure.write'), async (req, res) => {
  const server = await (findOr404('servers', req.params.id, { message: 'Servidor no encontrado' }));
  await confirmPassword(req, req.body?.password);
  const token = `wpa_${server.id}_${randomToken(32)}`;
  await (tx(async () => {
    await (db.run('UPDATE servers SET agent_token_hash = ?, last_heartbeat_at = NULL, updated_at = ? WHERE id = ?', [sha256(token), nowIso(), server.id]));
    const exists = await (db.value("SELECT id FROM monitoring_checks WHERE type = 'heartbeat' AND entity_type = 'server' AND entity_id = ?", [server.id]));
    if (!exists) {
      await (insert('monitoring_checks', { name: `Heartbeat · ${server.name}`, type: 'heartbeat', entity_type: 'server', entity_id: server.id, interval_s: 60, failure_threshold: 3, created_by: req.user.id }));
    }
    await (record(req, { action: 'server.agent_token', entityType: 'server', entityId: server.id, clientId: server.client_id, label: server.name, summary: `Token de agente generado para ${server.name}` }));
  }));
  res.setHeader('Cache-Control', 'no-store');
  res.json({ token, endpoint: `${config.appUrl}/api/agent/heartbeat` });
});

router.delete('/servers/:id/agent-token', can('infrastructure.write'), async (req, res) => {
  const server = await (findOr404('servers', req.params.id, { message: 'Servidor no encontrado' }));
  await (tx(async () => {
    await (db.run('UPDATE servers SET agent_token_hash = NULL, updated_at = ? WHERE id = ?', [nowIso(), server.id]));
    await (db.run("DELETE FROM monitoring_checks WHERE type = 'heartbeat' AND entity_type = 'server' AND entity_id = ?", [server.id]));
    await (record(req, { action: 'server.agent_revoked', entityType: 'server', entityId: server.id, clientId: server.client_id, label: server.name, summary: `Agente revocado en ${server.name}` }));
  }));
  await (evaluateServer(server.id));
  res.json({ ok: true });
});

router.post('/servers/:id/refresh', can('infrastructure.read'), async (req, res) => {
  const server = await (findOr404('servers', req.params.id, { message: 'Servidor no encontrado' }));
  if (server.source === 'hostinger' && await (getCredential('hostinger'))) {
    const rows = await fetchVmMetrics(await (getCredential('hostinger')), server.external_id, 2);
    await (storeMetrics(server.id, 'hostinger', rows, { ram: server.ram_mb ? server.ram_mb * 1048576 : null, disk: server.disk_mb ? server.disk_mb * 1048576 : null }));
  }
  await (evaluateServer(server.id));
  res.json({ ok: true });
});

router.post('/servers/:id/power', can('infrastructure.write'), async (req, res) => {
  const server = await (findOr404('servers', req.params.id, { message: 'Servidor no encontrado' }));
  const { action, password } = parse(z.object({ action: f.oneOf(['start', 'stop', 'restart']), password: z.string() }), req.body);
  await confirmPassword(req, password);
  try {
    await powerAction(server, action);
  } catch (err) {
    throw new HttpError(502, err.message);
  }
  const label = { start: 'Arranque', stop: 'Parada', restart: 'Reinicio' }[action];
  await (record(req, { action: `server.${action}`, entityType: 'server', entityId: server.id, clientId: server.client_id, label: server.name, summary: `${label} solicitado en Hostinger para ${server.name}` }));
  res.json({ ok: true, message: `${label} solicitado. El estado se actualizará en la próxima sincronización.` });
});

// ── Dominios y DNS ───────────────────────────────────────
const domainFields = {
  name: z.string().trim().toLowerCase().regex(/^(?=.{3,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/, 'Dominio no válido'),
  client_id: f.optId(),
  project_id: f.optId(),
  server_id: f.optId(),
  registrar: f.optText(80),
  expires_at: f.optDate(),
  auto_renew: z.preprocess((v) => (v === '' || v == null ? null : v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0), z.number().nullable()).optional(),
  notes: f.optText(3000),
  monitor: f.bool().optional(),
};

const DOMAIN_SELECT = `SELECT d.*, c.name AS client_name, p.name AS project_name, s.name AS server_name,
  (SELECT COUNT(*) FROM dns_records r WHERE r.domain_id = d.id) AS dns_count
  FROM domains d LEFT JOIN clients c ON c.id = d.client_id LEFT JOIN projects p ON p.id = d.project_id LEFT JOIN servers s ON s.id = d.server_id`;

router.get('/domains', can('infrastructure.read'), async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.client_id) where.push('d.client_id = ?') && params.push(Number(req.query.client_id));
  if (req.query.project_id) where.push('d.project_id = ?') && params.push(Number(req.query.project_id));
  if (req.query.q) where.push('(d.name LIKE ? OR c.name LIKE ?)') && params.push(`%${req.query.q}%`, `%${req.query.q}%`);
  res.json(await (await (db.all(`${DOMAIN_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY d.expires_at IS NULL, d.expires_at, d.name`, params))).map((d) => ({ ...d, nameservers: parseJson(d.nameservers, []) })));
});

router.get('/domains/:id', can('infrastructure.read'), async (req, res) => {
  const domain = await (db.get(`${DOMAIN_SELECT} WHERE d.id = ?`, [req.params.id]));
  if (!domain) throw new HttpError(404, 'Dominio no encontrado');
  domain.nameservers = parseJson(domain.nameservers, []);
  res.json({
    domain,
    dns: await (db.all('SELECT * FROM dns_records WHERE domain_id = ? ORDER BY type, name', [domain.id])),
    checks: await Promise.all((await db.all("SELECT * FROM monitoring_checks WHERE entity_type = 'domain' AND entity_id = ?", [domain.id])).map(async (c) => ({ ...c, uptime_24h: await uptime(c.id, 24), uptime_7d: await uptime(c.id, 168) }))),
    alerts: await (db.all("SELECT * FROM monitoring_alerts WHERE entity_type = 'domain' AND entity_id = ? ORDER BY status = 'resolved', opened_at DESC LIMIT 20", [domain.id])),
    applications: await (db.all('SELECT id, name, kind, url, status FROM applications WHERE domain_id = ?', [domain.id])),
    cloudflare_ready: !!domain.cloudflare_zone_id && !!await (getCredential('cloudflare')),
  });
});

async function createDomainChecks(req, domainId, name) {
  const monitoring = await (getSetting('monitoring'));
  await (insert('monitoring_checks', { name: `Web · ${name}`, type: 'http', target: `https://${name}`, entity_type: 'domain', entity_id: domainId, interval_s: monitoring.default_interval_s, failure_threshold: monitoring.failure_threshold, created_by: req.user.id }));
  await (insert('monitoring_checks', { name: `SSL · ${name}`, type: 'ssl_expiry', target: name, entity_type: 'domain', entity_id: domainId, interval_s: 21600, failure_threshold: 1, created_by: req.user.id }));
  await (insert('monitoring_checks', { name: `Caducidad · ${name}`, type: 'domain_expiry', entity_type: 'domain', entity_id: domainId, interval_s: 43200, failure_threshold: 1, created_by: req.user.id }));
}

router.post('/domains', can('infrastructure.write'), async (req, res) => {
  const { monitor, ...data } = parse(z.object(domainFields), req.body);
  const id = await (tx(async () => {
    const newId = await (insert('domains', { ...data, created_by: req.user.id }));
    if (monitor) await (createDomainChecks(req, newId, data.name));
    await (record(req, { action: 'domain.created', entityType: 'domain', entityId: newId, clientId: data.client_id, label: data.name, summary: `Dominio añadido: ${data.name}`, after: data }));
    return newId;
  }));
  res.status(201).json(await (db.get(`${DOMAIN_SELECT} WHERE d.id = ?`, [id])));
});

router.patch('/domains/:id', can('infrastructure.write'), async (req, res) => {
  const before = await (findOr404('domains', req.params.id, { message: 'Dominio no encontrado' }));
  const { monitor, ...data } = parse(z.object(domainFields).partial(), req.body);
  delete data.name;
  await (tx(async () => {
    await (update('domains', before.id, data));
    if (monitor && !await (db.value("SELECT 1 FROM monitoring_checks WHERE entity_type = 'domain' AND entity_id = ?", [before.id]))) await (createDomainChecks(req, before.id, before.name));
    await (record(req, { action: 'domain.updated', entityType: 'domain', entityId: before.id, clientId: data.client_id ?? before.client_id, label: before.name, summary: `Dominio actualizado: ${before.name}`, before, after: data }));
  }));
  res.json(await (db.get(`${DOMAIN_SELECT} WHERE d.id = ?`, [before.id])));
});

router.delete('/domains/:id', can('infrastructure.write'), async (req, res) => {
  const domain = await (findOr404('domains', req.params.id, { message: 'Dominio no encontrado' }));
  if (await (db.value('SELECT COUNT(*) FROM incidents WHERE domain_id = ?', [domain.id]))) throw conflict('El dominio tiene incidencias asociadas');
  await (tx(async () => {
    await (db.run('UPDATE applications SET domain_id = NULL WHERE domain_id = ?', [domain.id]));
    await (db.run("DELETE FROM monitoring_checks WHERE entity_type = 'domain' AND entity_id = ?", [domain.id]));
    await (db.run("DELETE FROM infrastructure_relationships WHERE (from_type = 'domain' AND from_id = ?) OR (to_type = 'domain' AND to_id = ?)", [domain.id, domain.id]));
    await (db.run('DELETE FROM domains WHERE id = ?', [domain.id]));
    await (record(req, { action: 'domain.deleted', entityType: 'domain', entityId: domain.id, clientId: domain.client_id, label: domain.name, summary: `Dominio eliminado del inventario: ${domain.name} (no afecta al registrador ni a Cloudflare)` }));
  }));
  res.json({ ok: true });
});

const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'];
const dnsSchema = z.object({
  type: f.oneOf(DNS_TYPES),
  name: f.text(253),
  content: f.text(4096),
  ttl: z.coerce.number().int().min(1).max(86400).default(1),
  proxied: f.bool().default(false),
  priority: z.coerce.number().int().min(0).max(65535).optional(),
  comment: f.optText(100),
});

router.post('/domains/:id/dns', can('infrastructure.write'), async (req, res) => {
  const domain = await (findOr404('domains', req.params.id, { message: 'Dominio no encontrado' }));
  const data = parse(dnsSchema, req.body);
  if (data.type === 'MX' && data.priority == null) throw badRequest('Indica la prioridad del registro MX', { priority: 'Obligatorio' });
  try {
    await createDnsRecord(domain, { ...data, proxied: ['A', 'AAAA', 'CNAME'].includes(data.type) ? data.proxied : undefined, comment: data.comment ?? undefined });
    await refreshZoneRecords(domain);
  } catch (err) {
    throw new HttpError(502, err.message);
  }
  await (record(req, { action: 'dns.created', entityType: 'domain', entityId: domain.id, clientId: domain.client_id, label: domain.name, summary: `DNS ${data.type} creado en ${domain.name}: ${data.name} → ${data.content}`, after: data }));
  res.status(201).json(await (db.all('SELECT * FROM dns_records WHERE domain_id = ? ORDER BY type, name', [domain.id])));
});

router.patch('/domains/:id/dns/:recordId', can('infrastructure.write'), async (req, res) => {
  const domain = await (findOr404('domains', req.params.id, { message: 'Dominio no encontrado' }));
  const rec = await (findOr404('dns_records', req.params.recordId, { where: `AND domain_id = ${domain.id}`, message: 'Registro no encontrado' }));
  if (rec.source !== 'cloudflare') throw conflict('Solo los registros de Cloudflare se gestionan desde aquí');
  const data = parse(dnsSchema.partial(), req.body);
  try {
    await updateDnsRecord(domain, rec.external_id, data);
    await refreshZoneRecords(domain);
  } catch (err) {
    throw new HttpError(502, err.message);
  }
  await (record(req, { action: 'dns.updated', entityType: 'domain', entityId: domain.id, clientId: domain.client_id, label: domain.name, summary: `DNS ${rec.type} ${rec.name} actualizado en ${domain.name}`, before: rec, after: data }));
  res.json(await (db.all('SELECT * FROM dns_records WHERE domain_id = ? ORDER BY type, name', [domain.id])));
});

router.delete('/domains/:id/dns/:recordId', can('infrastructure.write'), async (req, res) => {
  const domain = await (findOr404('domains', req.params.id, { message: 'Dominio no encontrado' }));
  const rec = await (findOr404('dns_records', req.params.recordId, { where: `AND domain_id = ${domain.id}`, message: 'Registro no encontrado' }));
  if (rec.source !== 'cloudflare') throw conflict('Solo los registros de Cloudflare se gestionan desde aquí');
  await confirmPassword(req, req.body?.password);
  try {
    await deleteDnsRecord(domain, rec.external_id);
    await refreshZoneRecords(domain);
  } catch (err) {
    throw new HttpError(502, err.message);
  }
  await (record(req, { action: 'dns.deleted', entityType: 'domain', entityId: domain.id, clientId: domain.client_id, label: domain.name, summary: `DNS ${rec.type} ${rec.name} eliminado de ${domain.name}`, before: rec }));
  res.json(await (db.all('SELECT * FROM dns_records WHERE domain_id = ? ORDER BY type, name', [domain.id])));
});

router.post('/domains/:id/dns/refresh', can('infrastructure.read'), async (req, res) => {
  const domain = await (findOr404('domains', req.params.id, { message: 'Dominio no encontrado' }));
  try {
    await refreshZoneRecords(domain);
  } catch (err) {
    throw new HttpError(502, err.message);
  }
  res.json(await (db.all('SELECT * FROM dns_records WHERE domain_id = ? ORDER BY type, name', [domain.id])));
});

// ── Bases de datos, aplicaciones y buckets ──────────────
const dbFields = {
  name: f.text(120),
  provider_key: f.oneOf(['hostinger', 'cloudflare', 'other']).default('other'),
  engine: f.oneOf(['d1', 'mysql', 'mariadb', 'postgresql', 'sqlite', 'mongodb', 'redis', 'other']),
  client_id: f.optId(),
  project_id: f.optId(),
  server_id: f.optId(),
  environment: f.oneOf(['production', 'development', 'testing']).default('production'),
  external_id: f.optText(120),
  region: f.optText(80),
  notes: f.optText(3000),
};

const DB_SELECT = `SELECT d.*, pr.key AS provider_key, pr.name AS provider_name, c.name AS client_name, p.name AS project_name, s.name AS server_name
  FROM databases d JOIN providers pr ON pr.id = d.provider_id LEFT JOIN clients c ON c.id = d.client_id LEFT JOIN projects p ON p.id = d.project_id LEFT JOIN servers s ON s.id = d.server_id`;

router.get('/databases', can('infrastructure.read'), async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.client_id) where.push('d.client_id = ?') && params.push(Number(req.query.client_id));
  if (req.query.project_id) where.push('d.project_id = ?') && params.push(Number(req.query.project_id));
  if (req.query.environment) where.push('d.environment = ?') && params.push(String(req.query.environment));
  const rows = await (db.all(`${DB_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY d.environment, d.name`, params));
  for (const r of rows) r.checks = await (db.all("SELECT id, name, type, last_status, last_message, last_checked_at FROM monitoring_checks WHERE entity_type = 'database' AND entity_id = ?", [r.id]));
  res.json(rows);
});

router.post('/databases', can('infrastructure.write'), async (req, res) => {
  const { provider_key, ...data } = parse(z.object(dbFields), req.body);
  const id = await (tx(async () => {
    const newId = await (insert('databases', { ...data, provider_id: await (providerId(provider_key)), created_by: req.user.id }));
    await (record(req, { action: 'database.created', entityType: 'database', entityId: newId, clientId: data.client_id, label: data.name, summary: `Base de datos registrada: ${data.name}` }));
    return newId;
  }));
  res.status(201).json(await (db.get(`${DB_SELECT} WHERE d.id = ?`, [id])));
});

router.patch('/databases/:id', can('infrastructure.write'), async (req, res) => {
  const before = await (findOr404('databases', req.params.id, { message: 'Base de datos no encontrada' }));
  const { provider_key, ...data } = parse(z.object(dbFields).partial(), req.body);
  if (before.source === 'cloudflare') for (const k of ['name', 'engine', 'external_id']) delete data[k];
  await (tx(async () => {
    await (update('databases', before.id, { ...data, provider_id: provider_key && before.source === 'manual' ? await (providerId(provider_key)) : undefined }));
    await (record(req, { action: 'database.updated', entityType: 'database', entityId: before.id, clientId: data.client_id ?? before.client_id, label: before.name, summary: `Base de datos actualizada: ${before.name}`, before, after: data }));
  }));
  res.json(await (db.get(`${DB_SELECT} WHERE d.id = ?`, [before.id])));
});

router.delete('/databases/:id', can('infrastructure.write'), async (req, res) => {
  const row = await (findOr404('databases', req.params.id, { message: 'Base de datos no encontrada' }));
  await (tx(async () => {
    await (db.run('UPDATE applications SET database_id = NULL WHERE database_id = ?', [row.id]));
    await (db.run('UPDATE secrets SET database_id = NULL WHERE database_id = ?', [row.id]));
    await (db.run('UPDATE incidents SET database_id = NULL WHERE database_id = ?', [row.id]));
    await (db.run("DELETE FROM monitoring_checks WHERE entity_type = 'database' AND entity_id = ?", [row.id]));
    await (db.run("DELETE FROM infrastructure_relationships WHERE (from_type = 'database' AND from_id = ?) OR (to_type = 'database' AND to_id = ?)", [row.id, row.id]));
    await (db.run('DELETE FROM databases WHERE id = ?', [row.id]));
    await (record(req, { action: 'database.deleted', entityType: 'database', entityId: row.id, clientId: row.client_id, label: row.name, summary: `Base de datos eliminada del inventario: ${row.name} (no se borra en el proveedor)` }));
  }));
  res.json({ ok: true });
});

const appFields = {
  name: f.text(120),
  kind: f.oneOf(['website', 'webapp', 'api', 'worker', 'cron', 'other']),
  client_id: f.optId(),
  project_id: f.optId(),
  server_id: f.optId(),
  domain_id: f.optId(),
  database_id: f.optId(),
  url: f.url(),
  runtime: f.optText(80),
  repository_url: f.url(),
  notes: f.optText(3000),
  monitor: f.bool().optional(),
};

const APP_SELECT = `SELECT a.*, c.name AS client_name, p.name AS project_name, s.name AS server_name, d.name AS domain_name, b.name AS database_name
  FROM applications a LEFT JOIN clients c ON c.id = a.client_id LEFT JOIN projects p ON p.id = a.project_id LEFT JOIN servers s ON s.id = a.server_id
  LEFT JOIN domains d ON d.id = a.domain_id LEFT JOIN databases b ON b.id = a.database_id`;

router.get('/applications', can('infrastructure.read'), async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.client_id) where.push('a.client_id = ?') && params.push(Number(req.query.client_id));
  if (req.query.project_id) where.push('a.project_id = ?') && params.push(Number(req.query.project_id));
  res.json(await (db.all(`${APP_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.name`, params)));
});

async function monitorApp(req, appId, name, url) {
  const m = await (getSetting('monitoring'));
  await (insert('monitoring_checks', { name: `App · ${name}`, type: 'http', target: url, entity_type: 'application', entity_id: appId, interval_s: m.default_interval_s, failure_threshold: m.failure_threshold, created_by: req.user.id }));
}

router.post('/applications', can('infrastructure.write'), async (req, res) => {
  const { monitor, ...data } = parse(z.object(appFields), req.body);
  const id = await (tx(async () => {
    const newId = await (insert('applications', { ...data, created_by: req.user.id }));
    if (monitor && data.url) await (monitorApp(req, newId, data.name, data.url));
    await (record(req, { action: 'application.created', entityType: 'application', entityId: newId, clientId: data.client_id, label: data.name, summary: `Aplicación registrada: ${data.name}` }));
    return newId;
  }));
  res.status(201).json(await (db.get(`${APP_SELECT} WHERE a.id = ?`, [id])));
});

router.patch('/applications/:id', can('infrastructure.write'), async (req, res) => {
  const before = await (findOr404('applications', req.params.id, { message: 'Aplicación no encontrada' }));
  const { monitor, ...data } = parse(z.object(appFields).partial(), req.body);
  if (before.source === 'cloudflare') delete data.name;
  await (tx(async () => {
    await (update('applications', before.id, data));
    const url = data.url ?? before.url;
    if (monitor && url && !await (db.value("SELECT 1 FROM monitoring_checks WHERE entity_type = 'application' AND entity_id = ?", [before.id]))) await (monitorApp(req, before.id, before.name, url));
    await (record(req, { action: 'application.updated', entityType: 'application', entityId: before.id, clientId: data.client_id ?? before.client_id, label: before.name, summary: `Aplicación actualizada: ${before.name}`, before, after: data }));
  }));
  res.json(await (db.get(`${APP_SELECT} WHERE a.id = ?`, [before.id])));
});

router.delete('/applications/:id', can('infrastructure.write'), async (req, res) => {
  const app = await (findOr404('applications', req.params.id, { message: 'Aplicación no encontrada' }));
  await (tx(async () => {
    await (db.run("DELETE FROM monitoring_checks WHERE entity_type = 'application' AND entity_id = ?", [app.id]));
    await (db.run("DELETE FROM infrastructure_relationships WHERE (from_type = 'application' AND from_id = ?) OR (to_type = 'application' AND to_id = ?)", [app.id, app.id]));
    await (db.run('DELETE FROM applications WHERE id = ?', [app.id]));
    await (record(req, { action: 'application.deleted', entityType: 'application', entityId: app.id, clientId: app.client_id, label: app.name, summary: `Aplicación eliminada del inventario: ${app.name}` }));
  }));
  res.json({ ok: true });
});

router.get('/buckets', can('infrastructure.read'), async (_req, res) => {
  res.json(await (db.all('SELECT b.*, c.name AS client_name, p.name AS project_name FROM storage_buckets b LEFT JOIN clients c ON c.id = b.client_id LEFT JOIN projects p ON p.id = b.project_id ORDER BY b.name')));
});

router.patch('/buckets/:id', can('infrastructure.write'), async (req, res) => {
  const b = await (findOr404('storage_buckets', req.params.id, { message: 'Bucket no encontrado' }));
  await (update('storage_buckets', b.id, parse(z.object({ client_id: f.optId(), project_id: f.optId() }), req.body)));
  res.json(await (db.get('SELECT * FROM storage_buckets WHERE id = ?', [b.id])));
});

// ── Relaciones y mapa ────────────────────────────────────
const TYPES = ['client', 'project', 'domain', 'server', 'application', 'database', 'bucket'];
router.post('/relationships', can('infrastructure.write'), async (req, res) => {
  const data = parse(z.object({ from_type: f.oneOf(TYPES), from_id: f.id(), to_type: f.oneOf(TYPES), to_id: f.id(), kind: z.string().trim().max(40).default('uses'), notes: f.optText(500) }), req.body);
  const id = await (insert('infrastructure_relationships', { ...data, created_by: req.user.id }));
  await (record(req, { action: 'relationship.created', entityType: data.from_type, entityId: data.from_id, summary: `Relación añadida: ${data.from_type} → ${data.to_type}` }));
  res.status(201).json(await (db.get('SELECT * FROM infrastructure_relationships WHERE id = ?', [id])));
});

router.delete('/relationships/:id', can('infrastructure.write'), async (req, res) => {
  await (findOr404('infrastructure_relationships', req.params.id));
  await (db.run('DELETE FROM infrastructure_relationships WHERE id = ?', [req.params.id]));
  res.json({ ok: true });
});

/** Grafo cliente → proyecto → dominio → servidor → aplicación → Cloudflare → base de datos. */
router.get('/map', can('infrastructure.read'), async (req, res) => {
  const clientId = req.query.client_id ? Number(req.query.client_id) : null;
  const nodes = new Map();
  const edges = new Set();
  const add = (type, id, label, extra = {}) => {
    const key = `${type}:${id}`;
    if (!nodes.has(key)) nodes.set(key, { key, type, id, label, ...extra });
    return key;
  };
  const link = (a, b, kind = 'fk') => a && b && a !== b && edges.add(`${a}|${b}|${kind}`);

  const clients = await (db.all(`SELECT id, name, company, status FROM clients WHERE deleted_at IS NULL ${clientId ? 'AND id = ?' : "AND status <> 'archived'"}`, clientId ? [clientId] : []));
  const clientIds = new Set(clients.map((c) => c.id));
  for (const c of clients) add('client', c.id, c.company || c.name, { status: c.status });

  const inScope = (row) => !clientId || clientIds.has(row.client_id);
  const projects = await (await (db.all('SELECT id, name, client_id, status FROM projects WHERE deleted_at IS NULL'))).filter(inScope);
  const projectIds = new Set(projects.map((p) => p.id));
  for (const p of projects) link(add('client', p.client_id, null), add('project', p.id, p.name, { status: p.status }));

  const related = (row) => inScope(row) || projectIds.has(row.project_id);
  const domains = await (await (db.all('SELECT id, name, client_id, project_id, server_id, status, cloudflare_zone_id, zone_status, ssl_mode FROM domains'))).filter(related);
  const servers = await (await (db.all('SELECT id, name, client_id, project_id, status, ipv4 FROM servers'))).filter(related);
  const apps = await (await (db.all('SELECT id, name, kind, client_id, project_id, server_id, domain_id, database_id, status FROM applications'))).filter(related);
  const dbs = await (await (db.all('SELECT id, name, engine, client_id, project_id, server_id, status, environment FROM databases'))).filter(related);

  const serverIds = new Set([...servers.map((s) => s.id), ...domains.map((d) => d.server_id), ...apps.map((a) => a.server_id)].filter(Boolean));
  const allServers = await (await (db.all('SELECT id, name, client_id, project_id, status, ipv4 FROM servers'))).filter((s) => serverIds.has(s.id));

  for (const d of domains) {
    const k = add('domain', d.id, d.name, { status: d.status });
    link(d.project_id && add('project', d.project_id, null), k);
    if (!d.project_id && d.client_id) link(add('client', d.client_id, null), k);
    if (d.server_id) link(k, add('server', d.server_id, null));
    if (d.cloudflare_zone_id) add('cloudflare', d.id, `Cloudflare · ${d.name}`, { status: d.zone_status === 'active' ? 'operational' : 'unknown', detail: d.ssl_mode ? `SSL ${d.ssl_mode}` : null, domain_id: d.id });
  }
  for (const s of allServers) {
    const k = add('server', s.id, s.name, { status: s.status, detail: s.ipv4 });
    if (s.project_id) link(add('project', s.project_id, null), k);
    else if (s.client_id) link(add('client', s.client_id, null), k);
  }
  for (const a of apps) {
    const k = add('application', a.id, a.name, { status: a.status, detail: a.kind });
    if (a.server_id) link(add('server', a.server_id, null), k);
    else if (a.domain_id) link(add('domain', a.domain_id, null), k);
    else if (a.project_id) link(add('project', a.project_id, null), k);
    if (a.domain_id) {
      const d = domains.find((x) => x.id === a.domain_id);
      if (d?.cloudflare_zone_id) link(k, `cloudflare:${d.id}`);
    }
    if (a.database_id) link(k, add('database', a.database_id, null));
  }
  for (const d of domains) {
    if (!d.cloudflare_zone_id) continue;
    const cfKey = `cloudflare:${d.id}`;
    if (![...edges].some((e) => e.split('|')[1] === cfKey)) link(`domain:${d.id}`, cfKey);
  }
  for (const b of dbs) {
    const k = add('database', b.id, b.name, { status: b.status, detail: `${b.engine} · ${b.environment}` });
    const hasParent = [...edges].some((e) => e.split('|')[1] === k);
    if (!hasParent) {
      if (b.server_id) link(add('server', b.server_id, null), k);
      else if (b.project_id) link(add('project', b.project_id, null), k);
      else if (b.client_id) link(add('client', b.client_id, null), k);
    }
  }
  for (const r of await (db.all('SELECT * FROM infrastructure_relationships'))) {
    const a = `${r.from_type}:${r.from_id}`;
    const b = `${r.to_type}:${r.to_id}`;
    if (nodes.has(a) && nodes.has(b)) link(a, b, r.kind);
  }

  // Completa etiquetas de nodos añadidos solo como extremo de una relación
  for (const n of nodes.values()) {
    if (n.label) continue;
    const table = { client: 'clients', project: 'projects', domain: 'domains', server: 'servers', application: 'applications', database: 'databases' }[n.type];
    const row = table ? await (db.get(`SELECT * FROM ${table} WHERE id = ?`, [n.id])) : null;
    n.label = row?.company || row?.name || `${n.type} ${n.id}`;
    n.status = row?.status;
  }
  res.json({ nodes: [...nodes.values()], edges: [...edges].map((e) => { const [from, to, kind] = e.split('|'); return { from, to, kind }; }) });
});

export default router;

/** Endpoint del agente de monitorización (autenticado por token propio, sin sesión). */
export const agentRouter = Router();

const heartbeatSchema = z.object({
  version: z.string().max(20).optional(),
  hostname: z.string().max(200).optional(),
  cpu_pct: z.number().min(0).max(100).nullable().optional(),
  mem_total: z.number().int().min(0).nullable().optional(),
  mem_used: z.number().int().min(0).nullable().optional(),
  disk_total: z.number().int().min(0).nullable().optional(),
  disk_used: z.number().int().min(0).nullable().optional(),
  net_in: z.number().int().min(0).nullable().optional(),
  net_out: z.number().int().min(0).nullable().optional(),
  load1: z.number().min(0).nullable().optional(),
  uptime_s: z.number().int().min(0).nullable().optional(),
});

const AGENT_FILES = { 'pulsar-agent.mjs': 'text/javascript', 'webpulsar-agent.service': 'text/plain' };

/** Archivos públicos del agente (no contienen secretos). */
agentRouter.get('/files/:name', (req, res) => {
  const type = AGENT_FILES[req.params.name];
  if (!type) throw new HttpError(404, 'Archivo no encontrado');
  res.setHeader('Content-Type', `${type}; charset=utf-8`);
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}"`);
  res.sendFile(path.join(ROOT, 'agent', req.params.name));
});

agentRouter.post('/heartbeat', async (req, res) => {
  const token = String(req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const m = token.match(/^wpa_(\d+)_[\w-]{20,}$/);
  const server = m ? await (db.get('SELECT * FROM servers WHERE id = ?', [Number(m[1])])) : null;
  if (!server?.agent_token_hash || !safeEqual(sha256(token), server.agent_token_hash)) throw new HttpError(401, 'Token de agente no válido');
  const data = parse(heartbeatSchema, req.body);
  const at = new Date();
  at.setMilliseconds(0);
  await (db.run(
    `INSERT OR IGNORE INTO server_metrics (server_id, source, collected_at, cpu_pct, ram_used_bytes, ram_total_bytes, disk_used_bytes, disk_total_bytes, net_in_bytes, net_out_bytes, load_1, uptime_s)
     VALUES (?, 'agent', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [server.id, at.toISOString(), data.cpu_pct ?? null, data.mem_used ?? null, data.mem_total ?? null, data.disk_used ?? null, data.disk_total ?? null, data.net_in ?? null, data.net_out ?? null, data.load1 ?? null, data.uptime_s ?? null],
  ));
  await (db.run('UPDATE servers SET last_heartbeat_at = ?, agent_version = ? WHERE id = ?', [at.toISOString(), data.version ?? null, server.id]));
  const check = await (db.get("SELECT * FROM monitoring_checks WHERE type = 'heartbeat' AND entity_type = 'server' AND entity_id = ?", [server.id]));
  if (check && check.last_status !== 'up') {
    await executeCheck(check);
  } else {
    await (evaluateEntity('server', server.id));
  }
  res.json({ ok: true, interval_s: 60 });
});
