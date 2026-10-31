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
  host: env.HOST || '127.0.0.1',
  port: Number(env.API_PORT || 4000),
  appUrl: (env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  trustProxy: env.TRUST_PROXY === '1' ? 1 : false,
  databasePath: env.DATABASE_PATH === ':memory:' ? ':memory:' : fromRoot(env.DATABASE_PATH || 'data/webpulsar.db'),
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
  schedulerEnabled: env.SCHEDULER_ENABLED !== '0',
  backups: { keep: Number(env.BACKUP_KEEP || 14), hour: Number(env.BACKUP_HOUR || 3) },
  githubToken: env.GITHUB_TOKEN || null,
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
  if (problems.length && config.isProd) throw new Error(`Configuración inválida: ${problems.join('; ')}`);
  return problems;
}
