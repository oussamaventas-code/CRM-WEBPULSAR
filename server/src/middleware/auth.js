import { config } from '../config.js';
import { loadSession } from '../auth/session.js';
import { safeEqual } from '../lib/crypto.js';
import { verifyPassword } from '../lib/password.js';
import { db } from '../db/index.js';
import { HttpError, forbidden, unauthorized } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function authenticate(req, _res, next) {
  const loaded = await (loadSession(req.cookies?.[config.session.cookieName]));
  if (loaded) {
    req.session = loaded.session;
    req.user = loaded.user;
    req.perms = loaded.permissions;
  } else {
    req.perms = new Set();
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

/** Exige uno o varios permisos (todos). Se aplica siempre en el servidor. */
export const can = (...perms) => (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (!perms.every((p) => req.perms.has(p))) return next(forbidden());
  next();
};

export const hasPerm = (req, perm) => req.perms?.has(perm) ?? false;

/** Doble protección CSRF: cabecera con token de sesión + Origin coincidente. */
export function csrfProtect(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== config.appUrl && !(config.isProd ? false : /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) {
    return next(new HttpError(403, 'Origen de la petición no permitido'));
  }
  if (!req.session) return next();
  if (!safeEqual(req.get('x-csrf-token'), req.session.csrf_token)) return next(new HttpError(403, 'Token CSRF no válido. Recarga la página.'));
  next();
}

/** Re-autenticación para operaciones sensibles (eliminar, revelar credenciales…). */
export async function confirmPassword(req, password) {
  if (!password) throw new HttpError(400, 'Confirma la operación con tu contraseña', { fields: { password: 'Obligatorio' } });
  const hash = await (db.value('SELECT password_hash FROM users WHERE id = ?', [req.user.id]));
  if (!(await verifyPassword(password, hash))) throw new HttpError(403, 'Contraseña incorrecta', { fields: { password: 'Contraseña incorrecta' } });
}
