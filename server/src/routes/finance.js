import fs from 'node:fs';
import { Router } from 'express';
import { db, nowIso, tx } from '../db/index.js';
import { can } from '../middleware/auth.js';
import { findOr404, insert, paginate, update } from '../lib/query.js';
import { f, parse, z } from '../lib/validate.js';
import { badRequest, conflict } from '../lib/errors.js';
import { record } from '../lib/audit.js';
import { getSetting } from '../lib/settings.js';
import { addDays, nextOccurrence, today } from '../lib/dates.js';
import { paymentStatus } from '../lib/money.js';
import { financeSeries, financeTotals, recomputeInvoice } from '../services/finance.js';
import { createRectification, issueBlockers, issueInvoice, loadInvoice, renderInvoicePdf, saveDraftItems } from '../services/invoices.js';
import { generateRecurring } from '../services/automations.js';
import { sendMail } from '../services/mailer.js';
import { completeSupabaseUpload, storeUpload, upload } from './documents.js';
import { removeObject } from '../storage/supabase.js';

const router = Router();
const METHODS = ['transfer', 'card', 'stripe', 'paypal', 'cash', 'other'];
const money = (c) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(c / 100);

async function clientLabel(id) {
  const c = await (db.get('SELECT name, company FROM clients WHERE id = ?', [id]));
  return c ? c.company || c.name : 'cliente';
}

async function assertClient(id) {
  if (!await (db.value('SELECT 1 FROM clients WHERE id = ? AND deleted_at IS NULL', [id]))) throw badRequest('Cliente no válido', { client_id: 'Selecciona un cliente' });
}

// ── Resumen ──────────────────────────────────────────────
router.get('/finance/summary', can('finance.read'), async (_req, res) => {
  res.json({
    totals: await (financeTotals()),
    upcoming: await (db.all(
      `SELECT * FROM (SELECT 'invoice' AS kind, i.id, i.number AS label, i.client_id, c.name AS client_name, i.due_date, i.total_cents - i.paid_cents AS amount_cents, i.status
       FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.status IN ('issued', 'partially_paid', 'overdue')
       UNION ALL
       SELECT 'payment', p.id, p.concept, p.client_id, c.name, p.due_date, p.amount_cents - p.amount_paid_cents, p.status
       FROM payments p JOIN clients c ON c.id = p.client_id WHERE p.invoice_id IS NULL AND p.status IN ('pending', 'partially_paid', 'overdue')
       UNION ALL
       SELECT 'recurring', r.id, r.concept, r.client_id, c.name, r.next_due_date, r.amount_cents, 'scheduled'
       FROM recurring_payments r JOIN clients c ON c.id = r.client_id WHERE r.status = 'active' AND r.next_due_date <= ?)
       ORDER BY due_date IS NULL, due_date LIMIT 12`,
      [addDays(today(), 45)],
    )),
    expenses_by_category: await (db.all("SELECT category, SUM(amount_cents) AS amount_cents FROM expenses WHERE date >= ? GROUP BY category ORDER BY 2 DESC", [`${today().slice(0, 4)}-01-01`])),
  });
});

router.get('/finance/series', can('finance.read'), async (req, res) => {
  res.json(await (financeSeries(['7d', '30d', '90d', '12m'].includes(req.query.range) ? req.query.range : '30d')));
});

// ── Series de facturación ────────────────────────────────
const seriesSchema = z.object({
  code: z.string().trim().min(1).max(10).regex(/^[A-Z0-9-]+$/i, 'Solo letras, números y guiones'),
  name: f.text(80),
  prefix: z.string().trim().max(10).default(''),
  format: z.string().trim().max(40).refine((s) => s.includes('{NUM}'), 'El formato debe incluir {NUM}').default('{PREFIX}{YYYY}-{NUM}'),
  padding: f.int(1, 10).default(4),
  reset_yearly: f.bool().default(true),
  kind: f.oneOf(['standard', 'rectifying']).default('standard'),
  is_default: f.bool().default(false),
  active: f.bool().default(true),
});

router.get('/invoice-series', can('finance.read'), async (_req, res) => {
  res.json(
    await (db.all(
      `SELECT s.*, (SELECT COUNT(*) FROM invoices i WHERE i.series_id = s.id AND i.status <> 'draft') AS issued_count,
              (SELECT last_number FROM invoice_series_counters k WHERE k.series_id = s.id ORDER BY year DESC LIMIT 1) AS last_number
       FROM invoice_series s ORDER BY s.kind, s.code`,
    )),
  );
});

