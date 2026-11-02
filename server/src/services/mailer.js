import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { getCredential, getIntegration } from '../integrations/store.js';
import { HttpError } from '../lib/errors.js';

// Correo saliente vía SMTP. Configurable por variables de entorno o desde Configuración → Integraciones.

async function smtpConfig() {
  if (config.envSecrets.smtp) return { ...config.envSecrets.smtp, source: 'env' };
  const integration = await (getIntegration('smtp'));
  if (!integration?.config?.host) return null;
  return { ...integration.config, pass: integration.secret_enc ? await (getCredential('smtp')) : null, source: 'db' };
}

export async function mailerStatus() {
  const cfg = await (smtpConfig());
  return { ready: !!(cfg?.host && cfg?.from), source: cfg?.source ?? null };
}

function transport(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port || 587),
    secure: !!cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    connectionTimeout: 15000,
  });
}

export async function verifyMailer() {
  const cfg = await (smtpConfig());
  if (!cfg?.host) throw new HttpError(409, 'Configura primero el servidor SMTP');
  await transport(cfg).verify();
  return true;
}

export async function sendMail({ to, subject, text, attachments }) {
  const cfg = await (smtpConfig());
  if (!cfg?.host || !cfg?.from) throw new HttpError(409, 'El correo saliente no está configurado. Ve a Configuración → Integraciones → Correo saliente.');
  return transport(cfg).sendMail({ from: cfg.from, to, subject, text, attachments });
}
