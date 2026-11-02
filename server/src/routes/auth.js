import { Router } from 'express';
import { config } from '../config.js';
import { db, nowIso, tx } from '../db/index.js';
import { cookieOptions, createSession, destroySession, destroyUserSessions } from '../auth/session.js';
import { permissionsForRole } from '../auth/rbac.js';
import { requireAuth } from '../middleware/auth.js';
import { loginLimiter, sensitiveLimiter } from '../middleware/security.js';
import { dummyHash, hashPassword, passwordProblem, verifyPassword } from '../lib/password.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { HttpError, badRequest } from '../lib/errors.js';
import { f, parse, z } from '../lib/validate.js';
import { logAccess, record } from '../lib/audit.js';
import { mailerStatus, sendMail } from '../services/mailer.js';

const router = Router();
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role ?? u.role_key,
  role_name: u.role_name,
  is_owner: !!u.is_owner,
});

function sessionPayload(user, permissions, csrfToken, expiresAt) {
  return { user: publicUser(user), permissions: [...permissions].sort(), csrfToken, expiresAt };
}

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parse(z.object({ email: f.email(), password: z.string().min(1, 'Obligatorio').max(200) }), req.body);
  const user = await (db.get('SELECT u.*, r.key AS role_key, r.name AS role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ?', [email]));

  if (user?.locked_until && user.locked_until > nowIso()) {
    await (logAccess(req, { userId: user.id, email, event: 'login_blocked' }));
    throw new HttpError(423, `Cuenta bloqueada temporalmente por intentos fallidos. Inténtalo en ${LOCK_MINUTES} minutos.`);
  }

  const valid = user ? await verifyPassword(password, user.password_hash) : (await verifyPassword(password, await dummyHash()), false);
  if (!valid || user.status !== 'active') {
    if (user && user.status === 'active') {
      const attempts = user.failed_attempts + 1;
      const lock = attempts >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
      await (db.run('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?', [lock ? 0 : attempts, lock, user.id]));
      if (lock) await (logAccess(req, { userId: user.id, email, event: 'account_locked' }));
    }
    await (logAccess(req, { userId: user?.id ?? null, email, event: 'login_failed' }));
    throw new HttpError(401, 'Email o contraseña incorrectos');
  }

  await (db.run('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?', [nowIso(), user.id]));
  const { token, csrf, expiresAt } = await (createSession(user, req));
  await (logAccess(req, { userId: user.id, email, event: 'login_success' }));
  res.cookie(config.session.cookieName, token, cookieOptions(expiresAt));
  res.json(sessionPayload(user, await (permissionsForRole(user.role_id)), csrf, expiresAt));
});

router.post('/logout', async (req, res) => {
  if (req.session) {
    await (destroySession(req.session.id));
    await (logAccess(req, { userId: req.user.id, email: req.user.email, event: 'logout' }));
  }
  res.clearCookie(config.session.cookieName, cookieOptions());
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json(sessionPayload(req.user, req.perms, req.session.csrf_token, req.session.expires_at));
});

const RESET_MINUTES = 30;

export async function createResetToken(userId, createdBy = null) {
  const token = randomToken(32);
  await (db.run('INSERT INTO password_resets (user_id, token_hash, expires_at, created_by) VALUES (?, ?, ?, ?)', [
    userId,
    sha256(token),
    new Date(Date.now() + RESET_MINUTES * 60_000).toISOString(),
    createdBy,
  ]));
  return { token, url: `${config.appUrl}/restablecer?token=${encodeURIComponent(token)}`, expiresMinutes: RESET_MINUTES };
}

