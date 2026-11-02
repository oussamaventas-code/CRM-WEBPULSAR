import { config } from '../config.js';
import { db, nowIso } from '../db/index.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { permissionsForRole } from './rbac.js';

const TOUCH_EVERY_MS = 60_000;

export async function createSession(user, req) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.session.ttlHours * 3600_000).toISOString();
  await (db.run('INSERT INTO sessions (id, user_id, csrf_token, ip, user_agent, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    sha256(token),
    user.id,
    csrf,
    req.ip ?? null,
    req.get('user-agent')?.slice(0, 300) ?? null,
    now.toISOString(),
    now.toISOString(),
    expiresAt,
  ]));
  return { token, csrf, expiresAt };
}

/** Devuelve { session, user, permissions } o null si la sesión no existe, caducó o quedó inactiva. */
export async function loadSession(token) {
  if (!token || token.length > 100) return null;
  const id = sha256(token);
  const row = await (db.get(
    `SELECT s.*, u.email, u.name, u.role_id, u.is_owner, u.status AS user_status, r.key AS role_key, r.name AS role_name
     FROM sessions s JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = u.role_id WHERE s.id = ?`,
    [id],
  ));
  if (!row) return null;
  const now = Date.now();
  const idleLimit = Date.parse(row.last_seen_at) + config.session.idleMinutes * 60_000;
  if (row.user_status !== 'active' || Date.parse(row.expires_at) < now || idleLimit < now) {
    await (db.run('DELETE FROM sessions WHERE id = ?', [id]));
    return null;
  }
  if (now - Date.parse(row.last_seen_at) > TOUCH_EVERY_MS) await (db.run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', [nowIso(), id]));
  return {
    session: { id, csrf_token: row.csrf_token, created_at: row.created_at, expires_at: row.expires_at },
    user: { id: row.user_id, email: row.email, name: row.name, role_id: row.role_id, role: row.role_key, role_name: row.role_name, is_owner: !!row.is_owner },
    permissions: await (permissionsForRole(row.role_id)),
  };
}

export const destroySession = async (sessionId) => await (db.run('DELETE FROM sessions WHERE id = ?', [sessionId]));

export async function destroyUserSessions(userId, exceptSessionId = null) {
  const except = config.databaseUrl ? 'id IS DISTINCT FROM ?' : 'id IS NOT ?';
  await (db.run(`DELETE FROM sessions WHERE user_id = ? AND ${except}`, [userId, exceptSessionId]));
}

export function cookieOptions(expiresAt) {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.session.secure,
    path: '/',
    expires: expiresAt ? new Date(expiresAt) : undefined,
  };
}

export const purgeExpiredSessions = async () => await (db.run('DELETE FROM sessions WHERE expires_at < ?', [nowIso()]));
