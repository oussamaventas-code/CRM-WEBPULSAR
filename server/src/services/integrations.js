import { getCredential, getIntegration, setIntegrationState } from '../integrations/store.js';
import { syncHostinger, verifyHostinger } from '../integrations/hostinger.js';
import { syncCloudflare, verifyCloudflare } from '../integrations/cloudflare.js';
import { verifyMailer } from './mailer.js';
import { openAlert, resolveAlert, evaluateServer } from './monitoring.js';
import { record } from '../lib/audit.js';
import { HttpError } from '../lib/errors.js';

const NAMES = { hostinger: 'Hostinger', cloudflare: 'Cloudflare', smtp: 'Correo SMTP' };

async function authLost(ctx, key, err) {
  await (setIntegrationState(key, { status: 'unauthorized', error: err.message }));
  await (openAlert(ctx, {
    type: 'integration_auth',
    severity: 'critical',
    entityType: 'integration',
    entityId: await (getIntegration(key))?.id ?? null,
    title: `${NAMES[key]}: la integración ha perdido la autorización`,
    message: `${err.message}. Revisa o renueva el token en Configuración → Integraciones.`,
    dedupeKey: `integration-auth:${key}`,
    link: '/configuracion?tab=integraciones',
  }));
}

/** Verifica credenciales y capacidades. Actualiza el estado de la integración. */
export async function verifyIntegration(ctx, key) {
  if (key === 'smtp') {
    try {
      await verifyMailer();
      await (setIntegrationState('smtp', { status: 'connected', error: null, verified: true }));
    } catch (err) {
      await (setIntegrationState('smtp', { status: 'error', error: err.message }));
      throw new HttpError(502, `No se pudo conectar con el servidor SMTP: ${err.message}`);
    }
    return await (getIntegration('smtp'));
  }
  const token = await (getCredential(key));
  if (!token) throw new HttpError(409, `${NAMES[key]} no tiene credenciales configuradas`);
  try {
    const integration = await (getIntegration(key));
    const result = key === 'hostinger' ? { capabilities: await verifyHostinger(token) } : await verifyCloudflare(token, integration.config.account_id);
    await (setIntegrationState(key, {
      status: 'connected',
      error: null,
      verified: true,
      capabilities: { ...result.capabilities, ...(result.accounts ? { _accounts: result.accounts } : {}) },
    }));
    await (resolveAlert(ctx, `integration-auth:${key}`, `${NAMES[key]}: autorización restablecida`));
  } catch (err) {
    if (err.unauthorized) await (authLost(ctx, key, err));
    else await (setIntegrationState(key, { status: 'error', error: err.message }));
    throw new HttpError(502, err.message);
  }
  return await (getIntegration(key));
}

export async function syncIntegration(ctx, key) {
  if (!['hostinger', 'cloudflare'].includes(key)) throw new HttpError(400, 'Esta integración no se sincroniza');
  try {
    const { report, serverIds = [] } = key === 'hostinger' ? await syncHostinger() : await syncCloudflare();
    await (setIntegrationState(key, { status: 'connected', error: report.warnings.length ? report.warnings.join(' · ').slice(0, 1000) : null, synced: true, report }));
    for (const id of serverIds) await (evaluateServer(id));
    await (resolveAlert(ctx, `integration-auth:${key}`, `${NAMES[key]}: autorización restablecida`));
    await (record(ctx, { action: 'integration.synced', entityType: 'integration', label: NAMES[key], summary: `Sincronización con ${NAMES[key]} completada`, data: report }));
    return report;
  } catch (err) {
    if (err.unauthorized) await (authLost(ctx, key, err));
    else await (setIntegrationState(key, { status: 'error', error: err.message }));
    await (record(ctx, { action: 'integration.sync_failed', entityType: 'integration', label: NAMES[key], summary: `Error al sincronizar ${NAMES[key]}: ${err.message}` }));
    throw new HttpError(502, err.message);
  }
}
