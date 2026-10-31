import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-uploads-'));
process.env.DATABASE_PATH = ':memory:';
process.env.MASTER_KEY = crypto.randomBytes(32).toString('base64');
process.env.SCHEDULER_ENABLED = '0';
process.env.UPLOADS_DIR = uploads;
process.env.VAPID_PUBLIC_KEY = '';
process.env.VAPID_PRIVATE_KEY = '';

const { migrate } = await import('../src/db/migrate.js');
const { syncRbac } = await import('../src/auth/rbac.js');
const { db } = await import('../src/db/index.js');
const { detectImage, logoPath } = await import('../src/routes/branding.js');
const { renderInvoicePdf } = await import('../src/services/invoices.js');
const { sendPush, pushEnabled } = await import('../src/services/push.js');
const { notify } = await import('../src/lib/notify.js');

migrate({ log: () => {} });
syncRbac();

// PNG de 1x1 píxel
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const pdf = (inv) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    const doc = renderInvoicePdf(inv);
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

const invoice = { id: 1, status: 'draft', kind: 'standard', number: null, client_id: 0, currency: 'EUR', issue_date: '2026-01-01', due_date: '2026-01-31', items: [], total_cents: 0, totals: { subtotal_cents: 0, discount_cents: 0, taxable_cents: 0, tax_breakdown: [], withholding_cents: 0, total_cents: 0 } };

test('detectImage identifica PNG y JPG por cabecera y rechaza SVG o texto', () => {
  assert.equal(detectImage(PNG)?.ext, 'png');
  assert.equal(detectImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))?.ext, 'jpg');
  assert.equal(detectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(detectImage(Buffer.from('GIF89a......')), null);
});

test('la factura en PDF se genera sin logo y con logo', async () => {
  assert.equal(logoPath(), null);
  const without = await pdf(invoice);
  assert.equal(without.subarray(0, 4).toString(), '%PDF');

  fs.mkdirSync(path.join(uploads, 'branding'), { recursive: true });
  fs.writeFileSync(path.join(uploads, 'branding', 'logo.png'), PNG);
  assert.ok(logoPath());
  const withLogo = await pdf(invoice);
  assert.equal(withLogo.subarray(0, 4).toString(), '%PDF');
  assert.ok(withLogo.length > without.length, 'el PDF con logo debe incluir la imagen');
});

test('push: sin claves VAPID no hace nada y notify sigue creando el aviso', async () => {
  assert.equal(pushEnabled(), false);
  assert.deepEqual(await sendPush([1], { title: 'x' }), { sent: 0, removed: 0 });
  const user = Number(db.run("INSERT INTO users (email, name, password_hash, role_id) VALUES ('p@x.dev', 'P', 'x', (SELECT id FROM roles WHERE key = 'admin'))").lastInsertRowid);
  assert.equal(notify({ userIds: [user], type: 't', title: 'Cobro vencido', dedupeKey: 'k1' }), 1);
  assert.equal(notify({ userIds: [user], type: 't', title: 'Cobro vencido', dedupeKey: 'k1' }), 0);
});
