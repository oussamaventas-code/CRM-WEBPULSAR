import { db, nowIso } from '../db/index.js';
import { sha256 } from './crypto.js';

const SENSITIVE = /(password|secret|token|_enc$|hash$|^iban$)/i;

export function redact(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE.test(k) ? (v == null ? v : '[oculto]') : redact(v)]));
}

function auditHash(row) {
  return sha256(
    JSON.stringify([row.user_id, row.action, row.entity_type, row.entity_id, row.before_data, row.after_data, row.ip, row.user_agent, row.created_at, row.prev_hash]),
  );
}

/**
 * Registra una operación en la cronología (activity_logs) y en la auditoría encadenada (audit_logs).
 * ctx es la petición Express o { system: true } para procesos programados.
 */
export async function record(ctx, { action, entityType = null, entityId = null, label = null, summary, clientId = null, before, after, data, isDemo = false }) {
  const userId = ctx?.user?.id ?? null;
  const ip = ctx?.ip ?? null;
  const userAgent = typeof ctx?.get === 'function' ? ctx.get('user-agent')?.slice(0, 300) ?? null : null;
  const createdAt = nowIso();

  await (db.run(
    `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, entity_label, client_id, summary, data, ip, is_demo, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, action, entityType, entityId, label, clientId, summary, data ? JSON.stringify(redact(data)) : null, ip, isDemo ? 1 : 0, createdAt],
  ));

  const row = {
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    before_data: before ? JSON.stringify(redact(before)) : null,
    after_data: after ? JSON.stringify(redact(after)) : null,
    ip,
    user_agent: userAgent,
    created_at: createdAt,
    prev_hash: await (db.value('SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1')) ?? null,
  };
  row.hash = auditHash(row);
  await (db.run(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, before_data, after_data, ip, user_agent, created_at, prev_hash, hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.user_id, row.action, row.entity_type, row.entity_id, row.before_data, row.after_data, row.ip, row.user_agent, row.created_at, row.prev_hash, row.hash],
  ));
}

/** Recalcula la cadena completa y devuelve la primera fila alterada, si la hay. */
export async function verifyAuditChain() {
  let prev = null;
  let count = 0;
  for (const row of await (db.all('SELECT * FROM audit_logs ORDER BY id ASC'))) {
    count += 1;
    if (row.prev_hash !== prev || auditHash(row) !== row.hash) return { ok: false, count, brokenAt: row.id };
    prev = row.hash;
  }
  return { ok: true, count };
}

export async function logAccess(req, { userId = null, email = null, event }) {
  await (db.run('INSERT INTO access_logs (user_id, email, event, ip, user_agent) VALUES (?, ?, ?, ?, ?)', [
    userId,
    email,
    event,
    req.ip ?? null,
    req.get?.('user-agent')?.slice(0, 300) ?? null,
  ]));
}
