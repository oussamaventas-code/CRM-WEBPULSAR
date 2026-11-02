export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const badRequest = (message, fields) => new HttpError(400, message, fields ? { fields } : {});
export const unauthorized = (message = 'Sesión no válida o caducada') => new HttpError(401, message);
export const forbidden = (message = 'No tienes permiso para realizar esta acción') => new HttpError(403, message);
export const notFound = (message = 'Recurso no encontrado') => new HttpError(404, message);
export const conflict = (message, extra) => new HttpError(409, message, extra);

/** Traduce errores de restricciones SQLite y PostgreSQL a mensajes comprensibles. */
export function fromSqliteError(err) {
  const msg = String(err?.message || '');
  if (err?.code === '23505') return conflict('Ya existe un registro con ese valor');
  if (err?.code === '23503') return conflict('El registro está relacionado con otros datos o hace referencia a uno inexistente');
  if (err?.code === '23514' || err?.code === '22P02') return badRequest('Algún valor no es válido para este campo');
  if (err?.code === 'P0001' && /inmutable|no puede/.test(msg)) return conflict(msg);
  if (/UNIQUE constraint failed: (\w+)\.(\w+)/.test(msg)) {
    const [, , column] = msg.match(/UNIQUE constraint failed: (\w+)\.(\w+)/);
    return conflict('Ya existe un registro con ese valor', { fields: { [column]: 'Ya existe un registro con este valor' } });
  }
  if (msg.includes('FOREIGN KEY constraint failed')) return conflict('El registro está relacionado con otros datos o hace referencia a uno inexistente');
  if (msg.includes('CHECK constraint failed')) return badRequest('Algún valor no es válido para este campo');
  const raised = msg.match(/^(?:Error: )?(.+)$/);
  if (err?.code === 'ERR_SQLITE_ERROR' && raised && /inmutable|no puede/.test(msg)) return conflict(raised[1]);
  return null;
}