router.post('/forgot', sensitiveLimiter, async (req, res) => {
  const { email } = parse(z.object({ email: f.email() }), req.body);
  const user = await (db.get("SELECT id, name, email FROM users WHERE email = ? AND status = 'active'", [email]));
  if (user) {
    const { url } = await (createResetToken(user.id));
    await (logAccess(req, { userId: user.id, email, event: 'password_reset_requested' }));
    if (await (mailerStatus()).ready) {
      await await (sendMail({
        to: user.email,
        subject: 'Web Pulsar · Restablecer contraseña',
        text: `Hola ${user.name}:\n\nPara establecer una nueva contraseña abre este enlace (caduca en ${RESET_MINUTES} minutos):\n${url}\n\nSi no lo has solicitado, ignora este mensaje.`,
      })).catch((err) => console.error('[auth] No se pudo enviar el email de recuperación:', err.message));
    } else if (!config.isProd) {
      console.log(`[auth] (desarrollo, sin SMTP) Enlace de recuperación para ${email}: ${url}`);
    }
  }
  // Misma respuesta exista o no la cuenta
  res.json({
    ok: true,
    message: 'Si el email corresponde a una cuenta activa, recibirás un enlace para restablecer la contraseña. Si el correo no está configurado, pide a un administrador que genere el enlace.',
  });
});

router.post('/reset', sensitiveLimiter, async (req, res) => {
  const { token, password } = parse(z.object({ token: z.string().min(20).max(200), password: z.string() }), req.body);
  const reset = await (db.get('SELECT * FROM password_resets WHERE token_hash = ?', [sha256(token)]));
  if (!reset || reset.used_at || reset.expires_at < nowIso()) throw badRequest('El enlace no es válido o ha caducado. Solicita uno nuevo.');
  const user = await (db.get('SELECT * FROM users WHERE id = ?', [reset.user_id]));
  const problem = passwordProblem(password, user);
  if (problem) throw badRequest(problem, { password: problem });
  const hash = await hashPassword(password);
  await (tx(async () => {
    await (db.run('UPDATE users SET password_hash = ?, password_changed_at = ?, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?', [hash, nowIso(), nowIso(), user.id]));
    await (db.run('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [nowIso(), user.id]));
    await (destroyUserSessions(user.id));
  }));
  await (logAccess(req, { userId: user.id, email: user.email, event: 'password_reset_done' }));
  res.json({ ok: true });
});

router.post('/change-password', requireAuth, sensitiveLimiter, async (req, res) => {
  const { current_password, new_password } = parse(z.object({ current_password: z.string().min(1, 'Obligatorio'), new_password: z.string() }), req.body);
  const user = await (db.get('SELECT * FROM users WHERE id = ?', [req.user.id]));
  if (!(await verifyPassword(current_password, user.password_hash))) throw new HttpError(403, 'La contraseña actual no es correcta', { fields: { current_password: 'Incorrecta' } });
  const problem = passwordProblem(new_password, user);
  if (problem) throw badRequest(problem, { new_password: problem });
  const hash = await hashPassword(new_password);
  await (db.run('UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?', [hash, nowIso(), nowIso(), user.id]));
  await (destroyUserSessions(user.id, req.session.id));
  await (logAccess(req, { userId: user.id, email: user.email, event: 'password_changed' }));
  await (record(req, { action: 'user.password_changed', entityType: 'user', entityId: user.id, label: user.name, summary: `${user.name} cambió su contraseña` }));
  res.json({ ok: true });
});

router.get('/sessions', requireAuth, async (req, res) => {
  const rows = await (db.all('SELECT id, ip, user_agent, created_at, last_seen_at, expires_at FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC', [req.user.id]));
  res.json(rows.map((s) => ({ ...s, id: s.id.slice(0, 12), current: s.id === req.session.id })));
});

router.delete('/sessions/:prefix', requireAuth, async (req, res) => {
  const prefix = String(req.params.prefix).replace(/[^a-f0-9]/g, '');
  if (prefix.length !== 12) throw badRequest('Sesión no válida');
  await (db.run('DELETE FROM sessions WHERE user_id = ? AND substr(id, 1, 12) = ? AND id <> ?', [req.user.id, prefix, req.session.id]));
  res.json({ ok: true });
});

export default router;
