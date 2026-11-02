import { config } from '../config.js';

let bucketReady;

function storageUrl(path = '') {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) throw new Error('Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para usar el almacenamiento de documentos.');
  return `${config.supabaseUrl.replace(/\/$/, '')}/storage/v1${path}`;
}

function absoluteStorageUrl(relative) {
  return `${storageUrl('')}/${String(relative).replace(/^\/+/, '')}`;
}

function headers(extra = {}) {
  return {
    apikey: config.supabaseServiceRoleKey,
    Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
    ...extra,
  };
}

async function parseResponse(response) {
  if (response.ok) return response.status === 204 ? null : response.json();
  const body = await response.text();
  throw new Error(`Supabase Storage (${response.status}): ${body.slice(0, 500)}`);
}

function objectPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function ensureStorageBucket() {
  if (!bucketReady) {
    bucketReady = fetch(storageUrl('/bucket'), {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: config.supabaseStorageBucket, name: config.supabaseStorageBucket, public: false, file_size_limit: 25_000_000 }),
    }).then(async (response) => {
      if (response.status !== 409) {
        await parseResponse(response);
        return;
      }

      // El bucket puede existir si se preparó desde el panel. Aseguramos que
      // siga privado aunque se hubiera creado accidentalmente como público.
      const bucketResponse = await fetch(storageUrl(`/bucket/${encodeURIComponent(config.supabaseStorageBucket)}`), { headers: headers() });
      const bucket = await parseResponse(bucketResponse);
      if (bucket.public) {
        const updateResponse = await fetch(storageUrl(`/bucket/${encodeURIComponent(config.supabaseStorageBucket)}`), {
          method: 'PUT',
          headers: headers({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ public: false, file_size_limit: 25_000_000 }),
        });
        await parseResponse(updateResponse);
      }
    }).catch((error) => {
      bucketReady = null;
      throw error;
    });
  }
  return bucketReady;
}

export async function uploadObject(key, data, contentType = 'application/octet-stream', { upsert = false } = {}) {
  await ensureStorageBucket();
  const response = await fetch(storageUrl(`/object/${encodeURIComponent(config.supabaseStorageBucket)}/${objectPath(key)}`), {
    method: 'POST',
    headers: headers({ 'Content-Type': contentType, 'x-upsert': String(upsert) }),
    body: data,
  });
  return parseResponse(response);
}

export async function createUploadUrl(key) {
  await ensureStorageBucket();
  const response = await fetch(storageUrl(`/object/upload/sign/${encodeURIComponent(config.supabaseStorageBucket)}/${objectPath(key)}`), {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({}),
  });
  const result = await parseResponse(response);
  return absoluteStorageUrl(result.url);
}

export async function inspectObject(key) {
  const response = await fetch(storageUrl(`/object/${encodeURIComponent(config.supabaseStorageBucket)}/${objectPath(key)}`), {
    method: 'HEAD',
    headers: headers(),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`No se pudo verificar el archivo en Supabase Storage (${response.status}): ${body.slice(0, 300)}`);
  }
  return {
    size: Number(response.headers.get('content-length')),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
  };
}

export async function removeObject(key) {
  const response = await fetch(storageUrl(`/object/${encodeURIComponent(config.supabaseStorageBucket)}`), {
    method: 'DELETE',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: [key] }),
  });
  return parseResponse(response);
}

export async function createDownloadUrl(key, fileName, expiresIn = 60) {
  const response = await fetch(storageUrl(`/object/sign/${encodeURIComponent(config.supabaseStorageBucket)}/${objectPath(key)}`), {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn, download: fileName }),
  });
  const result = await parseResponse(response);
  return absoluteStorageUrl(result.signedURL);
}
