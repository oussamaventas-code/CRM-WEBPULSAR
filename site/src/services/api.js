import { config } from '../config.js';

/** Error de API con el código HTTP y, si el CRM los envía, los errores por campo. */
export class ApiError extends Error {
  constructor(message, { status = 0, fields = null, kind = 'http' } = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.kind = kind; // 'http' | 'network' | 'timeout' | 'unavailable'
  }
}

const NETWORK_MESSAGE = 'No hemos podido conectar con nuestro servidor. Revisa tu conexión e inténtalo de nuevo.';

/**
 * Única puerta de salida hacia el CRM. Gestiona timeouts, errores de red y respuestas no JSON.
 * Un 401/404/405/501 en /api/public se trata como "funcionalidad todavía no disponible en el CRM".
 */
export async function request(path, { method = 'GET', body, timeout = 12000, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeout);
  signal?.addEventListener('abort', () => controller.abort(signal.reason), { once: true });

  let res;
  try {
    res = await fetch(`${config.crmApiUrl}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      credentials: 'omit',
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    const timedOut = controller.signal.reason?.name === 'TimeoutError';
    throw new ApiError(timedOut ? 'El servidor está tardando demasiado en responder. Inténtalo de nuevo en unos segundos.' : NETWORK_MESSAGE, {
      kind: timedOut ? 'timeout' : 'network',
    });
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => null);
  if (res.ok) return data ?? {};
  if ([401, 404, 405, 501].includes(res.status)) {
    throw new ApiError('Esta funcionalidad todavía no está disponible.', { status: res.status, kind: 'unavailable' });
  }
  throw new ApiError(data?.error || 'Ha ocurrido un error inesperado. Inténtalo de nuevo.', { status: res.status, fields: data?.fields ?? null });
}
