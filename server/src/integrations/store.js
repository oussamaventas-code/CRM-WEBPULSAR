import { config } from '../config.js';
import { db, nowIso } from '../db/index.js';
import { decryptSecret, encryptSecret, secretHint } from '../lib/crypto.js';
import { parseJson } from '../lib/query.js';

// Acceso a credenciales de integraciones. Las variables de entorno tienen prioridad sobre la base de datos.

export async function getIntegration(key) {
  const row = await (db.get('SELECT * FROM integrations WHERE provider_key = ?', [key]));
  if (!row) return null;
  return { ...row, config: parseJson(row.config, {}), capabilities: parseJson(row.capabilities, {}), last_sync_report: parseJson(row.last_sync_report, null) };
}

export function envCredential(key) {
  if (key === 'hostinger') return config.envSecrets.hostinger;
  if (key === 'cloudflare') return config.envSecrets.cloudflare;
  if (key === 'smtp') return config.envSecrets.smtp?.pass ?? null;
  return null;
}

export async function getCredential(key) {
  const env = envCredential(key);
  if (env) return env;
  const row = await (db.get('SELECT secret_enc FROM integrations WHERE provider_key = ?', [key]));
  return row?.secret_enc ? decryptSecret(row.secret_enc) : null;
}

export async function hasCredential(key) {
  if (envCredential(key)) return true;
  return !!await (db.value('SELECT secret_enc IS NOT NULL FROM integrations WHERE provider_key = ?', [key]));
}

export async function saveCredential(key, secret, cfg, userId) {
  const sets = ['config = ?', 'updated_at = ?', "status = 'pending'", 'last_error = NULL'];
  const values = [JSON.stringify(cfg ?? {}), nowIso()];
  if (secret) {
    sets.push('secret_enc = ?', 'secret_hint = ?', 'created_by = COALESCE(created_by, ?)');
    values.push(encryptSecret(secret), secretHint(secret), userId);
  }
  await (db.run(`UPDATE integrations SET ${sets.join(', ')} WHERE provider_key = ?`, [...values, key]));
}

export async function clearCredential(key) {
  await (db.run(
    "UPDATE integrations SET secret_enc = NULL, secret_hint = NULL, status = 'not_configured', capabilities = '{}', last_error = NULL, updated_at = ? WHERE provider_key = ?",
    [nowIso(), key],
  ));
}

export async function setIntegrationState(key, { status, capabilities, error, verified, synced, report }) {
  const changes = { updated_at: nowIso() };
  if (status) changes.status = status;
  if (capabilities) changes.capabilities = JSON.stringify(capabilities);
  if (error !== undefined) changes.last_error = error;
  if (verified) changes.last_verified_at = nowIso();
  if (synced) changes.last_sync_at = nowIso();
  if (report) changes.last_sync_report = JSON.stringify(report);
  const keys = Object.keys(changes);
  await (db.run(`UPDATE integrations SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE provider_key = ?`, [...keys.map((k) => changes[k]), key]));
}

export class ProviderError extends Error {
  constructor(provider, status, message) {
    super(message);
    this.provider = provider;
    this.status = status;
    this.unauthorized = status === 401 || status === 403;
  }
}

/** Petición JSON a una API de proveedor con timeout. Nunca registra el token. */
export async function providerFetch(provider, url, { token, method = 'GET', body, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? parseJson(text, { raw: text.slice(0, 300) }) : null;
    if (!res.ok) {
      const detail = data?.errors?.[0]?.message || data?.message || data?.error || res.statusText;
      throw new ProviderError(provider, res.status, `${provider} respondió ${res.status}: ${detail}`);
    }
    return data;
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(provider, 0, err.name === 'AbortError' ? `${provider}: tiempo de espera agotado` : `${provider}: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}
