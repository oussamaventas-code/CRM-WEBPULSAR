import net from 'node:net';
import tls from 'node:tls';
import { db, nowIso, tx } from '../db/index.js';
import { getSetting } from '../lib/settings.js';
import { notify } from '../lib/notify.js';
import { record } from '../lib/audit.js';
import { daysBetween, today } from '../lib/dates.js';
import { getCredential } from '../integrations/store.js';
import { verifyHostinger } from '../integrations/hostinger.js';
import { d1Ping, verifyCloudflare } from '../integrations/cloudflare.js';

// Reglas de estado:
//  · Un recurso solo es "operativo" si una comprobación propia ha tenido éxito recientemente.
//  · Que la API del proveedor diga "running" no se considera verificación de salud.
//  · Una respuesta HTTP correcta solo verifica ese endpoint; la salud de una base de datos
//    requiere una consulta real (D1) o un endpoint de salud que la ejecute.

const SYSTEM = { system: true };

function parseRange(expected) {
  return String(expected || '200-399')
    .split(',')
    .map((part) => part.trim().split('-').map(Number))
    .map(([a, b]) => [a, Number.isFinite(b) ? b : a]);
}

function splitHostPort(target, defaultPort) {
  const t = String(target).replace(/^\w+:\/\//, '').split('/')[0];
  const m = t.match(/^\[?([^\]]+?)\]?(?::(\d+))?$/);
  return { host: m?.[1] ?? t, port: Number(m?.[2] ?? defaultPort) };
}

async function httpCheck(check, settings) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), check.timeout_ms);
  try {
    const res = await fetch(check.target, { signal: controller.signal, redirect: 'follow', headers: { 'User-Agent': 'WebPulsar-Monitor/1.0' } });
    const body = check.keyword ? (await res.text()).slice(0, 512_000) : (await res.arrayBuffer(), '');
    const latency = Math.round(performance.now() - started);
    const okStatus = parseRange(check.expected_status).some(([a, b]) => res.status >= a && res.status <= b);
    if (!okStatus) return { status: 'down', latency_ms: latency, status_code: res.status, message: `HTTP ${res.status} (esperado ${check.expected_status})` };
    if (check.keyword && !body.includes(check.keyword)) return { status: 'down', latency_ms: latency, status_code: res.status, message: `HTTP ${res.status}, pero no aparece el texto "${check.keyword}"` };
    const warn = check.latency_warn_ms ?? settings.latency_warn_ms;
    if (warn && latency > warn) return { status: 'degraded', latency_ms: latency, status_code: res.status, message: `HTTP ${res.status} lento: ${latency} ms (umbral ${warn} ms)` };
    return { status: 'up', latency_ms: latency, status_code: res.status, message: `HTTP ${res.status} en ${latency} ms` };
  } catch (err) {
    return { status: 'down', latency_ms: null, message: err.name === 'AbortError' ? `Sin respuesta en ${check.timeout_ms} ms` : `Error de conexión: ${err.cause?.code ?? err.message}` };
  } finally {
    clearTimeout(timer);
  }
}

function tcpCheck(check) {
  const { host, port } = splitHostPort(check.target, 443);
  return new Promise((resolve) => {
    const started = performance.now();
    const socket = net.connect({ host, port, timeout: check.timeout_ms });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.once('connect', () => {
      const latency = Math.round(performance.now() - started);
      done({ status: 'up', latency_ms: latency, message: `Puerto ${port} accesible en ${latency} ms` });
    });
    socket.once('timeout', () => done({ status: 'down', message: `Puerto ${port} sin respuesta en ${check.timeout_ms} ms` }));
    socket.once('error', (err) => done({ status: 'down', message: `Puerto ${port}: ${err.code ?? err.message}` }));
  });
}

