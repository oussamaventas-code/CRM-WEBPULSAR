import { db, nowIso, tx } from '../db/index.js';
import { ProviderError, getCredential, providerFetch } from './store.js';

// Conector de la API oficial de Hostinger (https://developers.hostinger.com).
// Endpoints verificados contra su especificación OpenAPI:
//   GET  /api/vps/v1/virtual-machines                         → lista de VPS
//   GET  /api/vps/v1/virtual-machines/{id}/metrics            → cpu_usage, ram_usage, disk_space, incoming/outgoing_traffic, uptime
//   GET  /api/vps/v1/data-centers                             → ubicación del centro de datos
//   POST /api/vps/v1/virtual-machines/{id}/start|stop|restart → acciones de energía
//   GET  /api/domains/v1/portfolio                            → dominios y caducidad
//   GET  /api/billing/v1/subscriptions                        → suscripciones y renovaciones

const BASE = 'https://developers.hostinger.com';
const P = 'Hostinger';

const call = (path, token, opts) => providerFetch(P, `${BASE}${path}`, { token, ...opts });
const unwrap = (res) => (Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : res?.data ?? res);

const CAPABILITY_PATHS = {
  vps: '/api/vps/v1/virtual-machines',
  domains: '/api/domains/v1/portfolio',
  billing: '/api/billing/v1/subscriptions',
};

/** Comprueba el token y qué áreas puede consultar. */
export async function verifyHostinger(token) {
  const capabilities = {};
  for (const [cap, path] of Object.entries(CAPABILITY_PATHS)) {
    try {
      await call(path, token);
      capabilities[cap] = { ok: true };
    } catch (err) {
      if (err.status === 401) throw err;
      capabilities[cap] = { ok: false, status: err.status, error: err.message };
    }
  }
  if (!Object.values(capabilities).some((c) => c.ok)) throw new ProviderError(P, 403, 'El token no tiene acceso a VPS, dominios ni facturación');
  return capabilities;
}

const providerId = async () => await (db.value("SELECT id FROM providers WHERE key = 'hostinger'"));

function mergeMetrics(raw) {
  const data = raw?.data ?? raw ?? {};
  const rows = new Map();
  const put = (metric, column, transform = (v) => v) => {
    for (const [ts, value] of Object.entries(data[metric]?.usage ?? {})) {
      const key = Number(ts);
      if (!rows.has(key)) rows.set(key, {});
      rows.get(key)[column] = value == null ? null : transform(Number(value));
    }
  };
  put('cpu_usage', 'cpu_pct');
  put('ram_usage', 'ram_used_bytes', Math.round);
  put('disk_space', 'disk_used_bytes', Math.round);
  put('incoming_traffic', 'net_in_bytes', Math.round);
  put('outgoing_traffic', 'net_out_bytes', Math.round);
  put('uptime', 'uptime_s', (ms) => Math.round(ms / 1000));
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([ts, values]) => ({ collected_at: new Date(ts * 1000).toISOString(), ...values }));
}

export async function fetchVmMetrics(token, externalId, hours = 3) {
  const to = new Date();
  const from = new Date(to.getTime() - hours * 3600_000);
  const qs = `date_from=${encodeURIComponent(from.toISOString().replace(/\.\d{3}Z$/, 'Z'))}&date_to=${encodeURIComponent(to.toISOString().replace(/\.\d{3}Z$/, 'Z'))}`;
  return mergeMetrics(await call(`/api/vps/v1/virtual-machines/${encodeURIComponent(externalId)}/metrics?${qs}`, token));
}

