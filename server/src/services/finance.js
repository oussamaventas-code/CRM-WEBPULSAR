import { db, nowIso } from '../db/index.js';
import { invoiceStatus, paymentStatus } from '../lib/money.js';
import { addDays, addMonths, monthStart, today, MONTHLY_FACTOR } from '../lib/dates.js';

// Definiciones únicas de los importes agregados, reutilizadas en clientes, proyectos y dashboard.
// Facturado = facturas emitidas + cobros sin factura. Pendiente = lo que falta por cobrar de ambos.

const OPEN_INVOICE = "('issued', 'partially_paid', 'overdue')";
const OPEN_PAYMENT = "('pending', 'partially_paid', 'overdue')";
const LIVE_PAYMENT = "('cancelled', 'refunded')";

export const sqlBilled = (col, by = 'client_id') => `(
  (SELECT COALESCE(SUM(i.total_cents), 0) FROM invoices i WHERE i.${by} = ${col} AND i.status NOT IN ('draft', 'cancelled'))
  + (SELECT COALESCE(SUM(p.amount_cents), 0) FROM payments p WHERE p.${by} = ${col} AND p.invoice_id IS NULL AND p.status NOT IN ${LIVE_PAYMENT}))`;

export const sqlCollected = (col, by = 'client_id') =>
  `(SELECT COALESCE(SUM(p.amount_paid_cents), 0) FROM payments p WHERE p.${by} = ${col} AND p.status NOT IN ${LIVE_PAYMENT})`;

export const sqlOutstanding = (col, by = 'client_id') => `(
  (SELECT COALESCE(SUM(i.total_cents - i.paid_cents), 0) FROM invoices i WHERE i.${by} = ${col} AND i.status IN ${OPEN_INVOICE})
  + (SELECT COALESCE(SUM(p.amount_cents - p.amount_paid_cents), 0) FROM payments p WHERE p.${by} = ${col} AND p.invoice_id IS NULL AND p.status IN ${OPEN_PAYMENT}))`;

/** Recalcula lo cobrado y el estado de una factura a partir de sus cobros. */
export async function recomputeInvoice(invoiceId) {
  const inv = await (db.get('SELECT * FROM invoices WHERE id = ?', [invoiceId]));
  if (!inv || inv.status === 'draft') return inv;
  const paid = await (db.value(`SELECT COALESCE(SUM(amount_paid_cents), 0) FROM payments WHERE invoice_id = ? AND status NOT IN ${LIVE_PAYMENT}`, [invoiceId]));
  const status = invoiceStatus({ ...inv, paid_cents: paid }, today());
  if (paid !== inv.paid_cents || status !== inv.status) {
    await (db.run('UPDATE invoices SET paid_cents = ?, status = ?, updated_at = ? WHERE id = ?', [paid, status, nowIso(), invoiceId]));
  }
  return { ...inv, paid_cents: paid, status };
}