function sslCheck(check, settings) {
  const { host, port } = splitHostPort(check.target, 443);
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, servername: host, timeout: check.timeout_ms, rejectUnauthorized: false });
    const done = (r) => {
      socket.destroy();
      resolve(r);
    };
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      if (!cert?.valid_to) return done({ status: 'down', message: 'No se pudo leer el certificado' });
      const expires = new Date(cert.valid_to);
      const days = Math.floor((expires.getTime() - Date.now()) / 86400000);
      const issuer = cert.issuer?.O ?? cert.issuer?.CN ?? '';
      if (!socket.authorized) return done({ status: 'down', message: `Certificado no válido: ${socket.authorizationError}`, meta: { expires } });
      if (days < 0) return done({ status: 'down', message: `Certificado caducado hace ${-days} días`, meta: { expires } });
      if (days <= settings.ssl_expiry_days) return done({ status: 'degraded', message: `El certificado caduca en ${days} días (${issuer})`, meta: { expires } });
      done({ status: 'up', message: `Certificado válido ${days} días más (${issuer})`, meta: { expires } });
    });
    socket.once('timeout', () => done({ status: 'down', message: `TLS sin respuesta en ${check.timeout_ms} ms` }));
    socket.once('error', (err) => done({ status: 'down', message: `TLS: ${err.code ?? err.message}` }));
  });
}

async function heartbeatCheck(check, settings) {
  const server = await (db.get('SELECT last_heartbeat_at, agent_token_hash FROM servers WHERE id = ?', [check.entity_id]));
  if (!server) return { status: 'down', message: 'Servidor no encontrado' };
  if (!server.agent_token_hash) return { status: 'unknown', message: 'El agente de monitorización no está configurado' };
  if (!server.last_heartbeat_at) return { status: 'down', message: 'El agente aún no ha enviado ningún heartbeat' };
  const age = Math.round((Date.now() - Date.parse(server.last_heartbeat_at)) / 1000);
  if (age > settings.heartbeat_stale_s) return { status: 'down', message: `Sin heartbeat desde hace ${Math.round(age / 60)} min` };
  return { status: 'up', message: `Último heartbeat hace ${age} s` };
}

async function domainExpiryCheck(check, settings) {
  const d = await (db.get('SELECT expires_at FROM domains WHERE id = ?', [check.entity_id]));
  if (!d?.expires_at) return { status: 'unknown', message: 'Fecha de caducidad desconocida' };
  const days = daysBetween(today(), d.expires_at.slice(0, 10));
  if (days < 0) return { status: 'down', message: `Dominio caducado hace ${-days} días` };
  if (days <= settings.domain_expiry_days) return { status: 'degraded', message: `El dominio caduca en ${days} días` };
  return { status: 'up', message: `Caduca en ${days} días` };
}

async function integrationCheck(check) {
  const key = check.target;
  const token = await (getCredential(key));
  if (!token) return { status: 'unknown', message: 'Sin credenciales configuradas' };
  const started = performance.now();
  try {
    if (key === 'hostinger') await verifyHostinger(token);
    else if (key === 'cloudflare') await verifyCloudflare(token);
    return { status: 'up', latency_ms: Math.round(performance.now() - started), message: 'Autorización válida' };
  } catch (err) {
    return { status: 'down', message: err.message, unauthorized: err.unauthorized };
  }
}

async function d1Check(check) {
  const database = await (db.get('SELECT * FROM databases WHERE id = ?', [check.entity_id]));
  if (!database?.external_id) return { status: 'unknown', message: 'Base de datos D1 sin identificador' };
  const started = performance.now();
  try {
    await d1Ping(database);
    const latency = Math.round(performance.now() - started);
    return { status: 'up', latency_ms: latency, message: `Consulta SELECT 1 correcta en ${latency} ms` };
  } catch (err) {
    return { status: 'down', message: `La consulta falló: ${err.message}` };
  }
}

export async function runCheck(check) {
  const settings = await (getSetting('monitoring'));
  switch (check.type) {
    case 'http':
      return httpCheck(check, settings);
    case 'tcp':
      return tcpCheck(check);
    case 'ssl_expiry':
      return sslCheck(check, settings);
    case 'heartbeat':
      return await (heartbeatCheck(check, settings));
    case 'domain_expiry':
      return await (domainExpiryCheck(check, settings));
    case 'integration':
      return await (integrationCheck(check));
    case 'd1_query':
      return await (d1Check(check));
    default:
      return { status: 'unknown', message: 'Tipo de comprobación no soportado' };
  }
}

