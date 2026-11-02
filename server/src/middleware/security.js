import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';

const connectSrc = ["'self'"];
if (config.supabaseUrl) {
  try { connectSrc.push(new URL(config.supabaseUrl).origin); } catch { /* config validation reports an invalid URL during production start */ }
}

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc,
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'same-origin' },
});

const json = (message) => (_req, res) => res.status(429).json({ error: message });

export const apiLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 1500,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: json('Demasiadas peticiones. Espera unos minutos.'),
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: json('Demasiados intentos de acceso. Inténtalo de nuevo en 15 minutos.'),
});

export const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: json('Demasiados intentos. Espera unos minutos.'),
});

export const publicFormLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: json('Has enviado demasiadas solicitudes. Inténtalo de nuevo más tarde.'),
});

export const agentLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: json('Demasiados envíos del agente'),
});
