import webpush from 'web-push';
import { db, nowIso } from '../db/index.js';
import { config } from '../config.js';

const { publicKey, privateKey, subject } = config.push;
const enabled = !!(publicKey && privateKey);
if (enabled) webpush.setVapidDetails(subject, publicKey, privateKey);

export const pushEnabled = () => enabled;
export const pushPublicKey = () => (enabled ? publicKey : null);

/** Envía una notificación a todos los dispositivos de los usuarios indicados. Nunca lanza: el push es un extra. */
export async function sendPush(userIds, { title, body = '', link = '/', tag }) {
  if (!enabled || !userIds?.length) return { sent: 0, removed: 0 };
  const rows = db.all(`SELECT * FROM push_subscriptions WHERE user_id IN (${userIds.map(() => '?').join(', ')})`, userIds);
  const payload = JSON.stringify({ title, body, link, tag });
  let sent = 0;
  let removed = 0;
  await Promise.all(
    rows.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: 'high' });
        db.run('UPDATE push_subscriptions SET last_used_at = ? WHERE id = ?', [nowIso(), s.id]);
        sent += 1;
      } catch (err) {
        // 404/410: el dispositivo ya no existe (desinstalado o permiso revocado).
        if (err.statusCode === 404 || err.statusCode === 410) {
          db.run('DELETE FROM push_subscriptions WHERE id = ?', [s.id]);
          removed += 1;
        } else console.error('[push] envío fallido:', err.statusCode ?? err.message);
      }
    }),
  );
  return { sent, removed };
}