export async function storeMetrics(serverId, source, rows, totals = {}) {
  let inserted = 0;
  for (const r of rows) {
    const res = await (db.run(
      `INSERT OR IGNORE INTO server_metrics (server_id, source, collected_at, cpu_pct, ram_used_bytes, ram_total_bytes, disk_used_bytes, disk_total_bytes, net_in_bytes, net_out_bytes, load_1, uptime_s)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [serverId, source, r.collected_at, r.cpu_pct ?? null, r.ram_used_bytes ?? null, r.ram_total_bytes ?? totals.ram ?? null, r.disk_used_bytes ?? null, r.disk_total_bytes ?? totals.disk ?? null, r.net_in_bytes ?? null, r.net_out_bytes ?? null, r.load_1 ?? null, r.uptime_s ?? null],
    ));
    inserted += Number(res.changes);
  }
  return inserted;
}

/** Sincroniza VPS, métricas y dominios. Devuelve un informe con lo realizado y las limitaciones encontradas. */
export async function syncHostinger() {
  const token = await (getCredential('hostinger'));
  if (!token) throw new ProviderError(P, 0, 'Hostinger no está configurado');
  const report = { servers: { created: 0, updated: 0 }, metrics: 0, domains: { created: 0, updated: 0 }, subscriptions: [], warnings: [] };
  const pid = await (providerId());

  let centers = new Map();
  try {
    centers = new Map(unwrap(await call('/api/vps/v1/data-centers', token)).map((d) => [d.id, d]));
  } catch (err) {
    if (err.unauthorized && err.status === 401) throw err;
    report.warnings.push(`Centros de datos no disponibles: ${err.message}`);
  }

  let vms = [];
  try {
    vms = unwrap(await call('/api/vps/v1/virtual-machines', token)) ?? [];
  } catch (err) {
    if (err.status === 401) throw err;
    report.warnings.push(`VPS no disponibles con este token: ${err.message}`);
  }

  const syncedServers = [];
  for (const vm of vms) {
    const dc = centers.get(vm.data_center_id);
    const fields = {
      hostname: vm.hostname ?? null,
      ipv4: vm.ipv4?.[0]?.address ?? null,
      ipv6: vm.ipv6?.[0]?.address ?? null,
      os: vm.template?.name ?? null,
      region: dc ? [dc.city, dc.location?.toUpperCase()].filter(Boolean).join(', ') : null,
      plan: vm.plan ?? null,
      cpu_cores: vm.cpus ?? null,
      ram_mb: vm.memory ?? null,
      disk_mb: vm.disk ?? null,
      bandwidth_mb: vm.bandwidth ?? null,
      provider_state: vm.state ?? null,
      provisioned_at: vm.created_at ?? null,
    };
    const existing = await (db.get('SELECT id FROM servers WHERE provider_id = ? AND external_id = ?', [pid, String(vm.id)]));
    const id = await (tx(async () => {
      if (existing) {
        const keys = Object.keys(fields);
        await (db.run(`UPDATE servers SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...keys.map((k) => fields[k]), nowIso(), existing.id]));
        report.servers.updated += 1;
        return existing.id;
      }
      const res = await (db.run(
        `INSERT INTO servers (name, provider_id, source, external_id, ${Object.keys(fields).join(', ')}) VALUES (?, ?, 'hostinger', ?, ${Object.keys(fields).map(() => '?').join(', ')})`,
        [vm.hostname || `VPS ${vm.id}`, pid, String(vm.id), ...Object.values(fields)],
      ));
      report.servers.created += 1;
      return Number(res.lastInsertRowid);
    }));
    syncedServers.push(id);

    try {
      const rows = await fetchVmMetrics(token, vm.id);
      report.metrics += await (storeMetrics(id, 'hostinger', rows, { ram: vm.memory ? vm.memory * 1024 * 1024 : null, disk: vm.disk ? vm.disk * 1024 * 1024 : null }));
    } catch (err) {
      if (err.status === 401) throw err;
      report.warnings.push(`Métricas de ${vm.hostname || vm.id} no disponibles: ${err.message}`);
    }
  }

  try {
    const domains = unwrap(await call('/api/domains/v1/portfolio', token)) ?? [];
    for (const d of domains) {
      if (!d.domain) continue;
      const expires = d.expires_at ? String(d.expires_at).slice(0, 10) : null;
      const existing = await (db.get('SELECT id FROM domains WHERE name = ?', [d.domain]));
      if (existing) {
        await (db.run('UPDATE domains SET registrar = ?, hostinger_domain_id = ?, expires_at = COALESCE(?, expires_at), last_synced_at = ?, updated_at = ? WHERE id = ?', ['Hostinger', String(d.id), expires, nowIso(), nowIso(), existing.id]));
        report.domains.updated += 1;
      } else {
        await (db.run('INSERT INTO domains (name, registrar, hostinger_domain_id, expires_at, last_synced_at) VALUES (?, ?, ?, ?, ?)', [d.domain, 'Hostinger', String(d.id), expires, nowIso()]));
        report.domains.created += 1;
      }
    }
  } catch (err) {
    if (err.status === 401) throw err;
    report.warnings.push(`Dominios no disponibles con este token: ${err.message}`);
  }

  try {
    const subs = unwrap(await call('/api/billing/v1/subscriptions', token)) ?? [];
    report.subscriptions = subs.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      currency: s.currency_code,
      renewal_price_cents: s.renewal_price ?? null,
      auto_renew: s.is_auto_renewed ?? null,
      expires_at: s.expires_at ?? null,
      next_billing_at: s.next_billing_at ?? null,
    }));
  } catch (err) {
    if (err.status === 401) throw err;
    report.warnings.push(`Suscripciones no disponibles con este token: ${err.message}`);
  }

  return { report, serverIds: syncedServers };
}

const ACTIONS = { start: 'start', stop: 'stop', restart: 'restart' };

export async function powerAction(server, action) {
  if (!ACTIONS[action]) throw new ProviderError(P, 400, 'Acción no válida');
  if (server.source !== 'hostinger' || !server.external_id) throw new ProviderError(P, 400, 'El servidor no está vinculado a Hostinger');
  const token = await (getCredential('hostinger'));
  if (!token) throw new ProviderError(P, 0, 'Hostinger no está configurado');
  return call(`/api/vps/v1/virtual-machines/${encodeURIComponent(server.external_id)}/${ACTIONS[action]}`, token, { method: 'POST' });
}
