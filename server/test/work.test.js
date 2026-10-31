import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.DATABASE_PATH = ':memory:';
process.env.MASTER_KEY = crypto.randomBytes(32).toString('base64');
process.env.SCHEDULER_ENABLED = '0';
process.env.VAPID_PUBLIC_KEY = '';
process.env.VAPID_PRIVATE_KEY = '';
process.env.SMTP_HOST = '';

const { migrate } = await import('../src/db/migrate.js');
const { syncRbac } = await import('../src/auth/rbac.js');
const { db } = await import('../src/db/index.js');
const { emailNotification } = await import('../src/services/notifyEmail.js');
const { SETTING_DEFAULTS } = await import('../src/lib/settings.js');

migrate({ log: () => {} });
syncRbac();

const client = Number(db.run("INSERT INTO clients (name) VALUES ('C')").lastInsertRowid);
const project = Number(db.run("INSERT INTO projects (client_id, name, type, github_repo) VALUES (?, 'P', 'website', 'a/b')", [client]).lastInsertRowid);

test('change_reviews: estado válido, sha corto y un solo registro por cambio', () => {
  db.run("INSERT INTO change_reviews (project_id, sha, status) VALUES (?, 'abc1234', 'accepted')", [project]);
  assert.throws(() => db.run("INSERT INTO change_reviews (project_id, sha, status) VALUES (?, 'abc1234', 'new')", [project]), /UNIQUE/);
  assert.throws(() => db.run("INSERT INTO change_reviews (project_id, sha, status) VALUES (?, 'def5678', 'inventado')", [project]), /CHECK/);
  assert.throws(() => db.run("INSERT INTO change_reviews (project_id, sha) VALUES (?, 'ab')", [project]), /CHECK/);
});

test('borrar el proyecto elimina sus revisiones (ON DELETE CASCADE)', () => {
  db.run('DELETE FROM projects WHERE id = ?', [project]);
  assert.equal(db.value('SELECT COUNT(*) FROM change_reviews'), 0);
});

test('email: activado por defecto y sin SMTP no envía nada ni lanza', async () => {
  assert.equal(SETTING_DEFAULTS.automations.email_notifications, true);
  const user = Number(db.run("INSERT INTO users (email, name, password_hash, role_id) VALUES ('e@x.dev', 'E', 'x', (SELECT id FROM roles WHERE key = 'admin'))").lastInsertRowid);
  assert.deepEqual(await emailNotification([user], { title: 'Cobro vencido', link: '/finanzas' }), { sent: 0, failed: 0 });
});
