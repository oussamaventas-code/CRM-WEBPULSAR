import { db, nowIso, tx } from '../db/index.js';
import { ProviderError, getCredential, getIntegration, providerFetch } from './store.js';

// Conector de la API oficial de Cloudflare v4 (https://developers.cloudflare.com/api/).
// Permisos recomendados para el token (mínimo privilegio, solo lectura salvo DNS):
//   Zone:Read, DNS:Edit (o DNS:Read), Zone Settings:Read, Account Settings:Read,
//   Workers Scripts:Read, D1:Read, Workers R2 Storage:Read.

const BASE = 'https://api.cloudflare.com/client/v4';
const P = 'Cloudflare';

async function cf(path, token, opts) {
  const res = await providerFetch(P, `${BASE}${path}`, { token, ...opts });
  if (res && res.success === false) throw new ProviderError(P, 400, res.errors?.[0]?.message ?? 'Error de Cloudflare');
  return res;
}

async function cfAll(path, token, perPage = 50) {
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await cf(`${path}${sep}page=${page}&per_page=${perPage}`, token);
    out.push(...(res.result ?? []));
    const info = res.result_info;
    if (!info || !info.total_pages || page >= info.total_pages) break;
  }
  return out;
}

const providerId = async () => await (db.value("SELECT id FROM providers WHERE key = 'cloudflare'"));

async function verifyToken(token, accountHint) {
  try {
    const res = await cf('/user/tokens/verify', token);
    return res.result?.status;
  } catch (err) {
    if (!accountHint) throw err;
    const res = await cf(`/accounts/${encodeURIComponent(accountHint)}/tokens/verify`, token);
    return res.result?.status;
  }
}

/** Verifica el token y comprueba a qué recursos tiene acceso. */
export async function verifyCloudflare(token, accountHint) {
  const status = await verifyToken(token, accountHint);
  if (status && status !== 'active') throw new ProviderError(P, 403, `El token no está activo (estado: ${status})`);
  const capabilities = {};
  const probe = async (cap, fn) => {
    try {
      await fn();
      capabilities[cap] = { ok: true };
    } catch (err) {
      capabilities[cap] = { ok: false, status: err.status, error: err.message };
    }
  };
  let accounts = [];
  await probe('accounts', async () => {
    accounts = (await cf('/accounts?per_page=50', token)).result ?? [];
  });
  if (!accounts.length && accountHint) accounts = [{ id: accountHint, name: accountHint }];
  let firstZone = null;
  await probe('zones', async () => {
    firstZone = (await cf('/zones?per_page=1', token)).result?.[0] ?? null;
  });
  if (firstZone) await probe('dns', () => cf(`/zones/${firstZone.id}/dns_records?per_page=1`, token));
  const acc = accounts[0]?.id;
  if (acc) {
    await probe('workers', () => cf(`/accounts/${acc}/workers/scripts`, token));
    await probe('d1', () => cf(`/accounts/${acc}/d1/database?per_page=1`, token));
    await probe('r2', () => cf(`/accounts/${acc}/r2/buckets?per_page=1`, token));
  }
  return { capabilities, accounts: accounts.map((a) => ({ id: a.id, name: a.name })) };
}

async function upsertByExternal(table, pid, externalId, fields) {
  const existing = await (db.get(`SELECT id FROM ${table} WHERE provider_id = ? AND external_id = ?`, [pid, externalId]));
  const keys = Object.keys(fields);
  if (existing) {
    await (db.run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...keys.map((k) => fields[k]), nowIso(), existing.id]));
    return { id: existing.id, created: false };
  }
  const res = await (db.run(`INSERT INTO ${table} (provider_id, external_id, ${keys.join(', ')}) VALUES (?, ?, ${keys.map(() => '?').join(', ')})`, [pid, externalId, ...keys.map((k) => fields[k])]));
  return { id: Number(res.lastInsertRowid), created: true };
}

