import { Router } from 'express';
import { can } from '../middleware/auth.js';
import { clearCredential, envCredential, getIntegration, saveCredential } from '../integrations/store.js';
import { syncIntegration, verifyIntegration } from '../services/integrations.js';
import { mailerStatus } from '../services/mailer.js';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { f, parse, z } from '../lib/validate.js';
import { badRequest } from '../lib/errors.js';
import { record } from '../lib/audit.js';

const router = Router();
const KEYS = ['hostinger', 'cloudflare', 'smtp'];

const DOCS = {
  hostinger: {
    docs: 'https://developers.hostinger.com',
    how: 'hPanel → Perfil → API → Crear token. El token hereda los permisos de tu usuario; usa una cuenta con el acceso mínimo necesario y fecha de caducidad.',
    limits: [
      'La API ofrece estado, recursos y métricas de VPS (CPU, RAM, disco, tráfico y uptime) con la granularidad que proporciona Hostinger.',
      'Para métricas en tiempo real y heartbeat propio instala el agente de Web Pulsar en el VPS.',
      'El hosting compartido no expone métricas de servidor equivalentes a un VPS.',
    ],
  },
  cloudflare: {
    docs: 'https://developers.cloudflare.com/fundamentals/api/get-started/create-token/',
    how: 'Cloudflare → My Profile → API Tokens → Create Token (personalizado). Permisos: Zone:Read, DNS:Edit, Zone Settings:Read, Account Settings:Read, Workers Scripts:Read, D1:Read y Workers R2 Storage:Read.',
    limits: [
      'Los certificados de borde se reflejan mediante el modo SSL de la zona y la comprobación TLS propia.',
      'El contenido de D1 y R2 no se lee: solo inventario y disponibilidad (consulta SELECT 1 en D1).',
    ],
  },
  smtp: {
    docs: null,
    how: 'Datos del servidor de correo saliente de tu proveedor (por ejemplo, el correo de Hostinger: smtp.hostinger.com, puerto 465 con SSL).',
    limits: ['Se usa para enviar facturas y enlaces de recuperación de contraseña.'],
  },
};

async function present(key) {
  const i = await (getIntegration(key));
  const env = !!envCredential(key) || (key === 'smtp' && !!config.envSecrets.smtp);
  const { _accounts: accounts, ...capabilities } = i.capabilities ?? {};
  return {
    key,
    name: i.name,
    status: env && i.status === 'not_configured' ? 'pending' : i.status,
    configured: env || !!i.secret_hint || (key === 'smtp' && !!i.config?.host),
    source: env ? 'env' : i.secret_hint || i.config?.host ? 'database' : null,
    secret_hint: env ? 'variable de entorno' : i.secret_hint,
    config: key === 'smtp' ? { host: i.config.host, port: i.config.port, secure: i.config.secure, user: i.config.user, from: i.config.from } : { account_id: i.config.account_id ?? null },
    capabilities,
    accounts: accounts ?? [],
    last_verified_at: i.last_verified_at,
    last_sync_at: i.last_sync_at,
    last_sync_report: i.last_sync_report,
    last_error: i.last_error,
    mailer_ready: key === 'smtp' ? await (mailerStatus()).ready : undefined,
    ...DOCS[key],
  };
}

router.get('/', can('infrastructure.read'), (_req, res) => {
  res.json(KEYS.map(present));
});

/** Resumen para el indicador de la barra superior (cualquier usuario autenticado). */
router.get('/status', (_req, res) => {
  const list = KEYS.map(present);
  res.json({
    connected: list.filter((i) => i.status === 'connected').length,
    pending: list.filter((i) => i.status === 'pending' || i.status === 'not_configured').length,
    failing: list.filter((i) => i.status === 'error' || i.status === 'unauthorized').length,
    items: list.map((i) => ({ key: i.key, name: i.name, status: i.status })),
  });
});

const schemas = {
  hostinger: z.object({ token: z.string().trim().min(20, 'Token no válido').max(500).optional() }),
  cloudflare: z.object({ token: z.string().trim().min(20, 'Token no válido').max(500).optional(), account_id: z.preprocess((v) => v || undefined, z.string().trim().regex(/^[a-f0-9]{32}$/, 'ID de cuenta no válido').optional()) }),
  smtp: z.object({
    host: z.string().trim().min(3, 'Obligatorio').max(200),
    port: z.coerce.number().int().min(1).max(65535).default(587),
    secure: f.bool().default(false),
    user: f.optText(200),
    from: z.string().trim().min(3, 'Obligatorio').max(200),
    password: z.string().max(500).optional(),
  }),
};

router.put('/:key', can('integrations.manage'), async (req, res) => {
  const key = req.params.key;
  if (!KEYS.includes(key)) throw badRequest('Integración desconocida');
  const data = parse(schemas[key], req.body);
  const current = await (getIntegration(key));
  if (key === 'smtp') {
    const { password, ...cfg } = data;
    await (saveCredential('smtp', password || null, cfg, req.user.id));
  } else {
    if (!data.token && !current.secret_hint && !envCredential(key)) throw badRequest('Introduce el token', { token: 'Obligatorio' });
    await (saveCredential(key, data.token || null, { ...current.config, account_id: data.account_id ?? current.config.account_id ?? null }, req.user.id));
  }
  await (record(req, { action: 'integration.configured', entityType: 'integration', entityId: current.id, label: current.name, summary: `Credenciales de ${current.name} actualizadas` }));
  try {
    await verifyIntegration(req, key);
  } catch (err) {
    return res.status(200).json({ ...await (present(key)), verify_error: err.message });
  }
  res.json(await (present(key)));
});

router.post('/:key/verify', can('integrations.manage'), async (req, res) => {
  if (!KEYS.includes(req.params.key)) throw badRequest('Integración desconocida');
  await verifyIntegration(req, req.params.key);
  res.json(await (present(req.params.key)));
});

router.post('/:key/sync', can('infrastructure.write'), async (req, res) => {
  const report = await syncIntegration(req, req.params.key);
  res.json({ report, integration: await (present(req.params.key)) });
});

router.delete('/:key', can('integrations.manage'), async (req, res) => {
  const key = req.params.key;
  if (!KEYS.includes(key)) throw badRequest('Integración desconocida');
  await (clearCredential(key));
  if (key === 'smtp') await (db.run("UPDATE integrations SET config = '{}' WHERE provider_key = 'smtp'"));
  await (record(req, { action: 'integration.disconnected', entityType: 'integration', label: key, summary: `Integración desconectada: ${await (await (getIntegration(key))).name}` }));
  res.json(await (present(key)));
});

export default router;
