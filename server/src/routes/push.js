import { Router } from 'express';
import { db } from '../db/index.js';
import { z, parse } from '../lib/validate.js';
import { badRequest } from '../lib/errors.js';
import { pushEnabled, pushPublicKey, sendPush } from '../services/push.js';

const router = Router();

const subscription = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith('https://'), 'El endpoint debe ser HTTPS'),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
});

router.get('/status', (req, res) => {
  const devices = db.value('SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?', [req.user.id]);
  res.json({ enabled: pushEnabled(), public_key: pushPublicKey(), devices });
});

router.post('/subscribe', (req, res) => {
  if (!pushEnabled()) throw badRequest('Las notificaciones push no están configuradas en el servidor (ejecuta "npm run setup").');
  const data = parse(subscription, req.body);
  db.run(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent`,
    [req.user.id, data.endpoint, data.keys.p256dh, data.keys.auth, String(req.get('user-agent') ?? '').slice(0, 300)],
  );
  res.status(201).json({ ok: true });
});

router.post('/unsubscribe', (req, res) => {
  const { endpoint } = parse(z.object({ endpoint: z.string().url().max(1000) }), req.body);
  db.run('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', [endpoint, req.user.id]);
  res.json({ ok: true });
});

router.post('/test', async (req, res) => {
  const result = await sendPush([req.user.id], { title: 'Web Pulsar', body: 'Las notificaciones funcionan en este dispositivo.', link: '/', tag: 'push-test' });
  res.json(result);
});

export default router;