const ENTITY_TABLE = { server: 'servers', domain: 'domains', database: 'databases', application: 'applications' };
const ENTITY_LABEL = { server: 'Servidor', domain: 'Dominio', database: 'Base de datos', application: 'Aplicación', integration: 'Integración' };
const ENTITY_LINK = { server: (id) => `/infraestructura/servidores/${id}`, domain: (id) => `/infraestructura/dominios/${id}`, database: () => '/infraestructura?tab=bases', application: () => '/infraestructura?tab=aplicaciones', integration: () => '/configuracion?tab=integraciones' };

async function entityName(type, id) {
  if (!ENTITY_TABLE[type] || !id) return null;
  return await (db.value(`SELECT name FROM ${ENTITY_TABLE[type]} WHERE id = ?`, [id]));
}

/** Ejecuta una comprobación, guarda el resultado y abre/cierra alertas. */
export async function executeCheck(check, ctx = SYSTEM) {
  const result = await runCheck(check);
  const checkedAt = nowIso();
  await (tx(async () => {
    if (result.status !== 'unknown') {
      await (db.run('INSERT INTO monitoring_results (check_id, status, latency_ms, status_code, message, checked_at) VALUES (?, ?, ?, ?, ?, ?)', [
        check.id, result.status, result.latency_ms ?? null, result.status_code ?? null, result.message?.slice(0, 500) ?? null, checkedAt,
      ]));
    }
    const failures = result.status === 'down' ? check.consecutive_failures + 1 : 0;
    await (db.run('UPDATE monitoring_checks SET last_status = ?, last_latency_ms = ?, last_checked_at = ?, last_message = ?, consecutive_failures = ? WHERE id = ?', [
      result.status, result.latency_ms ?? null, checkedAt, result.message?.slice(0, 500) ?? null, failures, check.id,
    ]));

    if (check.type === 'ssl_expiry' && result.meta?.expires && check.entity_type === 'domain') {
      await (db.run('UPDATE domains SET ssl_expires_at = ? WHERE id = ?', [result.meta.expires.toISOString(), check.entity_id]));
    }

    const name = await (entityName(check.entity_type, check.entity_id)) ?? check.name;
    const dedupeKey = `check:${check.id}`;
    const isExpiry = check.type === 'domain_expiry' || check.type === 'ssl_expiry';
    if (result.status === 'down' && failures >= check.failure_threshold) {
      const titles = {
        heartbeat: `Servidor sin respuesta: ${name}`,
        http: `Endpoint no disponible: ${name}`,
        tcp: `Puerto no accesible: ${name}`,
        domain_expiry: `Dominio caducado: ${name}`,
        ssl_expiry: `Certificado SSL con problemas: ${name}`,
        integration: `Integración sin autorización: ${name}`,
        d1_query: `Base de datos no responde: ${name}`,
      };
      await (openAlert(ctx, {
        checkId: check.id,
        type: `check_${check.type}`,
        severity: 'critical',
        entityType: check.entity_type,
        entityId: check.entity_id,
        title: titles[check.type] ?? `Comprobación fallida: ${check.name}`,
        message: `${result.message}. Ha fallado ${failures} ${failures === 1 ? 'vez' : 'veces'} seguidas.`,
        dedupeKey,
      }));
    } else if (result.status === 'degraded' && isExpiry) {
      await (openAlert(ctx, {
        checkId: check.id,
        type: `check_${check.type}`,
        severity: 'warning',
        entityType: check.entity_type,
        entityId: check.entity_id,
        title: check.type === 'domain_expiry' ? `Dominio próximo a caducar: ${name}` : `Certificado SSL próximo a caducar: ${name}`,
        message: result.message,
        dedupeKey,
      }));
    } else if (result.status === 'up') {
      await (resolveAlert(ctx, dedupeKey, `Recuperado: ${check.name}`));
    }
  }));
  if (check.entity_type && ENTITY_TABLE[check.entity_type]) await (evaluateEntity(check.entity_type, check.entity_id));
  return result;
}

/**
 * Abre una alerta (o actualiza la existente), notifica y, si es crítica y está activada
 * la automatización, crea una incidencia vinculada.
 */