export async function refreshPaymentStatus(payment) {
  const status = paymentStatus(payment, today());
  if (status !== payment.status) await (db.run('UPDATE payments SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), payment.id]));
  return status;
}

export async function financeTotals({ includeDemo = true } = {}) {
  const demo = includeDemo ? '' : 'AND is_demo = 0';
  const yearStart = `${today().slice(0, 4)}-01-01`;
  const invoices = await (db.get(
    `SELECT
       COALESCE(SUM(CASE WHEN status NOT IN ('draft', 'cancelled') THEN total_cents END), 0) AS billed,
       COALESCE(SUM(CASE WHEN status IN ${OPEN_INVOICE} THEN total_cents - paid_cents END), 0) AS outstanding,
       COALESCE(SUM(CASE WHEN status = 'overdue' THEN total_cents - paid_cents END), 0) AS overdue,
       COUNT(CASE WHEN status = 'overdue' THEN 1 END) AS overdue_count,
       COUNT(CASE WHEN status = 'draft' THEN 1 END) AS drafts
     FROM invoices WHERE 1 = 1 ${demo}`,
  ));
  const payments = await (db.get(
    `SELECT
       COALESCE(SUM(CASE WHEN status NOT IN ${LIVE_PAYMENT} THEN amount_paid_cents END), 0) AS collected,
       COALESCE(SUM(CASE WHEN invoice_id IS NULL AND status NOT IN ${LIVE_PAYMENT} THEN amount_cents END), 0) AS billed_standalone,
       COALESCE(SUM(CASE WHEN invoice_id IS NULL AND status IN ${OPEN_PAYMENT} THEN amount_cents - amount_paid_cents END), 0) AS outstanding,
       COALESCE(SUM(CASE WHEN invoice_id IS NULL AND status = 'overdue' THEN amount_cents - amount_paid_cents END), 0) AS overdue,
       COUNT(CASE WHEN invoice_id IS NULL AND status = 'overdue' THEN 1 END) AS overdue_count
     FROM payments WHERE 1 = 1 ${demo}`,
  ));
  const expensesYear = await (db.value(`SELECT COALESCE(SUM(amount_cents), 0) FROM expenses WHERE date >= ? ${demo}`, [yearStart]));
  const collectedYear = await (db.value(`SELECT COALESCE(SUM(amount_paid_cents), 0) FROM payments WHERE paid_at >= ? AND status NOT IN ${LIVE_PAYMENT} ${demo}`, [yearStart]));
  const recurring = await (db.all(`SELECT amount_cents, frequency FROM recurring_payments WHERE status = 'active' ${demo}`));
  const mrr = Math.round(recurring.reduce((s, r) => s + r.amount_cents * (MONTHLY_FACTOR[r.frequency] ?? 0), 0));

  return {
    billed_cents: invoices.billed + payments.billed_standalone,
    collected_cents: payments.collected,
    outstanding_cents: invoices.outstanding + payments.outstanding,
    overdue_cents: invoices.overdue + payments.overdue,
    overdue_count: invoices.overdue_count + payments.overdue_count,
    draft_invoices: invoices.drafts,
    expenses_year_cents: expensesYear,
    collected_year_cents: collectedYear,
    profit_year_cents: collectedYear - expensesYear,
    mrr_cents: mrr,
    recurring_active: recurring.length,
  };
}

const RANGES = {
  '7d': { days: 7, bucket: 'day' },
  '30d': { days: 30, bucket: 'day' },
  '90d': { days: 91, bucket: 'week' },
  '12m': { months: 12, bucket: 'month' },
};

function buildBuckets(range) {
  const cfg = RANGES[range] ?? RANGES['30d'];
  const end = today();
  const buckets = [];
  if (cfg.bucket === 'month') {
    let start = addMonths(monthStart(end), -(cfg.months - 1));
    for (let i = 0; i < cfg.months; i++) {
      const next = addMonths(start, 1);
      buckets.push({ start, end: addDays(next, -1) });
      start = next;
    }
  } else {
    const step = cfg.bucket === 'week' ? 7 : 1;
    let start = addDays(end, -(cfg.days - 1));
    while (start <= end) {
      const last = addDays(start, step - 1);
      buckets.push({ start, end: last > end ? end : last });
      start = addDays(start, step);
    }
  }
  return { buckets, from: buckets[0].start, to: end, bucket: cfg.bucket };
}

/** Serie temporal de cobrado, pendiente, facturado, gastos y beneficio. */
export async function financeSeries(range = '30d') {
  const { buckets, from, to, bucket } = buildBuckets(range);
  const series = buckets.map((b) => ({ ...b, collected: 0, pending: 0, billed: 0, expenses: 0, profit: 0 }));
  const find = (date) => (date ? series.find((b) => date >= b.start && date <= b.end) : null);

  for (const p of await (db.all(`SELECT paid_at, amount_paid_cents FROM payments WHERE paid_at BETWEEN ? AND ? AND status NOT IN ${LIVE_PAYMENT}`, [from, to]))) {
    const b = find(p.paid_at);
    if (b) b.collected += p.amount_paid_cents;
  }
  for (const i of await (db.all("SELECT issue_date, total_cents, paid_cents, status FROM invoices WHERE issue_date BETWEEN ? AND ? AND status NOT IN ('draft', 'cancelled')", [from, to]))) {
    const b = find(i.issue_date);
    if (!b) continue;
    b.billed += i.total_cents;
    if (OPEN_INVOICE.includes(`'${i.status}'`)) b.pending += i.total_cents - i.paid_cents;
  }
  for (const p of await (db.all(
    `SELECT COALESCE(due_date, issued_on) AS d, amount_cents, amount_paid_cents, status FROM payments
     WHERE invoice_id IS NULL AND COALESCE(due_date, issued_on) BETWEEN ? AND ? AND status NOT IN ${LIVE_PAYMENT}`,
    [from, to],
  ))) {
    const b = find(p.d);
    if (!b) continue;
    b.billed += p.amount_cents;
    if (OPEN_PAYMENT.includes(`'${p.status}'`)) b.pending += p.amount_cents - p.amount_paid_cents;
  }
  for (const e of await (db.all('SELECT date, amount_cents FROM expenses WHERE date BETWEEN ? AND ?', [from, to]))) {
    const b = find(e.date);
    if (b) b.expenses += e.amount_cents;
  }
  for (const b of series) b.profit = b.collected - b.expenses;

  const totals = series.reduce(
    (t, b) => ({ collected: t.collected + b.collected, pending: t.pending + b.pending, billed: t.billed + b.billed, expenses: t.expenses + b.expenses, profit: t.profit + b.profit }),
    { collected: 0, pending: 0, billed: 0, expenses: 0, profit: 0 },
  );
  return { range, bucket, from, to, series, totals };
}