router.post('/invoice-series', can('settings.manage'), async (req, res) => {
  const data = parse(seriesSchema, req.body);
  const id = await (tx(async () => {
    if (data.is_default) await (db.run('UPDATE invoice_series SET is_default = 0 WHERE kind = ?', [data.kind]));
    const newId = await (insert('invoice_series', { ...data, code: data.code.toUpperCase() }));
    await (record(req, { action: 'invoice_series.created', entityType: 'invoice_series', entityId: newId, label: data.code, summary: `Serie de facturación creada: ${data.code}` }));
    return newId;
  }));
  res.status(201).json(await (db.get('SELECT * FROM invoice_series WHERE id = ?', [id])));
});

router.patch('/invoice-series/:id', can('settings.manage'), async (req, res) => {
  const series = await (findOr404('invoice_series', req.params.id, { message: 'Serie no encontrada' }));
  const data = parse(seriesSchema.partial(), req.body);
  const issued = await (db.value("SELECT COUNT(*) FROM invoices WHERE series_id = ? AND status <> 'draft'", [series.id]));
  if (issued && ['code', 'prefix', 'format', 'padding', 'reset_yearly', 'kind'].some((k) => k in data && data[k] !== series[k] && !(typeof data[k] === 'boolean' && Number(data[k]) === series[k]))) {
    throw conflict('La serie ya tiene facturas emitidas: solo puedes cambiar el nombre, activarla o marcarla por defecto');
  }
  await (tx(async () => {
    if (data.is_default) await (db.run('UPDATE invoice_series SET is_default = 0 WHERE kind = ?', [data.kind ?? series.kind]));
    await (update('invoice_series', series.id, data));
    await (record(req, { action: 'invoice_series.updated', entityType: 'invoice_series', entityId: series.id, label: series.code, summary: `Serie de facturación actualizada: ${series.code}`, before: series, after: data }));
  }));
  res.json(await (db.get('SELECT * FROM invoice_series WHERE id = ?', [series.id])));
});

// ── Facturas ─────────────────────────────────────────────
const itemSchema = z.object({
  service_id: f.optId(),
  description: f.text(500),
  quantity: z.coerce.number().refine((n) => n !== 0, 'No puede ser 0').refine((n) => Math.abs(n) <= 1e6, 'Cantidad no válida'),
  unit_price_cents: z.coerce.number().int('Precio no válido').min(0, 'No puede ser negativo').max(1e11),
  discount_pct: f.pct().default(0),
  tax_rate: f.pct(),
});

const invoiceSchema = z.object({
  series_id: f.optId(),
  client_id: f.id(),
  project_id: f.optId(),
  issue_date: f.optDate(),
  due_date: f.optDate(),
  global_discount_pct: f.pct().default(0),
  withholding_pct: f.pct().default(0),
  notes: f.optText(3000),
  footer: f.optText(2000),
  items: z.array(itemSchema).min(1, 'Añade al menos una línea').max(200),
});

const INVOICE_LIST_FROM = `(SELECT i.*, c.name AS client_name, c.company AS client_company, s.code AS series_code, p.name AS project_name
  FROM invoices i JOIN clients c ON c.id = i.client_id JOIN invoice_series s ON s.id = i.series_id LEFT JOIN projects p ON p.id = i.project_id) x`;

router.get('/invoices', can('finance.read'), async (req, res) => {
  const where = [];
  const params = [];
  const statuses = String(req.query.status ?? '').split(',').filter(Boolean);
  if (statuses.length) where.push(`x.status IN (${statuses.map(() => '?').join(', ')})`) && params.push(...statuses);
  if (req.query.client_id) where.push('x.client_id = ?') && params.push(Number(req.query.client_id));
  if (req.query.project_id) where.push('x.project_id = ?') && params.push(Number(req.query.project_id));
  if (req.query.series_id) where.push('x.series_id = ?') && params.push(Number(req.query.series_id));
  if (req.query.from) where.push('x.issue_date >= ?') && params.push(String(req.query.from));
  if (req.query.to) where.push('x.issue_date <= ?') && params.push(String(req.query.to));
  res.json(
    await (paginate(req.query, {
      from: INVOICE_LIST_FROM,
      where,
      params,
      searchColumns: ['x.number', 'x.client_name', 'x.client_company', 'x.notes'],
      sortMap: { number: 'x.year DESC, x.sequence', issue_date: 'x.issue_date', due_date: 'x.due_date', total: 'x.total_cents', client: 'x.client_name COLLATE NOCASE', status: 'x.status', created_at: 'x.created_at' },
      defaultSort: ['created_at', 'desc'],
      tiebreak: 'x.id DESC',
    })),
  );
});