export async function openAlert(ctx, { checkId = null, type, severity, entityType = null, entityId = null, title, message, dedupeKey, link }) {
  const now = nowIso();
  const existing = await (db.get("SELECT * FROM monitoring_alerts WHERE dedupe_key = ? AND status <> 'resolved'", [dedupeKey]));
  if (existing) {
    await (db.run('UPDATE monitoring_alerts SET occurrences = occurrences + 1, last_seen_at = ?, message = ?, severity = ? WHERE id = ?', [now, message, severity, existing.id]));
    return existing.id;
  }
  const alertId = Number(
    await (await (db.run(
      `INSERT INTO monitoring_alerts (check_id, entity_type, entity_id, type, severity, title, message, status, dedupe_key, opened_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
      [checkId, entityType, entityId, type, severity, title, message, dedupeKey, now, now],
    ))).lastInsertRowid,
  );
  const automations = await (getSetting('automations'));
  const target = link ?? (entityType && ENTITY_LINK[entityType] ? ENTITY_LINK[entityType](entityId) : '/infraestructura?tab=monitorizacion');
  const isServer = entityType === 'server';
  if (!isServer || automations.server_down) {
    await (notify({ type: 'alert.opened', title, body: message, severity: severity === 'critical' ? 'critical' : 'warning', entityType: 'alert', entityId: alertId, link: target, dedupeKey: `alert:${alertId}` }));
  }
  const clientId = entityType && ENTITY_TABLE[entityType] ? await (db.value(`SELECT client_id FROM ${ENTITY_TABLE[entityType]} WHERE id = ?`, [entityId])) : null;
  await (record(ctx, {
    action: isServer ? 'server.down' : 'alert.opened',
    entityType: entityType ?? 'alert',
    entityId: entityId ?? alertId,
    clientId,
    label: title,
    summary: title,
    data: { alert_id: alertId, severity },
  }));

  if (severity === 'critical' && automations.alert_to_incident && entityType !== 'integration') {
    await (createIncidentFromAlert(ctx, alertId));
  }
  return alertId;
}

export async function resolveAlert(ctx, dedupeKey, title) {
  const alert = await (db.get("SELECT * FROM monitoring_alerts WHERE dedupe_key = ? AND status <> 'resolved'", [dedupeKey]));
  if (!alert) return false;
  const now = nowIso();
  await (db.run("UPDATE monitoring_alerts SET status = 'resolved', resolved_at = ? WHERE id = ?", [now, alert.id]));
  await (notify({ type: 'alert.resolved', title: title ?? `Resuelto: ${alert.title}`, body: alert.title, severity: 'success', entityType: 'alert', entityId: alert.id, dedupeKey: `alert-resolved:${alert.id}` }));
  await (record(ctx, { action: 'alert.resolved', entityType: alert.entity_type ?? 'alert', entityId: alert.entity_id ?? alert.id, label: alert.title, summary: title ?? `Alerta resuelta: ${alert.title}` }));
  if (alert.incident_id) {
    await (db.run("INSERT INTO incident_events (incident_id, type, body) VALUES (?, 'alert', ?)", [alert.incident_id, 'La alerta asociada se ha recuperado automáticamente. Revisa y cierra la incidencia si procede.']));
  }
  return true;
}

export async function createIncidentFromAlert(ctx, alertId, { userId = null } = {}) {
  const alert = await (db.get('SELECT * FROM monitoring_alerts WHERE id = ?', [alertId]));
  if (!alert || alert.incident_id) return alert?.incident_id ?? null;
  const table = ENTITY_TABLE[alert.entity_type];
  const entity = table ? await (db.get(`SELECT * FROM ${table} WHERE id = ?`, [alert.entity_id])) : null;
  const res = await (db.run(
    `INSERT INTO incidents (title, description, category, client_id, project_id, server_id, domain_id, database_id, priority, status, source, opened_at, created_by)
     VALUES (?, ?, 'infrastructure', ?, ?, ?, ?, ?, ?, 'open', 'alert', ?, ?)`,
    [
      alert.title,
      alert.message,
      entity?.client_id ?? null,
      entity?.project_id ?? null,
      alert.entity_type === 'server' ? alert.entity_id : entity?.server_id ?? null,
      alert.entity_type === 'domain' ? alert.entity_id : entity?.domain_id ?? null,
      alert.entity_type === 'database' ? alert.entity_id : null,
      alert.severity === 'critical' ? 'critical' : 'high',
      nowIso(),
      userId,
    ],
  ));
  const incidentId = Number(res.lastInsertRowid);
  await (db.run('UPDATE monitoring_alerts SET incident_id = ? WHERE id = ?', [incidentId, alert.id]));
  await (db.run("INSERT INTO incident_events (incident_id, user_id, type, body) VALUES (?, ?, 'created', ?)", [incidentId, userId, `Creada a partir de la alerta: ${alert.title}`]));
  await (record(ctx, { action: 'incident.created', entityType: 'incident', entityId: incidentId, clientId: entity?.client_id ?? null, label: alert.title, summary: `Incidencia creada desde alerta: ${alert.title}` }));
  return incidentId;
}

// ── Estado agregado de cada recurso ──────────────────────
async function checksFor(type, id) {
  return await (db.all("SELECT * FROM monitoring_checks WHERE entity_type = ? AND entity_id = ? AND enabled = 1 AND last_status <> 'unknown'", [type, id]));
}

const STOPPED = new Set(['stopped', 'stopping', 'error', 'suspended', 'suspending', 'destroyed', 'destroying']);

export async function evaluateServer(serverId) {
  const server = await (db.get('SELECT * FROM servers WHERE id = ?', [serverId]));
  if (!server) return;
  const settings = await (getSetting('monitoring'));
  const checks = await (checksFor('server', serverId));
  const down = [];
  const warn = [];
  let verified = false;

  if (server.provider_state && STOPPED.has(server.provider_state)) down.push(`Hostinger informa estado "${server.provider_state}"`);
  for (const c of checks) {
    if (c.last_status === 'down') down.push(`${c.name}: ${c.last_message}`);
    else if (c.last_status === 'degraded') {
      verified = true;
      warn.push(`${c.name}: ${c.last_message}`);
    } else if (c.last_status === 'up') verified = true;
  }

  const metric = await (db.get('SELECT * FROM server_metrics WHERE server_id = ? AND collected_at >= ? ORDER BY collected_at DESC LIMIT 1', [serverId, new Date(Date.now() - 20 * 60_000).toISOString()]));
  if (metric) {
    if (metric.cpu_pct != null && metric.cpu_pct >= settings.cpu_warn_pct) warn.push(`CPU al ${Math.round(metric.cpu_pct)} %`);
    if (metric.ram_total_bytes && metric.ram_used_bytes != null) {
      const pct = (metric.ram_used_bytes / metric.ram_total_bytes) * 100;
      if (pct >= settings.ram_warn_pct) warn.push(`RAM al ${Math.round(pct)} %`);
    }
    if (metric.disk_total_bytes && metric.disk_used_bytes != null) {
      const pct = (metric.disk_used_bytes / metric.disk_total_bytes) * 100;
      if (pct >= settings.disk_warn_pct) warn.push(`Disco al ${Math.round(pct)} %`);
    }
  }

  let status;
  let reason;
  if (down.length) [status, reason] = ['down', down.join(' · ')];
  else if (warn.length) [status, reason] = ['warning', warn.join(' · ')];
  else if (verified) [status, reason] = ['operational', 'Verificado por comprobaciones propias'];
  else {
    status = 'unknown';
    reason = server.provider_state
      ? `Sin verificación propia. El proveedor indica "${server.provider_state}", pero no se ha comprobado la salud del servidor.`
      : 'Sin comprobaciones configuradas. Instala el agente o añade una comprobación.';
  }
  const lastCheck = checks.reduce((max, c) => (c.last_checked_at > (max ?? '') ? c.last_checked_at : max), server.last_heartbeat_at);
  await (db.run('UPDATE servers SET status = ?, status_reason = ?, last_check_at = ? WHERE id = ?', [status, reason, lastCheck ?? null, serverId]));
}

async function evaluateGeneric(type, id) {
  const table = ENTITY_TABLE[type];
  const row = await (db.get(`SELECT * FROM ${table} WHERE id = ?`, [id]));
  if (!row) return;
  const checks = await (checksFor(type, id));
  const down = checks.filter((c) => c.last_status === 'down');
  const degraded = checks.filter((c) => c.last_status === 'degraded');
  const up = checks.filter((c) => c.last_status === 'up');
  // Para bases de datos, solo una consulta real (d1_query) o un endpoint de salud HTTP verifica disponibilidad.
  const verifying = type === 'database' ? up.filter((c) => c.type === 'd1_query' || c.type === 'http') : up.filter((c) => c.type !== 'domain_expiry');
  let status = 'unknown';
  let reason = type === 'database' && up.some((c) => c.type === 'tcp') ? 'Puerto accesible, pero no se ha verificado ninguna consulta' : 'Sin comprobaciones propias';
  if (down.length) [status, reason] = ['down', down.map((c) => `${c.name}: ${c.last_message}`).join(' · ')];
  else if (degraded.length) [status, reason] = ['warning', degraded.map((c) => `${c.name}: ${c.last_message}`).join(' · ')];
  else if (verifying.length) [status, reason] = ['operational', verifying.map((c) => c.last_message).join(' · ')];
  else if (type === 'domain' && up.length) reason = 'Caducidad correcta; la disponibilidad web no está comprobada';
  const lastCheck = checks.reduce((max, c) => (c.last_checked_at > (max ?? '') ? c.last_checked_at : max), null);
  await (db.run(`UPDATE ${table} SET status = ?, status_reason = ?, last_check_at = ? WHERE id = ?`, [status, reason, lastCheck, id]));
}

export async function evaluateEntity(type, id) {
  if (type === 'server') return await (evaluateServer(id));
  if (ENTITY_TABLE[type]) return await (evaluateGeneric(type, id));
}

let running = false;
/** Ejecuta las comprobaciones vencidas con concurrencia limitada. */
export async function runDueChecks({ limit = 25, concurrency = 6 } = {}) {
  if (running) return 0;
  running = true;
  try {
    const now = Date.now();
    const due = await (await (db
      .all('SELECT * FROM monitoring_checks WHERE enabled = 1 AND is_demo = 0 ORDER BY last_checked_at IS NOT NULL, last_checked_at LIMIT 200')))
      .filter((c) => !c.last_checked_at || Date.parse(c.last_checked_at) + c.interval_s * 1000 <= now)
      .slice(0, limit);
    const queue = [...due];
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) {
        const check = queue.shift();
        try {
          await executeCheck(check);
        } catch (err) {
          console.error(`[monitor] Comprobación ${check.id} falló al ejecutarse:`, err.message);
        }
      }
    });
    await Promise.all(workers);
    return due.length;
  } finally {
    running = false;
  }
}

/** Uptime por comprobación en una ventana (porcentaje de resultados up/degraded). */
export async function uptime(checkId, hours) {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const r = await (db.get("SELECT COUNT(*) AS total, COUNT(CASE WHEN status <> 'down' THEN 1 END) AS ok, AVG(latency_ms) AS avg_latency FROM monitoring_results WHERE check_id = ? AND checked_at >= ?", [checkId, since]));
  return { total: r.total, pct: r.total ? Math.round((r.ok / r.total) * 10000) / 100 : null, avg_latency_ms: r.avg_latency ? Math.round(r.avg_latency) : null };
}

/** Barras horarias de disponibilidad (últimas N horas). */
export async function uptimeBars(checkId, hours = 48) {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const rows = await (db.all(
    "SELECT substr(checked_at, 1, 13) AS hour, COUNT(*) AS total, COUNT(CASE WHEN status = 'down' THEN 1 END) AS down, COUNT(CASE WHEN status = 'degraded' THEN 1 END) AS degraded FROM monitoring_results WHERE check_id = ? AND checked_at >= ? GROUP BY 1",
    [checkId, since],
  ));
  const map = new Map(rows.map((r) => [r.hour, r]));
  const bars = [];
  for (let i = hours - 1; i >= 0; i--) {
    const key = new Date(Date.now() - i * 3600_000).toISOString().slice(0, 13);
    const r = map.get(key);
    bars.push({ hour: key, status: !r ? 'none' : r.down ? (r.down === r.total ? 'down' : 'partial') : r.degraded ? 'degraded' : 'up' });
  }
  return bars;
}

export { ENTITY_LABEL };