export async function replaceDnsRecords(domainId, records) {
  const now = nowIso();
  await (tx(async () => {
    const keep = new Set();
    for (const r of records) {
      keep.add(r.id);
      await (db.run(
        `INSERT INTO dns_records (domain_id, source, external_id, type, name, content, ttl, proxied, priority, comment, synced_at)
         VALUES (?, 'cloudflare', ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(domain_id, source, external_id) DO UPDATE SET type = excluded.type, name = excluded.name, content = excluded.content,
           ttl = excluded.ttl, proxied = excluded.proxied, priority = excluded.priority, comment = excluded.comment, synced_at = excluded.synced_at`,
        [domainId, r.id, r.type, r.name, r.content, r.ttl ?? null, r.proxiable === false ? null : r.proxied ? 1 : 0, r.priority ?? null, r.comment ?? null, now],
      ));
    }
    for (const row of await (db.all("SELECT id, external_id FROM dns_records WHERE domain_id = ? AND source = 'cloudflare'", [domainId]))) {
      if (!keep.has(row.external_id)) await (db.run('DELETE FROM dns_records WHERE id = ?', [row.id]));
    }
  }));
}

async function syncZone(token, zone, report) {
  const existing = await (db.get('SELECT id FROM domains WHERE name = ?', [zone.name]));
  const fields = {
    dns_provider: 'cloudflare',
    cloudflare_zone_id: zone.id,
    cloudflare_account_id: zone.account?.id ?? null,
    zone_status: zone.status,
    nameservers: JSON.stringify(zone.name_servers ?? []),
    last_synced_at: nowIso(),
  };
  let domainId;
  if (existing) {
    const keys = Object.keys(fields);
    await (db.run(`UPDATE domains SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...keys.map((k) => fields[k]), nowIso(), existing.id]));
    domainId = existing.id;
    report.zones.updated += 1;
  } else {
    const keys = Object.keys(fields);
    domainId = Number(await (await (db.run(`INSERT INTO domains (name, ${keys.join(', ')}) VALUES (?, ${keys.map(() => '?').join(', ')})`, [zone.name, ...keys.map((k) => fields[k])]))).lastInsertRowid);
    report.zones.created += 1;
  }
  try {
    const ssl = await cf(`/zones/${zone.id}/settings/ssl`, token);
    await (db.run('UPDATE domains SET ssl_mode = ? WHERE id = ?', [ssl.result?.value ?? null, domainId]));
  } catch (err) {
    report.warnings.add(`Modo SSL no disponible (permiso Zone Settings:Read): ${err.message}`);
  }
  try {
    const records = await cfAll(`/zones/${zone.id}/dns_records`, token, 100);
    await (replaceDnsRecords(domainId, records));
    report.dns_records += records.length;
  } catch (err) {
    report.warnings.add(`Registros DNS no disponibles (permiso DNS:Read): ${err.message}`);
  }
}

/** Sincroniza cuentas, zonas, DNS, SSL, Workers, D1 y R2. */
export async function syncCloudflare() {
  const token = await (getCredential('cloudflare'));
  if (!token) throw new ProviderError(P, 0, 'Cloudflare no está configurado');
  const integration = await (getIntegration('cloudflare'));
  const pid = await (providerId());
  const report = { accounts: 0, zones: { created: 0, updated: 0 }, dns_records: 0, workers: 0, d1: 0, r2: 0, warnings: new Set() };

  let accounts = [];
  try {
    accounts = await cfAll('/accounts', token);
  } catch (err) {
    if (err.status === 401) throw err;
    report.warnings.add(`Cuentas no disponibles (permiso Account Settings:Read): ${err.message}`);
  }
  const hint = integration?.config?.account_id || null;
  if (!accounts.length && hint) accounts = [{ id: hint, name: hint }];
  for (const a of accounts) {
    await (upsertByExternal('infrastructure_accounts', pid, a.id, { name: a.name, integration_id: integration?.id ?? null }));
  }
  report.accounts = accounts.length;

  let zones = [];
  try {
    zones = await cfAll('/zones', token);
  } catch (err) {
    if (err.status === 401) throw err;
    report.warnings.add(`Zonas no disponibles (permiso Zone:Read): ${err.message}`);
  }
  for (const zone of zones) await syncZone(token, zone, report);

  for (const a of accounts) {
    try {
      const scripts = (await cf(`/accounts/${a.id}/workers/scripts`, token)).result ?? [];
      for (const s of scripts) {
        await (upsertByExternal('applications', pid, `worker:${a.id}:${s.id}`, { name: s.id, kind: 'worker', source: 'cloudflare', runtime: 'Cloudflare Workers' }));
      }
      report.workers += scripts.length;
    } catch (err) {
      report.warnings.add(`Workers no disponibles (permiso Workers Scripts:Read): ${err.message}`);
    }
    try {
      const dbs = await cfAll(`/accounts/${a.id}/d1/database`, token);
      for (const d of dbs) {
        await (upsertByExternal('databases', pid, d.uuid, {
          name: d.name,
          engine: 'd1',
          source: 'cloudflare',
          provider_created_at: d.created_at ?? null,
          size_bytes: d.file_size ?? null,
          region: d.running_in_region ?? null,
        }));
      }
      report.d1 += dbs.length;
    } catch (err) {
      report.warnings.add(`D1 no disponible (permiso D1:Read): ${err.message}`);
    }
    try {
      const buckets = (await cf(`/accounts/${a.id}/r2/buckets?per_page=100`, token)).result?.buckets ?? [];
      for (const b of buckets) {
        await (upsertByExternal('storage_buckets', pid, `${a.id}:${b.name}`, { name: b.name, location: b.location ?? null, provider_created_at: b.creation_date ?? null }));
      }
      report.r2 += buckets.length;
    } catch (err) {
      report.warnings.add(`R2 no disponible o no activado (permiso Workers R2 Storage:Read): ${err.message}`);
    }
  }

  return { report: { ...report, warnings: [...report.warnings] } };
}

async function zoneOf(domain) {
  if (!domain.cloudflare_zone_id) throw new ProviderError(P, 400, 'Este dominio no está vinculado a una zona de Cloudflare. Sincroniza Cloudflare primero.');
  const token = await (getCredential('cloudflare'));
  if (!token) throw new ProviderError(P, 0, 'Cloudflare no está configurado');
  return { zone: domain.cloudflare_zone_id, token };
}

export async function createDnsRecord(domain, record) {
  const { zone, token } = await (zoneOf(domain));
  const res = await cf(`/zones/${zone}/dns_records`, token, { method: 'POST', body: record });
  return res.result;
}

export async function updateDnsRecord(domain, externalId, changes) {
  const { zone, token } = await (zoneOf(domain));
  const res = await cf(`/zones/${zone}/dns_records/${encodeURIComponent(externalId)}`, token, { method: 'PATCH', body: changes });
  return res.result;
}

export async function deleteDnsRecord(domain, externalId) {
  const { zone, token } = await (zoneOf(domain));
  await cf(`/zones/${zone}/dns_records/${encodeURIComponent(externalId)}`, token, { method: 'DELETE' });
}

export async function refreshZoneRecords(domain) {
  const { zone, token } = await (zoneOf(domain));
  const records = await cfAll(`/zones/${zone}/dns_records`, token, 100);
  await (replaceDnsRecords(domain.id, records));
  return records.length;
}

/** Ejecuta SELECT 1 en una base de datos D1: verifica disponibilidad real de consultas. */
export async function d1Ping(database) {
  const token = await (getCredential('cloudflare'));
  if (!token) throw new ProviderError(P, 0, 'Cloudflare no está configurado');
  const accounts = await (await (db.all('SELECT external_id FROM infrastructure_accounts WHERE provider_id = ? ORDER BY id', [await (providerId())]))).map((a) => a.external_id);
  const hint = await (await (getIntegration('cloudflare')))?.config?.account_id;
  if (hint && !accounts.includes(hint)) accounts.unshift(hint);
  if (!accounts.length) throw new ProviderError(P, 400, 'No se conoce la cuenta de Cloudflare de esta base de datos');
  let lastError;
  for (const account of accounts) {
    try {
      const res = await cf(`/accounts/${account}/d1/database/${encodeURIComponent(database.external_id)}/query`, token, { method: 'POST', body: { sql: 'SELECT 1 AS ok' } });
      return res.result?.[0]?.success !== false;
    } catch (err) {
      if (err.status !== 404) throw err;
      lastError = err;
    }
  }
  throw lastError;
}