router.get('/invoices/:id', can('finance.read'), async (req, res) => {
  const inv = await (loadInvoice(req.params.id));
  res.json({ ...inv, blockers: inv.status === 'draft' ? await (issueBlockers(inv)).problems : [] });
});

async function defaultSeries(kind = 'standard') {
  const s = await (db.get('SELECT id FROM invoice_series WHERE kind = ? AND active = 1 ORDER BY is_default DESC, id LIMIT 1', [kind]));
  if (!s) throw conflict('No hay ninguna serie de facturación activa');
  return s.id;
}

router.post('/invoices', can('finance.write'), async (req, res) => {
  const data = parse(invoiceSchema, req.body);
  await (assertClient(data.client_id));
  const id = await (tx(async () => {
    const newId = await (insert('invoices', {
      series_id: data.series_id ?? await (defaultSeries()),
      client_id: data.client_id,
      project_id: data.project_id,
      issue_date: data.issue_date,
      due_date: data.due_date,
      currency: await (await (getSetting('invoicing'))).currency,
      notes: data.notes,
      footer: data.footer,
      created_by: req.user.id,
    }));
    await (saveDraftItems(newId, data.items, { globalDiscountPct: data.global_discount_pct, withholdingPct: data.withholding_pct }));
    await (record(req, { action: 'invoice.draft_created', entityType: 'invoice', entityId: newId, clientId: data.client_id, label: 'Borrador', summary: `Borrador de factura para ${await (clientLabel(data.client_id))}` }));
    return newId;
  }));
  res.status(201).json(await (loadInvoice(id)));
});

router.put('/invoices/:id', can('finance.write'), async (req, res) => {
  const inv = await (loadInvoice(req.params.id));
  if (inv.status !== 'draft') throw conflict('Solo se pueden editar borradores. Para corregir una factura emitida, crea una rectificativa.');
  const data = parse(invoiceSchema, req.body);
  await (assertClient(data.client_id));
  if (inv.kind === 'rectifying' && data.client_id !== inv.client_id) throw conflict('Una rectificativa debe mantener el cliente de la factura original');
  await (tx(async () => {
    await (update('invoices', inv.id, {
      series_id: data.series_id ?? inv.series_id,
      client_id: data.client_id,
      project_id: data.project_id,
      issue_date: data.issue_date,
      due_date: data.due_date,
      notes: data.notes,
      footer: data.footer,
    }));
    await (saveDraftItems(inv.id, data.items, { globalDiscountPct: data.global_discount_pct, withholdingPct: data.withholding_pct }));
    await (record(req, { action: 'invoice.draft_updated', entityType: 'invoice', entityId: inv.id, clientId: data.client_id, label: 'Borrador', summary: `Borrador de factura actualizado (${await (clientLabel(data.client_id))})` }));
  }));
  res.json(await (loadInvoice(inv.id)));
});

router.delete('/invoices/:id', can('finance.write'), async (req, res) => {
  const inv = await (loadInvoice(req.params.id));
  if (inv.status !== 'draft') throw conflict('Las facturas emitidas no se eliminan. Emite una rectificativa.');
  await (tx(async () => {
    await (db.run('DELETE FROM invoices WHERE id = ?', [inv.id]));
    await (record(req, { action: 'invoice.draft_deleted', entityType: 'invoice', entityId: inv.id, clientId: inv.client_id, label: 'Borrador', summary: `Borrador de factura eliminado (${await (clientLabel(inv.client_id))})` }));
  }));
  res.json({ ok: true });
});

router.post('/invoices/:id/issue', can('invoices.issue'), async (req, res) => {
  const { issue_date } = parse(z.object({ issue_date: f.optDate() }), req.body);
  res.json(await (issueInvoice(req, Number(req.params.id), { issueDate: issue_date ?? undefined })));
});

