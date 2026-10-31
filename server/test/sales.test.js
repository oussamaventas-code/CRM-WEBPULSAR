import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.DATABASE_PATH = ':memory:';
process.env.MASTER_KEY = crypto.randomBytes(32).toString('base64');
process.env.SCHEDULER_ENABLED = '0';

const { migrate } = await import('../src/db/migrate.js');
const { syncRbac, permissionsForRole } = await import('../src/auth/rbac.js');
const { db } = await import('../src/db/index.js');
const { normalizeRepo } = await import('../src/routes/github.js');
const { loadDemoData, clearDemoData } = await import('../src/seed/demo.js');

migrate({ log: () => {} });
syncRbac();

test('normalizeRepo acepta owner/repo y URLs de GitHub y rechaza rutas manipuladas', () => {
  assert.equal(normalizeRepo('Ayoxb1/PlantillaElectricistasWeb'), 'Ayoxb1/PlantillaElectricistasWeb');
  assert.equal(normalizeRepo('https://github.com/oussamaventas-code/CRM-WEBPULSAR.git'), 'oussamaventas-code/CRM-WEBPULSAR');
  assert.equal(normalizeRepo('owner/repo/../../users'), null);
  assert.equal(normalizeRepo('owner/repo?x=1'), null);
  assert.equal(normalizeRepo(''), null);
});

test('deals: la etapa y la probabilidad están restringidas por la base de datos', () => {
  assert.throws(() => db.run("INSERT INTO deals (title, stage) VALUES ('x', 'inventada')"), /CHECK/);
  assert.throws(() => db.run("INSERT INTO deals (title, probability) VALUES ('x', 150)"), /CHECK/);
  db.run("INSERT INTO deals (title) VALUES ('ok')");
  assert.equal(db.get("SELECT stage, probability FROM deals WHERE title = 'ok'").stage, 'lead');
  db.run("DELETE FROM deals WHERE title = 'ok'");
});

test('permisos de ventas: lectura para técnico, escritura para finanzas, ambos para admin', () => {
  const perms = (key) => permissionsForRole(db.value('SELECT id FROM roles WHERE key = ?', [key]));
  assert.ok(perms('admin').has('sales.write'));
  assert.ok(perms('finanzas').has('sales.write'));
  assert.ok(perms('tecnico').has('sales.read') && !perms('tecnico').has('sales.write'));
  assert.ok(perms('lectura').has('sales.read') && !perms('lectura').has('sales.write'));
});

test('datos DEMO: se cargan oportunidades y se pueden borrar junto con los clientes DEMO', () => {
  loadDemoData({ system: true });
  assert.equal(db.value('SELECT COUNT(*) FROM deals WHERE is_demo = 1'), 6);
  assert.ok(db.value("SELECT COUNT(*) FROM deals WHERE is_demo = 1 AND client_id IS NOT NULL") > 0);
  clearDemoData({ system: true });
  assert.equal(db.value('SELECT COUNT(*) FROM deals'), 0);
  assert.equal(db.value('SELECT COUNT(*) FROM clients'), 0);
});
