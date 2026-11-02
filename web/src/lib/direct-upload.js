import { api } from './api.js';

/** Uploads the binary directly to the private Supabase bucket to avoid Vercel's request-body limit. */
export async function uploadFileDirect(file) {
  let ticket;
  try {
    ticket = await api.post('/documents/upload-url', {
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
    });
  } catch (error) {
    if (error.status === 501) return null;
    throw error;
  }
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseKey) {
    await cancelDirectUpload(ticket.storage_key);
    throw new Error('Falta VITE_SUPABASE_ANON_KEY en la configuración de Vercel del CRM.');
  }

  try {
    const response = await fetch(ticket.signed_url, {
      method: 'PUT',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'false',
      },
      body: file,
      credentials: 'omit',
    });
    if (!response.ok) {
      const details = (await response.text()).slice(0, 300);
      throw new Error(details || `No se pudo subir el archivo (${response.status})`);
    }
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return {
      storage_key: ticket.storage_key,
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      sha256,
    };
  } catch (error) {
    await cancelDirectUpload(ticket.storage_key);
    throw error;
  }
}

export async function cancelDirectUpload(storageKey) {
  if (!storageKey) return;
  await api.post('/documents/upload-cancel', { storage_key: storageKey }).catch(() => {});
}
