import { db } from '../db/index.js';
import { sendPush } from '../services/push.js';
import { emailNotification } from '../services/notifyEmail.js';

/**
 * Crea una notificación interna para cada usuario activo (o los indicados).
 * dedupeKey evita repetir el mismo aviso: se ignora si ya existe para ese usuario.
 */
export function notify({ userIds, excludeUserId, type, title, body = null, severity = 'info', entityType = null, entityId = null, link = null, dedupeKey = null }) {
  const targets = userIds?.length ? userIds : db.all("SELECT id FROM users WHERE status = 'active'").map((u) => u.id);
  let created = 0;
  const notified = [];
  for (const userId of targets) {
    if (userId === excludeUserId) continue;
    const res = db.run(
      `INSERT OR IGNORE INTO notifications (user_id, type, title, body, severity, entity_type, entity_id, link, dedupe_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, type, title, body, severity, entityType, entityId, link, dedupeKey],
    );
    if (Number(res.changes)) notified.push(userId);
    created += Number(res.changes);
  }
  // Push al móvil solo para avisos nuevos (los repetidos por dedupe_key no vuelven a sonar).
  if (notified.length) {
    sendPush(notified, { title, body: body ?? '', link: link ?? '/', tag: dedupeKey ?? type }).catch(() => {});
    emailNotification(notified, { title, body: body ?? '', link: link ?? '/' }).catch(() => {});
  }
  return created;
}
