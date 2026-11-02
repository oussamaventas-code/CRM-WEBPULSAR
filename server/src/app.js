import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { config } from './config.js';
import { ensureDatabase } from './db/ready.js';
import { HttpError, fromSqliteError } from './lib/errors.js';
import { securityHeaders, apiLimiter, agentLimiter } from './middleware/security.js';
import { authenticate, csrfProtect, requireAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import clientRoutes from './routes/clients.js';
import projectRoutes, { taskRouter } from './routes/projects.js';
import serviceRoutes, { clientServiceRouter } from './routes/services.js';
import documentRoutes from './routes/documents.js';
import secretRoutes from './routes/secrets.js';
import financeRoutes from './routes/finance.js';
import infrastructureRoutes, { agentRouter } from './routes/infrastructure.js';
import integrationRoutes from './routes/integrations.js';
import monitoringRoutes from './routes/monitoring.js';
import incidentRoutes from './routes/incidents.js';
import testimonialRoutes from './routes/testimonials.js';
import adminRoutes from './routes/admin.js';
import dashboardRoutes from './routes/dashboard.js';
import cronRoutes from './routes/cron.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(securityHeaders);
  if (config.databaseUrl) {
    app.use(async (_req, _res, next) => {
      try { await ensureDatabase(); next(); } catch (error) { next(error); }
    });
  }

  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/api/healthz', (_req, res) => res.json({ ok: true }));
  app.use('/api/cron', cronRoutes);

  // Agente de monitorización: autenticación por token propio, sin cookies.
  app.use('/api/agent', agentLimiter, express.json({ limit: '32kb' }), agentRouter);

  // Formularios de la web pública: sin sesión, CORS solo para PUBLIC_FORM_ORIGINS.
  app.use('/api/public', publicRoutes);

  const api = express.Router();
  api.use(express.json({ limit: '1mb' }), cookieParser(), apiLimiter, authenticate, csrfProtect);
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use('/auth', authRoutes);
  api.use(requireAuth);
  api.use('/', dashboardRoutes);
  api.use('/clients', clientRoutes);
  api.use('/projects', projectRoutes);
  api.use('/tasks', taskRouter);
  api.use('/services', serviceRoutes);
  api.use('/client-services', clientServiceRouter);
  api.use('/documents', documentRoutes);
  api.use('/secrets', secretRoutes);
  api.use('/', financeRoutes);
  api.use('/infrastructure', infrastructureRoutes);
  api.use('/integrations', integrationRoutes);
  api.use('/monitoring', monitoringRoutes);
  api.use('/incidents', incidentRoutes);
  api.use('/testimonials', testimonialRoutes);
  api.use('/', adminRoutes);
  api.use((_req, _res, next) => next(new HttpError(404, 'Ruta de API no encontrada')));
  app.use('/api', api);

  // Frontend compilado (producción)
  if (fs.existsSync(path.join(config.webDist, 'index.html'))) {
    app.use(express.static(config.webDist, { index: false, maxAge: '1y', immutable: true, setHeaders: (res, file) => file.endsWith('.html') && res.setHeader('Cache-Control', 'no-cache') }));
    app.get('/{*splat}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(config.webDist, 'index.html'));
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    let error = err;
    if (err instanceof multer.MulterError) error = new HttpError(400, err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño máximo (25 MB)' : 'Archivo no válido');
    else if (err?.type === 'entity.parse.failed') error = new HttpError(400, 'JSON no válido');
    else if (err?.type === 'entity.too.large') error = new HttpError(413, 'La petición es demasiado grande');
    else if (!(err instanceof HttpError)) error = fromSqliteError(err) ?? err;

    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message, ...error.extra });
    console.error(`[error] ${req.method} ${req.originalUrl}:`, err?.stack ?? err);
    res.status(500).json({ error: 'Error interno del servidor. Se ha registrado para su revisión.' });
  });

  return app;
}
