import { db } from '../db/index.js';

/**
 * Crea una notificación interna para cada usuario activo (o los indicados).
 * dedupeKey evita repetir el mismo aviso: se ignora si ya existe para ese usuario.
 */
export async function notify({ userIds, excludeUserId, type, title, body = null, severity = 'info', entityType = null, entityId = null, link = null, dedupeKey = null }) {
  const targets = userIds?.length ? userIds : await (await (db.all("SELECT id FROM users WHERE status = 'active'"))).map((u) => u.id);
  let created = 0;
  for (const userId of targets) {
    if (userId === excludeUserId) continue;
    const res = await (db.run(
      `INSERT OR IGNORE INTO notifications (user_id, type, title, body, severity, entity_type, entity_id, link, dedupe_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, type, title, body, severity, entityType, entityId, link, dedupeKey],
    ));
    created += Number(res.changes);
  }
  return created;
}
