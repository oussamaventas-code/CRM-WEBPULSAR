import express, { Router } from 'express';
import { config } from '../config.js';
import { publicFormLimiter } from '../middleware/security.js';
import { db, nowIso, tx } from '../db/index.js';
import { insert } from '../lib/query.js';
import { f, parse, z } from '../lib/validate.js';
import { HttpError, badRequest } from '../lib/errors.js';
import { record } from '../lib/audit.js';
import { notify } from '../lib/notify.js';

// Endpoints públicos para la web corporativa: sin sesión ni CSRF, con CORS limitado a los orígenes configurados.
const router = Router();

router.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && config.publicForms.origins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Vary', 'Origin');
  } else if (origin) {
    return next(new HttpError(403, 'Origen no permitido'));
  }
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

const leadSchema = z.object({
  name: f.text(150),
  email: f.email(),
  phone: f.optPhone(),
  company: f.optText(150),
  service: f.optText(120),
  message: f.text(5000),
  source: f.optText(80),
  consent: z.literal(true, { errorMap: () => ({ message: 'Debes aceptar la política de privacidad' }) }),
  website: z.string().optional(), // honeypot: los humanos no lo ven, los bots lo rellenan
  turnstileToken: z.string().max(2048).optional(),
});

async function verifyTurnstile(token, ip) {
  if (!config.publicForms.turnstileSecret) return true;
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: config.publicForms.turnstileSecret, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    return (await res.json()).success === true;
  } catch {
    return false;
  }
}

router.post('/leads', publicFormLimiter, express.json({ limit: '16kb' }), async (req, res) => {
  const data = parse(leadSchema, req.body);
  if (data.website) return res.status(201).json({ ok: true });
  if (!(await verifyTurnstile(data.turnstileToken, req.ip))) throw badRequest('No se ha podido verificar que no eres un robot. Recarga la página e inténtalo de nuevo.');

  const source = data.source || 'web';
  const body = [data.service && `Servicio: ${data.service}`, data.phone && `Teléfono: ${data.phone}`, data.company && `Empresa: ${data.company}`, '', data.message, '', `Consentimiento RGPD aceptado: ${nowIso()}`]
    .filter((line) => line != null)
    .join('\n');

  const { clientId, isNew } = await (tx(async () => {
    const emailMatch = config.databaseUrl ? 'lower(email) = lower(?)' : 'email = ? COLLATE NOCASE';
    const existing = await (db.get(`SELECT id FROM clients WHERE ${emailMatch} AND deleted_at IS NULL ORDER BY id LIMIT 1`, [data.email]));
    const id = existing?.id ?? await (insert('clients', {
      name: data.name,
      company: data.company,
      email: data.email,
      phone: data.phone,
      source,
      tags: JSON.stringify(['web']),
      status: 'pending',
    }));
    await (insert('client_communications', { client_id: id, kind: 'other', subject: 'Solicitud desde la web', body, occurred_at: nowIso() }));
    return { clientId: id, isNew: !existing };
  }));

  const label = data.company ? `${data.name} (${data.company})` : data.name;
  await (record(req, {
    action: isNew ? 'client.lead_created' : 'client.lead_received',
    entityType: 'client',
    entityId: clientId,
    clientId,
    label,
    summary: isNew ? `Nuevo cliente potencial desde la web: ${label}` : `Nueva solicitud desde la web de ${label}`,
  }));
  await (notify({
    type: 'client.lead',
    title: `Nueva solicitud web: ${label}`,
    body: data.service ? `${data.service} · ${data.email}` : data.email,
    entityType: 'client',
    entityId: clientId,
    link: `/clientes/${clientId}`,
  }));
  res.status(201).json({ ok: true });
});

export default router;
