import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.DATABASE_PATH = ':memory:';
process.env.DATABASE_URL = '';
process.env.MASTER_KEY = crypto.randomBytes(32).toString('base64');
process.env.SCHEDULER_ENABLED = '0';

const { computeInvoice, formatInvoiceNumber, invoiceStatus, paymentStatus } = await import('../src/lib/money.js');
const { isValidSpanishTaxId } = await import('../src/lib/validate.js');
const { encryptSecret, decryptSecret } = await import('../src/lib/crypto.js');
const { hashPassword, verifyPassword, passwordProblem } = await import('../src/lib/password.js');
const { addMonths, nextOccurrence } = await import('../src/lib/dates.js');
const { migrate } = await import('../src/db/migrate.js');
const { syncRbac, permissionsForRole } = await import('../src/auth/rbac.js');
const { db } = await import('../src/db/index.js');
const { record, verifyAuditChain } = await import('../src/lib/audit.js');

await migrate({ log: () => {} });
await syncRbac();

test('cálculo de factura con descuentos, IVA e IRPF', () => {
  const { totals, lines } = computeInvoice(
    [
      { description: 'A', quantity: 1, unit_price_cents: 100000, discount_pct: 10, tax_rate: 21 },
      { description: 'B', quantity: 12, unit_price_cents: 3500, discount_pct: 0, tax_rate: 21 },
      { description: 'C', quantity: 2, unit_price_cents: 1000, discount_pct: 0, tax_rate: 10 },
    ],
    { withholdingPct: 15 },
  );
  assert.equal(lines[0].total_cents, 108900);
  assert.equal(totals.subtotal_cents, 144000);
  assert.equal(totals.discount_cents, 10000);
  assert.equal(totals.tax_cents, 18900 + 8820 + 200);
  assert.equal(totals.withholding_cents, Math.round(134000 * 0.15));
  assert.equal(totals.total_cents, 134000 + 27920 - 20100);
  assert.deepEqual(totals.tax_breakdown.map((b) => b.rate), [21, 10]);
});

test('descuento global y cantidades negativas (rectificativas)', () => {
  const { totals } = computeInvoice([{ quantity: -1, unit_price_cents: 10000, discount_pct: 0, tax_rate: 21 }], { globalDiscountPct: 10 });
  assert.equal(totals.taxable_cents, -9000);
  assert.equal(totals.total_cents, -10890);
});

test('numeración de series', () => {
  assert.equal(formatInvoiceNumber({ format: '{PREFIX}{YYYY}-{NUM}', prefix: 'F', padding: 4 }, 2026, 7), 'F2026-0007');
  assert.equal(formatInvoiceNumber({ format: '{YY}/{NUM}', prefix: '', padding: 3 }, 2026, 12), '26/012');
});

test('estados de cobro y factura', () => {
  assert.equal(paymentStatus({ amount_cents: 100, amount_paid_cents: 0, due_date: '2026-01-01', status: 'pending' }, '2026-02-01'), 'overdue');
  assert.equal(paymentStatus({ amount_cents: 100, amount_paid_cents: 50, due_date: '2026-03-01', status: 'pending' }, '2026-02-01'), 'partially_paid');
  assert.equal(paymentStatus({ amount_cents: 100, amount_paid_cents: 100, due_date: null, status: 'pending' }, '2026-02-01'), 'paid');
  assert.equal(paymentStatus({ amount_cents: 100, amount_paid_cents: 0, status: 'cancelled' }, '2026-02-01'), 'cancelled');
  assert.equal(invoiceStatus({ status: 'issued', total_cents: 100, paid_cents: 0, due_date: '2026-01-01' }, '2026-02-01'), 'overdue');
  assert.equal(invoiceStatus({ status: 'issued', total_cents: -100, paid_cents: 0 }, '2026-02-01'), 'paid');
});

test('validación de NIF, NIE y CIF', () => {
  assert.ok(isValidSpanishTaxId('12345678Z'));
  assert.ok(!isValidSpanishTaxId('12345678A'));
  assert.ok(isValidSpanishTaxId('X1234567L'));
  assert.ok(isValidSpanishTaxId('B12345674'));
  assert.ok(!isValidSpanishTaxId('B12345675'));
});

test('fechas: fin de mes y periodicidad', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(nextOccurrence('2026-03-15', 'quarterly'), '2026-06-15');
  assert.equal(nextOccurrence('2026-03-15', 'weekly'), '2026-03-22');
});

test('cifrado AES-256-GCM detecta manipulación', () => {
  const blob = encryptSecret('token-secreto');
  assert.equal(decryptSecret(blob), 'token-secreto');
  const parts = blob.split(':');
  parts[3] = Buffer.from('otro').toString('base64url');
  assert.throws(() => decryptSecret(parts.join(':')));
});

test('contraseñas: hash scrypt y política', async () => {
  const hash = await hashPassword('Correcta-Clave-2026');
  assert.ok(await verifyPassword('Correcta-Clave-2026', hash));
  assert.ok(!(await verifyPassword('otra', hash)));
  assert.ok(passwordProblem('corta'));
  assert.equal(passwordProblem('Correcta-Clave-2026'), null);
});

test('permisos por rol', async () => {
  const role = (key) => db.value('SELECT id FROM roles WHERE key = ?', [key]);
  assert.ok((await permissionsForRole(role('admin'))).has('users.manage'));
  assert.ok(!(await permissionsForRole(role('lectura'))).has('clients.write'));
  assert.ok(!(await permissionsForRole(role('lectura'))).has('secrets.use'));
  assert.ok((await permissionsForRole(role('finanzas'))).has('invoices.issue'));
  assert.ok(!(await permissionsForRole(role('tecnico'))).has('finance.read'));
});

test('factura emitida inmutable y registros de actividad no editables', async () => {
  const client = Number(db.run("INSERT INTO clients (name) VALUES ('Test')").lastInsertRowid);
  const inv = Number(db.run("INSERT INTO invoices (series_id, client_id, status, number, total_cents) VALUES (1, ?, 'issued', 'F2026-0001', 1000)", [client]).lastInsertRowid);
  assert.throws(() => db.run('UPDATE invoices SET total_cents = 5 WHERE id = ?', [inv]), /emitida/);
  assert.throws(() => db.run('DELETE FROM invoices WHERE id = ?', [inv]), /emitida/);
  db.run("UPDATE invoices SET status = 'paid', paid_cents = 1000 WHERE id = ?", [inv]);
  assert.throws(() => db.run("INSERT INTO invoice_items (invoice_id, description, quantity, unit_price_cents, base_cents, discount_cents, tax_cents, total_cents) VALUES (?, 'x', 1, 1, 1, 0, 0, 1)", [inv]));

  await record({ system: true }, { action: 'test', summary: 'uno' });
  await record({ system: true }, { action: 'test', summary: 'dos' });
  assert.throws(() => db.run('UPDATE activity_logs SET summary = ?', ['x']), /inmutable/);
  assert.throws(() => db.run('DELETE FROM audit_logs'), /inmutable/);
  assert.equal((await verifyAuditChain()).ok, true);
});

test('un testimonio no puede ser publicable sin autorización', () => {
  const client = db.value('SELECT id FROM clients LIMIT 1');
  assert.throws(() =>
    db.run("INSERT INTO testimonials (client_id, received_at, channel, status, can_publish) VALUES (?, '2026-01-01', 'call', 'pending_approval', 1)", [client]),
  );
});