router.post('/invoices/:id/rectify', can('invoices.issue'), async (req, res) => {
  const { reason } = parse(z.object({ reason: f.text(500) }), req.body);
  res.status(201).json(await (createRectification(req, Number(req.params.id), reason)));
});

router.get('/invoices/:id/pdf', can('finance.read'), async (req, res) => {
  const inv = await (loadInvoice(req.params.id));
  const name = inv.number ? `Factura-${inv.number}.pdf` : `Borrador-factura-${inv.id}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${name}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  await (renderInvoicePdf(inv)).pipe(res);
});

const pdfBuffer = (inv) =>
  new Promise(async (resolve, reject) => {
    const chunks = [];
    const doc = await (renderInvoicePdf(inv));
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

router.post('/invoices/:id/send', can('invoices.issue'), async (req, res) => {
  const inv = await (loadInvoice(req.params.id));
  if (inv.status === 'draft') throw conflict('Emite la factura antes de enviarla');
  const data = parse(z.object({ to: f.email(), subject: f.text(200), message: f.text(5000) }), req.body);
  const pdf = await pdfBuffer(inv);
  await sendMail({ to: data.to, subject: data.subject, text: data.message, attachments: [{ filename: `Factura-${inv.number}.pdf`, content: pdf, contentType: 'application/pdf' }] });
  await (db.run('UPDATE invoices SET sent_at = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), inv.id]));
  await (record(req, { action: 'invoice.sent', entityType: 'invoice', entityId: inv.id, clientId: inv.client_id, label: inv.number, summary: `Factura ${inv.number} enviada a ${data.to}` }));
  res.json(await (loadInvoice(inv.id)));
});

const collectSchema = z.object({
  amount_cents: f.positiveCents(),
  paid_at: f.date(),
  method: f.oneOf(METHODS),
  external_ref: f.optText(120),
  notes: f.optText(1000),
});

router.post('/invoices/:id/payments', can('finance.write'), async (req, res) => {
  const inv = await (loadInvoice(req.params.id));
  if (!['issued', 'partially_paid', 'overdue'].includes(inv.status)) throw conflict('Solo se registran cobros en facturas emitidas pendientes de pago');
  const data = parse(collectSchema, req.body);
  const outstanding = inv.total_cents - inv.paid_cents;
  if (data.amount_cents > outstanding) throw badRequest(`El importe supera lo pendiente (${money(outstanding)})`, { amount_cents: 'Supera el importe pendiente' });
  await (tx(async () => {
    await (insert('payments', {
      client_id: inv.client_id,
      project_id: inv.project_id,
      invoice_id: inv.id,
      concept: `Cobro factura ${inv.number}`,
      amount_cents: data.amount_cents,
      amount_paid_cents: data.amount_cents,
      currency: inv.currency,
      issued_on: data.paid_at,
      paid_at: data.paid_at,
      method: data.method,
      status: 'paid',
      external_ref: data.external_ref,
      notes: data.notes,
      is_demo: inv.is_demo,
      created_by: req.user.id,
    }));
    await (recomputeInvoice(inv.id));
    await (record(req, { action: 'payment.received', entityType: 'invoice', entityId: inv.id, clientId: inv.client_id, label: inv.number, summary: `Pago recibido: ${money(data.amount_cents)} · ${inv.number}`, data: data }));
  }));
  res.status(201).json(await (loadInvoice(inv.id)));
});

// ── Cobros ───────────────────────────────────────────────
const paymentSchema = z
  .object({
    client_id: f.id(),
    project_id: f.optId(),
    concept: f.text(250),
    amount_cents: f.positiveCents(),
    amount_paid_cents: f.cents().default(0),
    issued_on: f.date(),
    due_date: f.optDate(),
    paid_at: f.optDate(),
    method: f.optOneOf(METHODS),
    status: f.optOneOf(['cancelled', 'refunded']),
    external_ref: f.optText(120),
    notes: f.optText(2000),
  })
  .superRefine((d, ctx) => {
    if (d.amount_paid_cents > d.amount_cents) ctx.addIssue({ code: 'custom', path: ['amount_paid_cents'], message: 'No puede superar el importe' });
    if (d.amount_paid_cents > 0 && !d.paid_at) ctx.addIssue({ code: 'custom', path: ['paid_at'], message: 'Indica la fecha de cobro' });
  });

const PAYMENT_FROM = `(SELECT p.*, c.name AS client_name, c.company AS client_company, pr.name AS project_name, i.number AS invoice_number,
  rp.frequency AS recurring_frequency, rp.concept AS recurring_concept
  FROM payments p JOIN clients c ON c.id = p.client_id LEFT JOIN projects pr ON pr.id = p.project_id LEFT JOIN invoices i ON i.id = p.invoice_id
  LEFT JOIN recurring_payments rp ON rp.id = p.recurring_payment_id) x`;

router.get('/payments', can('finance.read'), async (req, res) => {
  const where = [];
  const params = [];
  const statuses = String(req.query.status ?? '').split(',').filter(Boolean);
  if (statuses.length) where.push(`x.status IN (${statuses.map(() => '?').join(', ')})`) && params.push(...statuses);
  if (req.query.client_id) where.push('x.client_id = ?') && params.push(Number(req.query.client_id));
  if (req.query.project_id) where.push('x.project_id = ?') && params.push(Number(req.query.project_id));
  if (req.query.kind === 'standalone') where.push('x.invoice_id IS NULL');
  if (req.query.kind === 'invoice') where.push('x.invoice_id IS NOT NULL');
  // Pagos de entrada (únicos: anticipos, proyectos, facturas) frente a cuotas generadas por un plan recurrente
  if (req.query.kind === 'entry') where.push('x.recurring_payment_id IS NULL');
  if (req.query.kind === 'monthly') where.push('x.recurring_payment_id IS NOT NULL');
  if (req.query.recurring_payment_id) where.push('x.recurring_payment_id = ?') && params.push(Number(req.query.recurring_payment_id));
  if (METHODS.includes(req.query.method)) where.push('x.method = ?') && params.push(req.query.method);
  res.json(
    await (paginate(req.query, {
      from: PAYMENT_FROM,
      where,
      params,
      searchColumns: ['x.concept', 'x.client_name', 'x.client_company', 'x.external_ref', 'x.invoice_number'],
      sortMap: { issued_on: 'x.issued_on', due_date: 'x.due_date', paid_at: 'x.paid_at', amount: 'x.amount_cents', client: 'x.client_name COLLATE NOCASE', status: 'x.status', created_at: 'x.created_at' },
      defaultSort: ['issued_on', 'desc'],
      tiebreak: 'x.id DESC',
    })),
  );
});

const loadPayment = async (id) => await (db.get(`SELECT * FROM ${PAYMENT_FROM} WHERE x.id = ?`, [id]));

router.post('/payments', can('finance.write'), async (req, res) => {
  const data = parse(paymentSchema, req.body);
  await (assertClient(data.client_id));
  const id = await (tx(async () => {
    const row = { ...data, currency: await (await (getSetting('invoicing'))).currency, created_by: req.user.id };
    row.status = paymentStatus({ ...row, status: data.status ?? 'pending' }, today());
    const newId = await (insert('payments', row));
    const label = await (clientLabel(data.client_id));
    await (record(req, {
      action: data.amount_paid_cents > 0 ? 'payment.received' : 'payment.created',
      entityType: 'payment',
      entityId: newId,
      clientId: data.client_id,
      label: data.concept,
      summary: data.amount_paid_cents > 0 ? `Pago recibido: ${money(data.amount_paid_cents)} · ${label}` : `Cobro pendiente registrado: ${money(data.amount_cents)} · ${label}`,
      after: data,
    }));
    return newId;
  }));
  res.status(201).json(await (loadPayment(id)));
});

router.patch('/payments/:id', can('finance.write'), async (req, res) => {
  const before = await (findOr404('payments', req.params.id, { message: 'Cobro no encontrado' }));
  const data = parse(paymentSchema.innerType().partial(), req.body);
  if (before.invoice_id && ['amount_cents', 'amount_paid_cents', 'client_id'].some((k) => k in data)) {
    throw conflict('Este cobro pertenece a una factura: anúlalo y registra uno nuevo si el importe es incorrecto');
  }
  const merged = { ...before, ...data };
  if (merged.amount_paid_cents > merged.amount_cents) throw badRequest('Lo cobrado no puede superar el importe', { amount_paid_cents: 'Supera el importe' });
  if (merged.amount_paid_cents > 0 && !merged.paid_at) throw badRequest('Indica la fecha de cobro', { paid_at: 'Obligatorio' });
  await (tx(async () => {
    const status = paymentStatus({ ...merged, status: data.status ?? (['cancelled', 'refunded'].includes(before.status) && !('status' in data) ? before.status : 'pending') }, today());
    await (update('payments', before.id, { ...data, status }));
    if (before.invoice_id) await (recomputeInvoice(before.invoice_id));
    const statusChanged = status !== before.status;
    await (record(req, {
      action: statusChanged ? `payment.${status}` : 'payment.updated',
      entityType: 'payment',
      entityId: before.id,
      clientId: before.client_id,
      label: before.concept,
      summary: statusChanged && status === 'paid' ? `Pago recibido: ${money(merged.amount_paid_cents)} · ${await (clientLabel(before.client_id))}` : `Cobro actualizado: ${before.concept}`,
      before,
      after: { ...data, status },
    }));
  }));
  res.json(await (loadPayment(before.id)));
});

router.post('/payments/:id/collect', can('finance.write'), async (req, res) => {
  const p = await (findOr404('payments', req.params.id, { message: 'Cobro no encontrado' }));
  if (!['pending', 'partially_paid', 'overdue'].includes(p.status)) throw conflict('Este cobro no está pendiente');
  const data = parse(collectSchema, req.body);
  const remaining = p.amount_cents - p.amount_paid_cents;
  if (data.amount_cents > remaining) throw badRequest(`El importe supera lo pendiente (${money(remaining)})`, { amount_cents: 'Supera lo pendiente' });
  await (tx(async () => {
    const paid = p.amount_paid_cents + data.amount_cents;
    const status = paymentStatus({ ...p, amount_paid_cents: paid, status: 'pending' }, today());
    await (update('payments', p.id, {
      amount_paid_cents: paid,
      paid_at: data.paid_at,
      method: data.method,
      external_ref: data.external_ref ?? p.external_ref,
      notes: data.notes ? [p.notes, data.notes].filter(Boolean).join('\n') : undefined,
      status,
    }));
    if (p.invoice_id) await (recomputeInvoice(p.invoice_id));
    await (record(req, { action: 'payment.received', entityType: 'payment', entityId: p.id, clientId: p.client_id, label: p.concept, summary: `Pago recibido: ${money(data.amount_cents)} · ${await (clientLabel(p.client_id))}`, data }));
  }));
  res.json(await (loadPayment(p.id)));
});

// ── Pagos recurrentes ────────────────────────────────────
const recurringSchema = z.object({
  client_id: f.id(),
  client_service_id: f.optId(),
  project_id: f.optId(),
  concept: f.text(200),
  category: f.oneOf(['hosting', 'maintenance', 'subscription', 'fee', 'renewal', 'other']).default('other'),
  amount_cents: f.positiveCents(),
  frequency: f.oneOf(['weekly', 'monthly', 'quarterly', 'semiannual', 'yearly']),
  start_date: f.date(),
  next_due_date: f.optDate(),
  end_date: f.optDate(),
  reminder_days: f.int(0, 90).default(7),
  auto_generate: f.bool().default(true),
  status: f.oneOf(['active', 'paused', 'cancelled']).default('active'),
  notes: f.optText(2000),
});

// Al dar de alta una cuota se puede registrar ya cobrada la primera mensualidad
const firstPaymentSchema = z.object({ first_paid_at: f.optDate(), first_method: f.optOneOf(METHODS) });

const RECURRING_SELECT = `SELECT r.*, c.name AS client_name, c.company AS client_company, p.name AS project_name,
  (SELECT COUNT(*) FROM payments x WHERE x.recurring_payment_id = r.id) AS generated_count,
  (SELECT COUNT(*) FROM payments x WHERE x.recurring_payment_id = r.id AND x.status IN ('pending', 'partially_paid', 'overdue')) AS pending_count,
  (SELECT COALESCE(SUM(x.amount_cents - x.amount_paid_cents), 0) FROM payments x WHERE x.recurring_payment_id = r.id AND x.status IN ('pending', 'partially_paid', 'overdue')) AS pending_cents,
  (SELECT MAX(x.paid_at) FROM payments x WHERE x.recurring_payment_id = r.id AND x.amount_paid_cents > 0) AS last_paid_at
  FROM recurring_payments r JOIN clients c ON c.id = r.client_id LEFT JOIN projects p ON p.id = r.project_id`;

router.get('/recurring', can('finance.read'), async (req, res) => {
  const where = ['c.deleted_at IS NULL'];
  const params = [];
  if (req.query.client_id) where.push('r.client_id = ?') && params.push(Number(req.query.client_id));
  if (req.query.status) where.push('r.status = ?') && params.push(String(req.query.status));
  res.json(await (db.all(`${RECURRING_SELECT} WHERE ${where.join(' AND ')} ORDER BY r.status = 'active' DESC, r.next_due_date`, params)));
});

router.post('/recurring', can('finance.write'), async (req, res) => {
  const data = parse(recurringSchema, req.body);
  const first = parse(firstPaymentSchema, req.body);
  await (assertClient(data.client_id));
  if (first.first_paid_at && !first.first_method) throw badRequest('Indica cómo se cobró la primera cuota', { first_method: 'Obligatorio' });
  const id = await (tx(async () => {
    const currency = await (await (getSetting('invoicing'))).currency;
    const nextDue = first.first_paid_at ? nextOccurrence(data.start_date, data.frequency) : data.next_due_date ?? data.start_date;
    const newId = await (insert('recurring_payments', { ...data, next_due_date: nextDue, currency, created_by: req.user.id }));
    if (first.first_paid_at) {
      await (insert('payments', {
        client_id: data.client_id, project_id: data.project_id, recurring_payment_id: newId, period_date: data.start_date, concept: data.concept,
        amount_cents: data.amount_cents, amount_paid_cents: data.amount_cents, currency, issued_on: data.start_date, due_date: data.start_date,
        paid_at: first.first_paid_at, method: first.first_method, status: 'paid', created_by: req.user.id,
      }));
      await (record(req, { action: 'payment.received', entityType: 'recurring', entityId: newId, clientId: data.client_id, label: data.concept, summary: `Pago recibido: ${money(data.amount_cents)} · primera cuota de ${data.concept} · ${await (clientLabel(data.client_id))}` }));
    }
    await (record(req, { action: 'recurring.created', entityType: 'recurring', entityId: newId, clientId: data.client_id, label: data.concept, summary: `Pago recurrente configurado: ${data.concept} (${money(data.amount_cents)})`, after: data }));
    return newId;
  }));
  res.status(201).json(await (db.get(`${RECURRING_SELECT} WHERE r.id = ?`, [id])));
});

router.patch('/recurring/:id', can('finance.write'), async (req, res) => {
  const before = await (findOr404('recurring_payments', req.params.id, { message: 'Pago recurrente no encontrado' }));
  const data = parse(recurringSchema.partial(), req.body);
  await (tx(async () => {
    await (update('recurring_payments', before.id, data));
    await (record(req, { action: 'recurring.updated', entityType: 'recurring', entityId: before.id, clientId: before.client_id, label: before.concept, summary: `Pago recurrente actualizado: ${before.concept}`, before, after: data }));
  }));
  res.json(await (db.get(`${RECURRING_SELECT} WHERE r.id = ?`, [before.id])));
});

/** Genera ya el cobro del siguiente periodo (aunque aún no haya vencido). */
router.post('/recurring/:id/generate', can('finance.write'), async (req, res) => {
  const r = await (findOr404('recurring_payments', req.params.id, { message: 'Pago recurrente no encontrado' }));
  if (r.status !== 'active') throw conflict('El pago recurrente no está activo');
  const created = await (generateRecurring(req, { id: r.id, force: true }));
  res.json({ created, recurring: await (db.get(`${RECURRING_SELECT} WHERE r.id = ?`, [r.id])) });
});

// ── Gastos ───────────────────────────────────────────────
export const EXPENSE_CATEGORIES = ['hosting', 'domains', 'software', 'hardware', 'marketing', 'freelance', 'taxes', 'office', 'training', 'other'];
const expenseSchema = z.object({
  supplier: f.text(150),
  concept: f.text(250),
  amount_cents: f.positiveCents(),
  tax_cents: f.cents().default(0),
  date: f.date(),
  category: f.oneOf(EXPENSE_CATEGORIES),
  client_id: f.optId(),
  project_id: f.optId(),
  server_id: f.optId(),
  payment_method: f.optOneOf(METHODS),
  notes: f.optText(2000),
});

const EXPENSE_FROM = `(SELECT e.*, c.name AS client_name, p.name AS project_name, s.name AS server_name, d.file_name AS document_name
  FROM expenses e LEFT JOIN clients c ON c.id = e.client_id LEFT JOIN projects p ON p.id = e.project_id
  LEFT JOIN servers s ON s.id = e.server_id LEFT JOIN documents d ON d.id = e.document_id AND d.deleted_at IS NULL) x`;

router.get('/expenses', can('finance.read'), async (req, res) => {
  const where = [];
  const params = [];
  if (EXPENSE_CATEGORIES.includes(req.query.category)) where.push('x.category = ?') && params.push(req.query.category);
  if (req.query.client_id) where.push('x.client_id = ?') && params.push(Number(req.query.client_id));
  if (req.query.project_id) where.push('x.project_id = ?') && params.push(Number(req.query.project_id));
  if (req.query.from) where.push('x.date >= ?') && params.push(String(req.query.from));
  if (req.query.to) where.push('x.date <= ?') && params.push(String(req.query.to));
  res.json(
    await (paginate(req.query, {
      from: EXPENSE_FROM,
      where,
      params,
      searchColumns: ['x.supplier', 'x.concept', 'x.notes', 'x.client_name'],
      sortMap: { date: 'x.date', amount: 'x.amount_cents', supplier: 'x.supplier COLLATE NOCASE', category: 'x.category' },
      defaultSort: ['date', 'desc'],
      tiebreak: 'x.id DESC',
    })),
  );
});

router.post('/expenses', can('finance.write'), upload.single('file'), async (req, res) => {
  const directUpload = req.body?.upload ?? null;
  try {
    const { upload: _upload, ...expenseBody } = req.body ?? {};
    const data = parse(expenseSchema, expenseBody);
    const localDocumentId = req.file
      ? await storeUpload(req, req.file, { category: 'receipt', title: `Justificante · ${data.supplier} · ${data.concept}`, client_id: data.client_id, project_id: data.project_id, tags: ['gasto'] })
      : null;
    const id = await (tx(async () => {
      const documentId = directUpload
        ? await completeSupabaseUpload(req, {
            ...directUpload,
            category: 'receipt',
            title: `Justificante · ${data.supplier} · ${data.concept}`,
            client_id: data.client_id,
            project_id: data.project_id,
            tags: ['gasto'],
          }, { transaction: false })
        : localDocumentId;
      const newId = await (insert('expenses', { ...data, document_id: documentId, currency: await (getSetting('invoicing')).currency, created_by: req.user.id }));
      await (record(req, { action: 'expense.created', entityType: 'expense', entityId: newId, clientId: data.client_id, label: data.concept, summary: `Gasto registrado: ${money(data.amount_cents)} · ${data.supplier}`, after: data }));
      return newId;
    }));
    res.status(201).json(await (db.get(`SELECT * FROM ${EXPENSE_FROM} WHERE x.id = ?`, [id])));
  } catch (err) {
    if (directUpload?.storage_key && !await db.value('SELECT 1 FROM documents WHERE storage_key = ?', [directUpload.storage_key])) await removeObject(directUpload.storage_key).catch(() => {});
    if (req.file && !await (db.value('SELECT 1 FROM documents WHERE storage_key = ?', [req.file.filename]))) fs.rm(req.file.path, { force: true }, () => {});
    throw err;
  }
});

router.patch('/expenses/:id', can('finance.write'), async (req, res) => {
  const before = await (findOr404('expenses', req.params.id, { message: 'Gasto no encontrado' }));
  const data = parse(expenseSchema.partial(), req.body);
  await (tx(async () => {
    await (update('expenses', before.id, data));
    await (record(req, { action: 'expense.updated', entityType: 'expense', entityId: before.id, clientId: before.client_id, label: before.concept, summary: `Gasto actualizado: ${before.concept}`, before, after: data }));
  }));
  res.json(await (db.get(`SELECT * FROM ${EXPENSE_FROM} WHERE x.id = ?`, [before.id])));
});

router.delete('/expenses/:id', can('finance.write'), async (req, res) => {
  const e = await (findOr404('expenses', req.params.id, { message: 'Gasto no encontrado' }));
  await (tx(async () => {
    await (db.run('DELETE FROM expenses WHERE id = ?', [e.id]));
    await (record(req, { action: 'expense.deleted', entityType: 'expense', entityId: e.id, clientId: e.client_id, label: e.concept, summary: `Gasto eliminado: ${money(e.amount_cents)} · ${e.supplier}`, before: e }));
  }));
  res.json({ ok: true });
});

export default router;
