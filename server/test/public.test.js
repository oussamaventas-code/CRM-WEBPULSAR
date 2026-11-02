import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.DATABASE_PATH = ':memory:';
process.env.DATABASE_URL = '';
process.env.MASTER_KEY = crypto.randomBytes(32).toString('base64');
process.env.SCHEDULER_ENABLED = '0';
process.env.PUBLIC_FORM_ORIGINS = 'https://webpulsar.es, https://www.webpulsar.es/';
process.env.TURNSTILE_SECRET_KEY = '';

const { migrate } = await import('../src/db/migrate.js');
const { syncRbac } = await import('../src/auth/rbac.js');
const { db } = await import('../src/db/index.js');
const { hashPassword } = await import('../src/lib/password.js');
const { createApp } = await import('../src/app.js');

await migrate({ log: () => {} });
await syncRbac();
db.run("INSERT INTO users (email, name, password_hash, role_id, is_owner) VALUES ('admin@test.es', 'Admin', ?, (SELECT id FROM roles WHERE key = 'admin'), 1)", [await hashPassword('Clave-Segura-123')]);

const server = createApp().listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/public/leads`;
test.after(() => server.close());

const lead = { name: 'Lucía Pérez', email: 'Lucia@Ejemplo.es', phone: '+34 600 000 000', company: 'Panadería Lucía', service: 'Tienda online', message: 'Quiero una web nueva', consent: true };
const post = (body, origin = 'https://webpulsar.es') =>
  fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });

test('preflight CORS solo para orígenes permitidos', async () => {
  const ok = await fetch(base, { method: 'OPTIONS', headers: { Origin: 'https://www.webpulsar.es', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://www.webpulsar.es');
  const bad = await fetch(base, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(bad.status, 403);
});

test('una solicitud crea un cliente pendiente con su mensaje y avisa', async () => {
  const res = await post(lead);
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://webpulsar.es');
  const client = db.get("SELECT * FROM clients WHERE email = 'lucia@ejemplo.es'");
  assert.equal(client.status, 'pending');
  assert.equal(client.source, 'web');
  assert.deepEqual(JSON.parse(client.tags), ['web']);
  const comm = db.get('SELECT * FROM client_communications WHERE client_id = ?', [client.id]);
  assert.match(comm.body, /Servicio: Tienda online/);
  assert.match(comm.body, /Quiero una web nueva/);
  assert.equal(db.value("SELECT COUNT(*) FROM notifications WHERE type = 'client.lead'"), 1);
});

test('el mismo email se añade al cliente existente', async () => {
  assert.equal((await post({ ...lead, email: 'lucia@ejemplo.es', message: 'Segundo mensaje' })).status, 201);
  assert.equal(db.value("SELECT COUNT(*) FROM clients WHERE email = 'lucia@ejemplo.es'"), 1);
  assert.equal(db.value('SELECT COUNT(*) FROM client_communications'), 2);
});

test('validación, consentimiento y honeypot', async () => {
  const invalid = await post({ name: 'X', email: 'no-es-email', message: '', consent: false });
  assert.equal(invalid.status, 400);
  const { fields } = await invalid.json();
  assert.ok(fields.email && fields.message && fields.consent);

  const before = db.value('SELECT COUNT(*) FROM clients');
  assert.equal((await post({ ...lead, email: 'bot@spam.es', website: 'http://spam' })).status, 201);
  assert.equal(db.value('SELECT COUNT(*) FROM clients'), before);
});

test('límite de 5 envíos por IP cada 15 minutos', async () => {
  // Ya van 4 envíos POST en este archivo; el 5.º pasa y el 6.º se bloquea con CORS para que la web lea el error.
  assert.equal((await post({ ...lead, email: 'otro@ejemplo.es' })).status, 201);
  const blocked = await post({ ...lead, email: 'otro2@ejemplo.es' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('access-control-allow-origin'), 'https://webpulsar.es');
});
