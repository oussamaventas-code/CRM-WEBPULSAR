import { db } from '../db/index.js';
import { config } from '../config.js';
import { getSetting } from '../lib/settings.js';
import { mailerStatus, sendMail } from './mailer.js';

/**
 * Envía por correo un aviso interno a los usuarios activos indicados.
 * Es un extra: si el SMTP no está configurado o el interruptor está apagado no hace nada y nunca lanza.
 */
export async function emailNotification(userIds, { title, body = '', link = '/' }) {
  if (!userIds?.length || !getSetting('automations').email_notifications || !mailerStatus().ready) return { sent: 0, failed: 0 };
  const users = db.all(`SELECT email FROM users WHERE status = 'active' AND email IS NOT NULL AND id IN (${userIds.map(() => '?').join(', ')})`, userIds);
  const text = `${title}\n${body ? `\n${body}\n` : ''}\nAbrir en Web Pulsar: ${config.appUrl}${link}\n\n—\nPuedes desactivar estos correos en Configuración → Monitorización y avisos.`;
  let sent = 0;
  let failed = 0;
  for (const u of users) {
    try {
      await sendMail({ to: u.email, subject: `Web Pulsar · ${title}`.slice(0, 200), text });
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error('[email] aviso no enviado:', err.message);
    }
  }
  return { sent, failed };
}
