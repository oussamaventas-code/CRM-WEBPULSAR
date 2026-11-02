import { Router } from 'express';
import { config } from '../config.js';
import { safeEqual } from '../lib/crypto.js';
import { runScheduledTask } from '../services/scheduler.js';

const router = Router();

router.use((req, res, next) => {
  if (!config.cronSecret || !safeEqual(req.get('authorization'), `Bearer ${config.cronSecret}`)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
});

router.get('/:task', async (req, res) => {
  const result = await runScheduledTask(req.params.task);
  res.json({ ok: true, result: result ?? null });
});

export default router;
