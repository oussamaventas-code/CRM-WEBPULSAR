import { db, nowIso, tx } from '../db/index.js';
import { insert } from '../lib/query.js';
import { record } from '../lib/audit.js';
import { getSetting, setSetting } from '../lib/settings.js';
import { addDays, addMonths, monthStart, today } from '../lib/dates.js';
import { conflict } from '../lib/errors.js';
import { issueInvoice, saveDraftItems } from '../services/invoices.js';
import { recomputeInvoice } from '../services/finance.js';

// Datos de demostración: todos llevan is_demo = 1 y el prefijo [DEMO]. Empresas, emails (example.com),
// dominios (.example) e IPs (192.0.2.0/24, rango de documentación) son ficticios. No se generan
// métricas de infraestructura ni testimonios autorizados.

export function loadDemoData(ctx) {
  const t = today();
  const uid = ctx?.user?.id ?? null;
  const counts = {};
  const add = (table, data) => {
    counts[table] = (counts[table] ?? 0) + 1;
    return insert(table, { ...data, is_demo: 1 });
  };

  const invoiceIds = tx(() => {
    const services = {
      web: add('services', { name: '[DEMO] Web corporativa', category: 'web_dev', description: 'Diseño y desarrollo de web corporativa (ejemplo)', price_cents: 240000, modality: 'fixed', billing_period: 'one_time', internal_cost_cents: 60000 }),
      hosting: add('services', { name: '[DEMO] Hosting gestionado', category: 'hosting', description: 'Alojamiento, copias y monitorización (ejemplo)', price_cents: 3500, modality: 'recurring', billing_period: 'monthly', internal_cost_cents: 900 }),
      maint: add('services', { name: '[DEMO] Mantenimiento mensual', category: 'maintenance', description: 'Actualizaciones y soporte (ejemplo)', price_cents: 9000, modality: 'recurring', billing_period: 'monthly' }),
      crm: add('services', { name: '[DEMO] CRM a medida', category: 'crm_dev', description: 'Desarrollo de CRM (ejemplo)', price_cents: 680000, modality: 'fixed', billing_period: 'one_time' }),
    };

    const client = (name, company, extra = {}) =>
      add('clients', {
        name: `[DEMO] ${name}`,
        company: `[DEMO] ${company}`,
        email: `${company.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '')}@example.com`,
        phone: '+34 600 000 000',
        city: 'Ciudad Demo',
        country: 'España',
        tax_id: 'DEMO',
        address: 'Calle Ejemplo 1',
        source: 'Datos de demostración',
        tags: JSON.stringify(['demo']),
        onboarded_at: addMonths(t, -extra.months || -3),
        notes: 'Cliente ficticio de demostración. Puede eliminarse desde Configuración → Datos DEMO.',
        created_by: uid,
        status: extra.status ?? 'active',
      });
    const c1 = client('Lucía Ejemplo', 'Estudio Nébula', { months: 8 });
    const c2 = client('Marcos Prueba', 'Talleres Órbita', { months: 4 });
    const c3 = client('Ana Ficticia', 'Clínica Aurora', { months: 2 });
    const c4 = client('Pablo Muestra', 'Café Meridiano', { months: 1, status: 'pending' });

    const project = (clientId, name, type, status, extra = {}) =>
      add('projects', {
        client_id: clientId,
        name: `[DEMO] ${name}`,
        type,
        status,
        description: 'Proyecto ficticio de demostración.',
        owner_user_id: uid,
        start_date: extra.start ?? addDays(t, -60),
        due_date: extra.due ?? addDays(t, 30),
        budget_cents: extra.budget ?? 0,
        completed_at: ['finished', 'delivered'].includes(status) ? nowIso() : null,
        created_by: uid,
      });
    const p1 = project(c1, 'Web corporativa Nébula', 'website', 'delivered', { budget: 240000, start: addDays(t, -150), due: addDays(t, -40) });
    const p2 = project(c2, 'CRM de taller', 'crm', 'in_development', { budget: 680000 });
    const p3 = project(c3, 'Reservas online', 'webapp', 'in_review', { budget: 320000, due: addDays(t, 10) });
    project(c4, 'Tienda online', 'ecommerce', 'quote', { budget: 450000 });

    const task = (projectId, title, status, priority, due) => insert('project_tasks', { project_id: projectId, title: `[DEMO] ${title}`, status, priority, due_date: due, assignee_user_id: uid, created_by: uid, completed_at: status === 'done' ? nowIso() : null });
    task(p2, 'Modelo de datos de vehículos', 'done', 'high', addDays(t, -20));
    task(p2, 'Agenda de citas', 'in_progress', 'high', addDays(t, 5));
    task(p2, 'Integración de facturación', 'todo', 'medium', addDays(t, 20));
    task(p2, 'Formación al equipo', 'todo', 'low', addDays(t, 28));
    task(p3, 'Pasarela de pago', 'review', 'critical', addDays(t, 2));
    task(p3, 'Textos legales', 'done', 'medium', addDays(t, -3));
    for (const pid of [p2, p3]) {
      const { total, done } = db.get("SELECT COUNT(*) AS total, COUNT(CASE WHEN status = 'done' THEN 1 END) AS done FROM project_tasks WHERE project_id = ?", [pid]);
      db.run('UPDATE projects SET progress = ? WHERE id = ?', [Math.round((done / total) * 100), pid]);
    }
    db.run('UPDATE projects SET progress = 100 WHERE id = ?', [p1]);

    const cs1 = add('client_services', { client_id: c1, service_id: services.hosting, project_id: p1, price_cents: 3500, billing_period: 'monthly', start_date: addMonths(t, -5), status: 'active' });
    add('client_services', { client_id: c1, service_id: services.maint, project_id: p1, price_cents: 9000, billing_period: 'monthly', start_date: addMonths(t, -5), status: 'active' });
    add('client_services', { client_id: c2, service_id: services.crm, project_id: p2, price_cents: 680000, billing_period: 'one_time', start_date: addDays(t, -60), status: 'active' });
    add('client_services', { client_id: c3, service_id: services.hosting, project_id: p3, price_cents: 3500, billing_period: 'monthly', start_date: addDays(t, -30), status: 'active' });

    const series = add('invoice_series', { code: 'DEMO', name: '[DEMO] Serie de demostración', prefix: 'DEMO-', format: '{PREFIX}{YYYY}-{NUM}', kind: 'standard' });
    const draft = (clientId, projectId, items, date) => {
      const id = add('invoices', { series_id: series, client_id: clientId, project_id: projectId, issue_date: date, currency: 'EUR', notes: 'Factura ficticia de demostración. Sin validez fiscal.', created_by: uid });
      saveDraftItems(id, items, { globalDiscountPct: 0, withholdingPct: 0 });
      return id;
    };
    const line = (description, quantity, unit, serviceId = null) => ({ description: `[DEMO] ${description}`, quantity, unit_price_cents: unit, discount_pct: 0, tax_rate: 21, service_id: serviceId });
    const i1 = draft(c1, p1, [line('Desarrollo web corporativa', 1, 240000, services.web)], addMonths(monthStart(t), -3));
    const i2 = draft(c2, p2, [line('CRM a medida · hito 1 (40 %)', 1, 272000, services.crm)], addMonths(monthStart(t), -1));
    const i3 = draft(c1, p1, [line('Hosting gestionado', 1, 3500, services.hosting), line('Mantenimiento mensual', 1, 9000, services.maint)], monthStart(t));
    const i4 = draft(c3, p3, [line('Reservas online · anticipo', 1, 96000)], addDays(t, -2));
    draft(c4, null, [line('Tienda online · propuesta', 1, 450000)], null);

    const rec = add('recurring_payments', { client_id: c1, client_service_id: cs1, project_id: p1, concept: '[DEMO] Hosting gestionado', category: 'hosting', amount_cents: 3500, frequency: 'monthly', start_date: addMonths(t, -5), next_due_date: addDays(t, 6), reminder_days: 7, auto_generate: 1, created_by: uid });
    add('payments', { client_id: c3, project_id: p3, concept: '[DEMO] Consultoría inicial', amount_cents: 45000, amount_paid_cents: 0, issued_on: addDays(t, -40), due_date: addDays(t, -10), status: 'overdue', created_by: uid });
    add('payments', { client_id: c1, recurring_payment_id: rec, period_date: addMonths(addDays(t, 6), -1), concept: '[DEMO] Hosting gestionado', amount_cents: 3500, amount_paid_cents: 3500, issued_on: addMonths(addDays(t, 6), -1), due_date: addMonths(addDays(t, 6), -1), paid_at: addMonths(addDays(t, 6), -1), method: 'card', status: 'paid', created_by: uid });

    for (const [supplier, concept, amount, category, date] of [
      ['[DEMO] Proveedor de hosting', 'VPS mensual', 2399, 'hosting', addDays(t, -5)],
      ['[DEMO] Registrador', 'Renovación de dominios', 4598, 'domains', addDays(t, -18)],
      ['[DEMO] Software SaaS', 'Licencias de diseño', 6050, 'software', addMonths(t, -1)],
      ['[DEMO] Freelance', 'Ilustraciones', 30000, 'freelance', addMonths(t, -2)],
    ]) add('expenses', { supplier, concept, amount_cents: amount, category, date, created_by: uid });

    const server = add('servers', { name: '[DEMO] vps-demo-01', provider_id: db.value("SELECT id FROM providers WHERE key = 'other'"), source: 'manual', hostname: 'vps-demo-01.example', ipv4: '192.0.2.10', os: 'Ubuntu 24.04 LTS', region: 'Demo', cpu_cores: 2, ram_mb: 8192, disk_mb: 102400, client_id: c1, project_id: p1, status: 'unknown', status_reason: 'Servidor ficticio: sin comprobaciones ni métricas reales', created_by: uid });
    const domain = add('domains', { name: 'nebula-demo.example', client_id: c1, project_id: p1, server_id: server, registrar: '[DEMO]', expires_at: addMonths(t, 7), status: 'unknown', status_reason: 'Dominio ficticio (.example)', created_by: uid });
    const database = add('databases', { name: '[DEMO] nebula_prod', provider_id: db.value("SELECT id FROM providers WHERE key = 'other'"), engine: 'mysql', client_id: c1, project_id: p1, server_id: server, environment: 'production', status: 'unknown', status_reason: 'Base de datos ficticia', created_by: uid });
    add('applications', { name: '[DEMO] Web Nébula', kind: 'website', client_id: c1, project_id: p1, server_id: server, domain_id: domain, database_id: database, url: 'https://nebula-demo.example', runtime: 'PHP 8.3', status: 'unknown', created_by: uid });

    const inc = add('incidents', { title: '[DEMO] Error 500 en formulario de contacto', description: 'Incidencia ficticia de demostración.', category: 'application', client_id: c1, project_id: p1, server_id: server, priority: 'high', status: 'in_progress', assignee_user_id: uid, opened_at: addDays(t, -1) + 'T09:30:00.000Z', created_by: uid });
    db.run("INSERT INTO incident_events (incident_id, user_id, type, body) VALUES (?, ?, 'created', 'Incidencia ficticia de demostración.')", [inc, uid]);
    add('incidents', { title: '[DEMO] Certificado SSL caducado en entorno de pruebas', category: 'infrastructure', client_id: c3, priority: 'medium', status: 'resolved', resolution: 'Renovación del certificado (ejemplo).', opened_at: addDays(t, -12) + 'T08:00:00.000Z', resolved_at: addDays(t, -11) + 'T10:00:00.000Z', created_by: uid });

    add('testimonials', { client_id: c1, received_at: addDays(t, -20), service_id: services.web, project_id: p1, channel: 'call', internal_notes: '[DEMO] Ejemplo ficticio de nota interna. No corresponde a ningún cliente real.', status: 'pending_draft', created_by: uid });

    const deal = (title, stage, valueCents, extra = {}) =>
      add('deals', { title: `[DEMO] ${title}`, stage, value_cents: valueCents, probability: { lead: 10, contacted: 25, proposal: 50, negotiation: 75, won: 100, lost: 0 }[stage], owner_user_id: uid, source: 'Datos de demostración', created_by: uid, notes: 'Oportunidad ficticia de demostración.', ...extra });
    deal('Web para gimnasio Pulso', 'lead', 30000, { company: '[DEMO] Gimnasio Pulso', expected_close_date: addDays(t, 30) });
    deal('Automatización de reservas', 'contacted', 120000, { company: '[DEMO] Peluquería Brillo', recurring_cents: 4000, expected_close_date: addDays(t, 21) });
    deal('Tienda online Café Meridiano', 'proposal', 180000, { client_id: c4, expected_close_date: addDays(t, 14), next_action: 'Enviar propuesta revisada', next_action_date: addDays(t, 2) });
    deal('CRM a medida Talleres Órbita', 'negotiation', 680000, { client_id: c2, recurring_cents: 9000, expected_close_date: addDays(t, 10) });
    deal('Web corporativa Estudio Nébula', 'won', 240000, { client_id: c1, created_at: addDays(t, -75) + 'T10:00:00.000Z', closed_at: addDays(t, -40) + 'T10:00:00.000Z' });
    deal('Landing para academia', 'lost', 30000, { company: '[DEMO] Academia Norte', lost_reason: 'Eligieron una plantilla gratuita', created_at: addDays(t, -30) + 'T10:00:00.000Z', closed_at: addDays(t, -9) + 'T10:00:00.000Z' });

    for (const [action, summary, clientId] of [
      ['client.created', 'Nuevo cliente: [DEMO] Café Meridiano', c4],
      ['project.created', 'Proyecto creado: [DEMO] Tienda online', c4],
      ['project.status_changed', '[DEMO] Reservas online: En desarrollo → En revisión', c3],
      ['incident.created', 'Incidencia alta: [DEMO] Error 500 en formulario de contacto', c1],
    ]) record(ctx, { action, entityType: 'demo', summary, clientId, isDemo: true });

    setSetting('demo', { loaded: true, loaded_at: nowIso() }, uid);
    return { i1, i2, i3, i4 };
  });

  // Emisión y cobros DEMO (serie DEMO: no consume la numeración real ni entra en la cadena de registros)
  for (const id of Object.values(invoiceIds)) issueInvoice(ctx, id, {});
  const pay = (invoiceId, amount, paidAt, method) => {
    const inv = db.get('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
    add('payments', { client_id: inv.client_id, project_id: inv.project_id, invoice_id: inv.id, concept: `[DEMO] Cobro factura ${inv.number}`, amount_cents: amount, amount_paid_cents: amount, issued_on: paidAt, paid_at: paidAt, method, status: 'paid', created_by: ctx?.user?.id ?? null });
    recomputeInvoice(inv.id);
  };
  tx(() => {
    const total = (id) => db.value('SELECT total_cents FROM invoices WHERE id = ?', [id]);
    pay(invoiceIds.i1, total(invoiceIds.i1), addMonths(monthStart(t), -3), 'transfer');
    pay(invoiceIds.i2, Math.round(total(invoiceIds.i2) / 2), addDays(t, -12), 'transfer');
    pay(invoiceIds.i3, total(invoiceIds.i3), today(), 'card');
    db.run("UPDATE invoices SET due_date = ? WHERE id = ?", [addDays(t, -5), invoiceIds.i2]);
    recomputeInvoice(invoiceIds.i2);
  });
  record(ctx, { action: 'demo.loaded', entityType: 'demo', summary: 'Datos DEMO cargados', data: counts });
  return { ok: true, counts };
}

export function clearDemoData(ctx) {
  const demoClients = 'SELECT id FROM clients WHERE is_demo = 1';
  const real = db.get(
    `SELECT (SELECT COUNT(*) FROM projects WHERE is_demo = 0 AND client_id IN (${demoClients})) +
            (SELECT COUNT(*) FROM invoices WHERE is_demo = 0 AND client_id IN (${demoClients})) +
            (SELECT COUNT(*) FROM payments WHERE is_demo = 0 AND client_id IN (${demoClients})) +
            (SELECT COUNT(*) FROM recurring_payments WHERE is_demo = 0 AND client_id IN (${demoClients})) +
            (SELECT COUNT(*) FROM incidents WHERE is_demo = 0 AND client_id IN (${demoClients})) +
            (SELECT COUNT(*) FROM testimonials WHERE is_demo = 0 AND client_id IN (${demoClients})) +
            (SELECT COUNT(*) FROM deals WHERE is_demo = 0 AND client_id IN (${demoClients})) AS n`,
  ).n;
  if (real > 0) throw conflict(`Hay ${real} registros reales vinculados a clientes DEMO. Reasígnalos o elimínalos antes de borrar los datos de demostración.`);

  const removed = tx(() => {
    const del = (sql) => Number(db.run(sql).changes);
    const out = {};
    out.payments = del('DELETE FROM payments WHERE is_demo = 1 OR recurring_payment_id IN (SELECT id FROM recurring_payments WHERE is_demo = 1)');
    out.invoices = del('DELETE FROM invoices WHERE is_demo = 1 AND rectifies_invoice_id IS NOT NULL') + del('DELETE FROM invoices WHERE is_demo = 1');
    del('DELETE FROM invoice_series_counters WHERE series_id IN (SELECT id FROM invoice_series WHERE is_demo = 1)');
    del('DELETE FROM invoice_series WHERE is_demo = 1');
    out.recurring = del('DELETE FROM recurring_payments WHERE is_demo = 1');
    out.expenses = del('DELETE FROM expenses WHERE is_demo = 1');
    del('DELETE FROM client_services WHERE is_demo = 1');
    out.testimonials = del('DELETE FROM testimonials WHERE is_demo = 1');
    db.run('UPDATE monitoring_alerts SET incident_id = NULL WHERE incident_id IN (SELECT id FROM incidents WHERE is_demo = 1)');
    out.incidents = del('DELETE FROM incidents WHERE is_demo = 1');
    del('DELETE FROM monitoring_checks WHERE is_demo = 1');
    del('DELETE FROM documents WHERE is_demo = 1');
    out.applications = del('DELETE FROM applications WHERE is_demo = 1');
    out.databases = del('DELETE FROM databases WHERE is_demo = 1');
    out.domains = del('DELETE FROM domains WHERE is_demo = 1');
    out.servers = del('DELETE FROM servers WHERE is_demo = 1');
    out.deals = del('DELETE FROM deals WHERE is_demo = 1');
    out.projects = del('DELETE FROM projects WHERE is_demo = 1');
    out.clients = del('DELETE FROM clients WHERE is_demo = 1');
    out.services = del('DELETE FROM services WHERE is_demo = 1');
    setSetting('demo', { loaded: false, loaded_at: null }, ctx?.user?.id ?? null);
    record(ctx, { action: 'demo.cleared', entityType: 'demo', summary: 'Datos DEMO eliminados', data: out });
    return out;
  });
  return { ok: true, removed, wasLoaded: getSetting('demo').loaded };
}
