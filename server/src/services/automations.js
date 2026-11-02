import { db, nowIso, tx } from '../db/index.js';
import { getSetting } from '../lib/settings.js';
import { notify } from '../lib/notify.js';
import { record } from '../lib/audit.js';
import { addDays, daysBetween, nextOccurrence, today } from '../lib/dates.js';
import { recomputeInvoice } from './finance.js';
import { openAlert, resolveAlert } from './monitoring.js';

const SYSTEM = { system: true };
const money = (c) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(c / 100);

/** Genera los cobros de pagos recurrentes vencidos (o el siguiente, si force). Idempotente por periodo. */
export async function generateRecurring(ctx = SYSTEM, { id = null, force = false } = {}) {
  const t = today();
  const rows = id
    ? await (db.all("SELECT * FROM recurring_payments WHERE id = ? AND status = 'active'", [id]))
    : await (db.all("SELECT * FROM recurring_payments WHERE status = 'active' AND auto_generate = 1 AND next_due_date <= ? AND (end_date IS NULL OR next_due_date <= end_date)", [t]));
  let created = 0;
  for (const r of rows) {
    await (tx(async () => {
      let due = r.next_due_date;
      let guard = 0;
      while ((force ? guard === 0 : due <= t) && (!r.end_date || due <= r.end_date) && guard < 24) {
        const res = await (db.run(
          `INSERT OR IGNORE INTO payments (client_id, project_id, recurring_payment_id, period_date, concept, amount_cents, currency, issued_on, due_date, status, is_demo, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
          [r.client_id, r.project_id, r.id, due, r.concept, r.amount_cents, r.currency, t, due, r.is_demo, ctx?.user?.id ?? null],
        ));
        if (res.changes) {
          created += 1;
          const client = await (db.get('SELECT name, company FROM clients WHERE id = ?', [r.client_id]));
          await (record(ctx, {
            action: 'recurring.generated',
            entityType: 'payment',
            entityId: Number(res.lastInsertRowid),
            clientId: r.client_id,
            label: r.concept,
            summary: `Cobro recurrente generado: ${r.concept} · ${money(r.amount_cents)} · ${client?.company || client?.name}`,
            isDemo: !!r.is_demo,
          }));
        }
        due = nextOccurrence(due, r.frequency);
        guard += 1;
      }
      await (db.run('UPDATE recurring_payments SET next_due_date = ?, last_generated_at = ?, updated_at = ? WHERE id = ?', [due, nowIso(), nowIso(), r.id]));
    }));
  }
  return created;
}

async function markOverdue(ctx, automations) {
  const t = today();
  const invoices = await (db.all("SELECT i.id, i.number, i.client_id, i.total_cents - i.paid_cents AS pending, c.name, c.company FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.status IN ('issued', 'partially_paid') AND i.due_date < ?", [t]));
  for (const inv of invoices) {
    await (recomputeInvoice(inv.id));
    if (!automations.invoice_overdue) continue;
    const created = await (notify({
      type: 'invoice.overdue',
      title: `Factura vencida: ${inv.number}`,
      body: `${inv.company || inv.name} · pendiente ${money(inv.pending)}`,
      severity: 'warning',
      entityType: 'invoice',
      entityId: inv.id,
      link: `/finanzas/facturas/${inv.id}`,
      dedupeKey: `invoice-overdue:${inv.id}`,
    }));
    if (created) await (record(ctx, { action: 'invoice.overdue', entityType: 'invoice', entityId: inv.id, clientId: inv.client_id, label: inv.number, summary: `Factura vencida: ${inv.number} · ${money(inv.pending)}` }));
  }
  const payments = await (db.all("SELECT p.*, c.name, c.company FROM payments p JOIN clients c ON c.id = p.client_id WHERE p.status IN ('pending', 'partially_paid') AND p.due_date < ?", [t]));
  for (const p of payments) {
    await (db.run("UPDATE payments SET status = 'overdue', updated_at = ? WHERE id = ?", [nowIso(), p.id]));
    if (!automations.payment_due_reminder) continue;
    await (notify({
      type: 'payment.overdue',
      title: `${p.recurring_payment_id ? 'Mensualidad vencida' : 'Cobro vencido'}: ${p.concept}`,
      body: `${p.company || p.name} · ${money(p.amount_cents - p.amount_paid_cents)}`,
      severity: 'warning',
      entityType: 'payment',
      entityId: p.id,
      link: p.recurring_payment_id ? '/finanzas?tab=mensualidades' : '/finanzas?tab=entrada',
      dedupeKey: `payment-overdue:${p.id}`,
    }));
  }
}

async function upcomingReminders(automations) {
  if (!automations.payment_due_reminder) return;
  const t = today();
  const soon = addDays(t, 3);
  for (const inv of await (db.all("SELECT i.id, i.number, i.due_date, i.total_cents - i.paid_cents AS pending, c.name, c.company FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.status IN ('issued', 'partially_paid') AND i.due_date BETWEEN ? AND ?", [t, soon]))) {
    await (notify({ type: 'invoice.due_soon', title: `Factura ${inv.number} vence en ${daysBetween(t, inv.due_date)} días`, body: `${inv.company || inv.name} · ${money(inv.pending)}`, entityType: 'invoice', entityId: inv.id, link: `/finanzas/facturas/${inv.id}`, dedupeKey: `invoice-due:${inv.id}:${inv.due_date}` }));
  }
  for (const p of await (db.all("SELECT p.*, c.name, c.company FROM payments p JOIN clients c ON c.id = p.client_id WHERE p.invoice_id IS NULL AND p.status IN ('pending', 'partially_paid') AND p.due_date BETWEEN ? AND ?", [t, soon]))) {
    await (notify({ type: 'payment.due_soon', title: `Cobro próximo: ${p.concept}`, body: `${p.company || p.name} · vence el ${p.due_date.split('-').reverse().join('/')}`, entityType: 'payment', entityId: p.id, link: p.recurring_payment_id ? '/finanzas?tab=mensualidades' : '/finanzas?tab=entrada', dedupeKey: `payment-due:${p.id}:${p.due_date}` }));
  }
  for (const r of await (db.all("SELECT r.*, c.name, c.company FROM recurring_payments r JOIN clients c ON c.id = r.client_id WHERE r.status = 'active' AND r.next_due_date > ?", [t]))) {
    if (daysBetween(t, r.next_due_date) > r.reminder_days) continue;
    await (notify({ type: 'recurring.due_soon', title: `${r.frequency === 'monthly' ? 'Cuota mensual' : 'Cobro recurrente'} próximo: ${r.concept}`, body: `${r.company || r.name} · ${money(r.amount_cents)} el ${r.next_due_date.split('-').reverse().join('/')}`, entityType: 'recurring', entityId: r.id, link: '/finanzas?tab=mensualidades', dedupeKey: `recurring-due:${r.id}:${r.next_due_date}` }));
  }
}

async function domainExpiry(ctx, automations) {
  if (!automations.domain_expiry) return;
  const { domain_expiry_days: days } = await (getSetting('monitoring'));
  const t = today();
  for (const d of await (db.all('SELECT * FROM domains WHERE expires_at IS NOT NULL AND is_demo = 0'))) {
    const left = daysBetween(t, d.expires_at.slice(0, 10));
    const key = `domain-expiry:${d.id}`;
    if (left <= days) {
      await (openAlert(ctx, {
        type: 'domain_expiry',
        severity: left <= 7 ? 'critical' : 'warning',
        entityType: 'domain',
        entityId: d.id,
        title: left < 0 ? `Dominio caducado: ${d.name}` : `Dominio próximo a caducar: ${d.name}`,
        message: left < 0 ? `Caducó hace ${-left} días` : `Caduca en ${left} días (${d.expires_at.slice(0, 10).split('-').reverse().join('/')})`,
        dedupeKey: key,
      }));
    } else {
      await (resolveAlert(ctx, key, `Dominio renovado: ${d.name}`));
    }
  }
}

async function taskReminders(automations) {
  if (!automations.task_reminders) return;
  const tomorrow = addDays(today(), 1);
  for (const task of await (db.all(
    "SELECT t.*, p.name AS project_name FROM project_tasks t JOIN projects p ON p.id = t.project_id WHERE t.status <> 'done' AND t.assignee_user_id IS NOT NULL AND t.due_date <= ? AND p.deleted_at IS NULL",
    [tomorrow],
  ))) {
    const overdue = task.due_date < today();
    await (notify({
      userIds: [task.assignee_user_id],
      type: 'task.reminder',
      title: overdue ? `Tarea vencida: ${task.title}` : `Tarea para ${task.due_date === tomorrow ? 'mañana' : 'hoy'}: ${task.title}`,
      body: task.project_name,
      severity: overdue ? 'warning' : 'info',
      entityType: 'project',
      entityId: task.project_id,
      link: `/proyectos/${task.project_id}`,
      dedupeKey: `task-due:${task.id}:${task.due_date}:${overdue ? 'late' : 'soon'}`,
    }));
  }
}

export async function runAutomations(ctx = SYSTEM) {
  const automations = await (getSetting('automations'));
  await (markOverdue(ctx, automations));
  if (automations.recurring_generation) await (generateRecurring(ctx));
  await (upcomingReminders(automations));
  await (domainExpiry(ctx, automations));
  await (taskReminders(automations));
}
