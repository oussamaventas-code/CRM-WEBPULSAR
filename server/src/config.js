import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const fromRoot = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));

function readMasterKey() {
  if (!env.MASTER_KEY) return null;
  const key = Buffer.from(env.MASTER_KEY, 'base64');
  if (key.length !== 32) throw new Error('MASTER_KEY debe contener 32 bytes en base64 (ejecuta "npm run setup").');
  return key;
}

export const config = {
  isProd,
  isTest: env.NODE_ENV === 'test',
  isVercel: Boolean(env.VERCEL),
  host: env.HOST || '127.0.0.1',
  port: Number(env.API_PORT || 4000),
  appUrl: (env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  trustProxy: isProd || env.TRUST_PROXY === '1' ? 1 : false,
  databasePath: env.DATABASE_PATH === ':memory:' ? ':memory:' : fromRoot(env.DATABASE_PATH || 'data/webpulsar.db'),
  databaseUrl: env.DATABASE_URL || null,
  supabaseUrl: env.SUPABASE_URL || null,
  supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || null,
  supabaseStorageBucket: env.SUPABASE_STORAGE_BUCKET || 'crm-documents',
  cronSecret: env.CRON_SECRET || null,
  uploadsDir: fromRoot(env.UPLOADS_DIR || 'data/uploads'),
  backupsDir: fromRoot(env.BACKUPS_DIR || 'data/backups'),
  webDist: path.join(ROOT, 'web', 'dist'),
  migrationsDir: path.join(ROOT, 'server', 'migrations'),
  masterKey: readMasterKey(),
  session: {
    ttlHours: Number(env.SESSION_TTL_HOURS || 12),
    idleMinutes: Number(env.SESSION_IDLE_MINUTES || 120),
    cookieName: isProd ? '__Host-wp_session' : 'wp_session',
    secure: isProd || env.COOKIE_SECURE === '1',
  },
  schedulerEnabled: env.SCHEDULER_ENABLED !== '0' && !env.VERCEL,
  publicForms: {
    origins: (env.PUBLIC_FORM_ORIGINS || '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean),
    turnstileSecret: env.TURNSTILE_SECRET_KEY || null,
  },
  backups: { keep: Number(env.BACKUP_KEEP || 14), hour: Number(env.BACKUP_HOUR || 3) },
  envSecrets: {
    hostinger: env.HOSTINGER_API_TOKEN || null,
    cloudflare: env.CLOUDFLARE_API_TOKEN || null,
    cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID || null,
    smtp: env.SMTP_HOST
      ? {
          host: env.SMTP_HOST,
          port: Number(env.SMTP_PORT || 587),
          secure: env.SMTP_SECURE === '1',
          user: env.SMTP_USER || null,
          pass: env.SMTP_PASS || null,
          from: env.SMTP_FROM || null,
        }
      : null,
  },
};

export function assertRuntimeConfig() {
  const problems = [];
  if (!config.masterKey) problems.push('MASTER_KEY no está configurada');
  if (config.isProd && !config.appUrl.startsWith('https://')) problems.push('APP_URL debe usar https:// en producción');
  if (config.isProd && !config.databaseUrl) problems.push('DATABASE_URL debe apuntar a Supabase Postgres en producción');
  if (config.isVercel && (!config.supabaseUrl || !config.supabaseServiceRoleKey)) problems.push('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias para el almacenamiento de documentos');
  if (config.isVercel && !config.cronSecret) problems.push('CRON_SECRET es obligatoria para las tareas programadas de Vercel');
  if (problems.length && config.isProd) throw new Error(`Configuración inválida: ${problems.join('; ')}`);
  return problems;
}
