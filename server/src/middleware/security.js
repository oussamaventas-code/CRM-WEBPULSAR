import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'self'", 'https:'],
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

export const agentLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: json('Demasiados envíos del agente'),
});
