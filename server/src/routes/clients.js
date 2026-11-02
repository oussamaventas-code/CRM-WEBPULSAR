import { Router } from 'express';
import { db, nowIso, tx } from '../db/index.js';
import { can, confirmPassword } from '../middleware/auth.js';
import { findOr404, hydrate, insert, paginate, update } from '../lib/query.js';
import { f, isValidSpanishTaxId, parse, z } from '../lib/validate.js';
import { conflict, badRequest } from '../lib/errors.js';
import { record } from '../lib/audit.js';
import { today } from '../lib/dates.js';
import { sqlBilled, sqlCollected, sqlOutstanding } from '../services/finance.js';
import { config } from '../config.js';

const router = Router();

const SPAIN = /^(es|españa|espana|spain)$/i;

const clientFields = {
  name: f.text(150),
  company: f.optText(150),
  tax_id: f.optText(20),
  email: f.optEmail(),
  phone: f.optPhone(),
  address: f.optText(250),
  city: f.optText(100),
  postal_code: f.optText(15),
  province: f.optText(100),
  country: z.string().trim().min(1).max(80).default('España'),
  fiscal_name: f.optText(200),
  fiscal_address: f.optText(300),
  onboarded_at: f.optDate(),
  source: f.optText(80),
  notes: f.optText(5000),
  tags: f.tags(),
  status: f.oneOf(['active', 'inactive', 'pending']).default('active'),
};

const taxIdCheck = (data, ctx) => {
  if (data.tax_id && SPAIN.test(data.country ?? 'España') && !isValidSpanishTaxId(data.tax_id)) {
    ctx.addIssue({ code: 'custom', path: ['tax_id'], message: 'NIF/CIF/NIE no válido' });
  }
};
const createSchema = z.object(clientFields).superRefine(taxIdCheck);
const updateSchema = z.object(clientFields).partial().superRefine(taxIdCheck);

const LIST_FROM = `(
  SELECT c.*,
    (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id AND p.deleted_at IS NULL) AS projects_count,
    (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id AND p.deleted_at IS NULL AND p.status NOT IN ('finished', 'delivered', 'cancelled')) AS open_projects,
    (SELECT GROUP_CONCAT(s.name, ', ') FROM client_services cs JOIN services s ON s.id = cs.service_id WHERE cs.client_id = c.id AND cs.status = 'active') AS services_names,
    ${sqlBilled('c.id')} AS billed_cents,
    ${sqlOutstanding('c.id')} AS pending_cents
  FROM clients c WHERE c.deleted_at IS NULL
) x`;

const FILTERS = {
  active: "x.status = 'active'",
  inactive: "x.status = 'inactive'",
  pending: "x.status = 'pending'",
  archived: "x.status = 'archived'",
  debt: 'x.pending_cents > 0',
  open_projects: 'x.open_projects > 0',
};

router.get('/', can('clients.read'), async (req, res) => {
  const where = [];
  const filter = FILTERS[req.query.filter];
  if (filter) where.push(filter);
  if (req.query.filter !== 'archived') where.push("x.status <> 'archived'");
  if (req.query.tag) where.push(config.databaseUrl
    ? "EXISTS (SELECT 1 FROM jsonb_array_elements_text(x.tags::jsonb) AS tag(value) WHERE tag.value = ?)"
    : 'EXISTS (SELECT 1 FROM json_each(x.tags) WHERE value = ?)');
  const result = await (paginate(req.query, {
    from: LIST_FROM,
    where,
    params: req.query.tag ? [String(req.query.tag)] : [],
    searchColumns: ['x.name', 'x.company', 'x.email', 'x.phone', 'x.tax_id', 'x.city'],
    sortMap: {
      name: 'x.name COLLATE NOCASE',
      company: 'x.company COLLATE NOCASE',
      created_at: 'x.created_at',
      onboarded_at: 'x.onboarded_at',
      billed: 'x.billed_cents',
      pending: 'x.pending_cents',
      projects: 'x.projects_count',
      status: 'x.status',
    },
    defaultSort: ['created_at', 'desc'],
    tiebreak: 'x.id DESC',
  }));
  result.items.forEach((r) => hydrate(r));
  res.json(result);
});

router.get('/tags', can('clients.read'), async (_req, res) => {
  const sql = config.databaseUrl
    ? 'SELECT DISTINCT tag.value AS tag FROM clients c CROSS JOIN LATERAL jsonb_array_elements_text(c.tags::jsonb) AS tag(value) WHERE c.deleted_at IS NULL ORDER BY 1'
    : 'SELECT DISTINCT j.value AS tag FROM clients c, json_each(c.tags) j WHERE c.deleted_at IS NULL ORDER BY 1';
  res.json((await db.all(sql)).map((r) => r.tag));
});

async function loadClient(id) {
  return hydrate(await (findOr404('clients', id, { where: 'AND deleted_at IS NULL', message: 'Cliente no encontrado' })));
}

router.get('/:id', can('clients.read'), async (req, res) => {
  const client = await (loadClient(req.params.id));
  const id = client.id;
  const nextDue = await (db.get(
    `SELECT MIN(d) AS date FROM (
       SELECT due_date AS d FROM invoices WHERE client_id = ? AND status IN ('issued', 'partially_paid', 'overdue')
       UNION ALL SELECT due_date FROM payments WHERE client_id = ? AND invoice_id IS NULL AND status IN ('pending', 'partially_paid', 'overdue')
       UNION ALL SELECT next_due_date FROM recurring_payments WHERE client_id = ? AND status = 'active'
     ) WHERE d IS NOT NULL`,
    [id, id, id],
  ));
  const summary = await (db.get(`SELECT ${sqlBilled('?')} AS billed_cents, ${sqlCollected('?')} AS collected_cents, ${sqlOutstanding('?')} AS pending_cents`, [id, id, id, id, id]));
  res.json({
    client,
    contacts: await (db.all('SELECT * FROM client_contacts WHERE client_id = ? ORDER BY is_primary DESC, name', [id])),
    summary: {
      ...summary,
      next_due_date: nextDue?.date ?? null,
      overdue: (nextDue?.date ?? '9999') < today(),
      last_activity: await (db.get('SELECT summary, created_at FROM activity_logs WHERE client_id = ? ORDER BY id DESC LIMIT 1', [id])),
      services: await (db.all(
        `SELECT cs.id, cs.price_cents, cs.billing_period, cs.status, s.name, s.category FROM client_services cs JOIN services s ON s.id = cs.service_id
         WHERE cs.client_id = ? AND cs.status IN ('active', 'paused') ORDER BY s.name`,
        [id],
      )),
      active_projects: await (db.all(
        "SELECT id, name, type, status, progress, due_date FROM projects WHERE client_id = ? AND deleted_at IS NULL AND status NOT IN ('finished', 'delivered', 'cancelled') ORDER BY due_date",
        [id],
      )),
      counts: await (db.get(
        `SELECT (SELECT COUNT(*) FROM projects WHERE client_id = ? AND deleted_at IS NULL) AS projects,
                (SELECT COUNT(*) FROM servers WHERE client_id = ?) AS servers,
                (SELECT COUNT(*) FROM domains WHERE client_id = ?) AS domains,
                (SELECT COUNT(*) FROM documents WHERE client_id = ? AND deleted_at IS NULL) AS documents,
                (SELECT COUNT(*) FROM incidents WHERE client_id = ? AND status NOT IN ('resolved', 'closed')) AS open_incidents`,
        [id, id, id, id, id],
      )),
    },
  });
});

router.post('/', can('clients.write'), async (req, res) => {
  const data = parse(createSchema, req.body);
  const id = await (tx(async () => {
    const newId = await (insert('clients', { ...data, tags: JSON.stringify(data.tags), onboarded_at: data.onboarded_at ?? today(), created_by: req.user.id }));
    await (record(req, { action: 'client.created', entityType: 'client', entityId: newId, clientId: newId, label: data.name, summary: `Nuevo cliente: ${data.company || data.name}`, after: data }));
    return newId;
  }));
  res.status(201).json(await (loadClient(id)));
});

router.patch('/:id', can('clients.write'), async (req, res) => {
  const before = await (loadClient(req.params.id));
  if (before.status === 'archived' && req.body.status) throw badRequest('Reactiva el cliente para cambiar su estado');
  const data = parse(updateSchema, { country: before.country, ...req.body });
  await (tx(async () => {
    await (update('clients', before.id, { ...data, tags: data.tags ? JSON.stringify(data.tags) : undefined }));
    const changed = Object.keys(data).filter((k) => JSON.stringify(data[k]) !== JSON.stringify(before[k]));
    if (changed.length) {
      await (record(req, {
        action: data.status && data.status !== before.status ? 'client.status_changed' : 'client.updated',
        entityType: 'client',
        entityId: before.id,
        clientId: before.id,
        label: before.name,
        summary: data.status && data.status !== before.status ? `Cliente ${before.name}: estado cambiado` : `Cliente actualizado: ${before.name}`,
        before: Object.fromEntries(changed.map((k) => [k, before[k]])),
        after: Object.fromEntries(changed.map((k) => [k, data[k]])),
      }));
    }
  }));
  res.json(await (loadClient(before.id)));
});

router.post('/:id/archive', can('clients.write'), async (req, res) => {
  const client = await (loadClient(req.params.id));
  await (tx(async () => {
    await (db.run("UPDATE clients SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?", [nowIso(), nowIso(), client.id]));
    await (record(req, { action: 'client.archived', entityType: 'client', entityId: client.id, clientId: client.id, label: client.name, summary: `Cliente archivado: ${client.name}` }));
  }));
  res.json(await (loadClient(client.id)));
});

router.post('/:id/reactivate', can('clients.write'), async (req, res) => {
  const client = await (loadClient(req.params.id));
  await (tx(async () => {
    await (db.run("UPDATE clients SET status = 'active', archived_at = NULL, updated_at = ? WHERE id = ?", [nowIso(), client.id]));
    await (record(req, { action: 'client.reactivated', entityType: 'client', entityId: client.id, clientId: client.id, label: client.name, summary: `Cliente reactivado: ${client.name}` }));
  }));
  res.json(await (loadClient(client.id)));
});

/** Eliminación protegida: exige nombre + contraseña y nunca borra información financiera. */
router.delete('/:id', can('clients.delete'), async (req, res) => {
  const client = await (loadClient(req.params.id));
  const { confirm_name, password } = parse(z.object({ confirm_name: z.string(), password: z.string() }), req.body);
  if (confirm_name.trim() !== client.name.trim()) throw badRequest('El nombre no coincide', { confirm_name: 'Escribe el nombre exacto del cliente' });
  await confirmPassword(req, password);
  const financial = await (db.get(
    `SELECT (SELECT COUNT(*) FROM invoices WHERE client_id = ?) AS invoices, (SELECT COUNT(*) FROM payments WHERE client_id = ?) AS payments,
            (SELECT COUNT(*) FROM recurring_payments WHERE client_id = ?) AS recurring, (SELECT COUNT(*) FROM expenses WHERE client_id = ?) AS expenses`,
    [client.id, client.id, client.id, client.id],
  ));
  if (Object.values(financial).some((n) => n > 0)) {
    throw conflict('Este cliente tiene información financiera asociada y no puede eliminarse. Archívalo para conservar el historial.', { financial });
  }
  await (tx(async () => {
    await (db.run('UPDATE clients SET deleted_at = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), client.id]));
    await (record(req, { action: 'client.deleted', entityType: 'client', entityId: client.id, clientId: client.id, label: client.name, summary: `Cliente eliminado: ${client.name}`, before: client }));
  }));
  res.json({ ok: true });
});

// ── Contactos ─────────────────────────────────────────────
const contactSchema = z.object({
  name: f.text(150),
  position: f.optText(100),
  email: f.optEmail(),
  phone: f.optPhone(),
  is_primary: f.bool().default(false),
  notes: f.optText(1000),
});

router.post('/:id/contacts', can('clients.write'), async (req, res) => {
  const client = await (loadClient(req.params.id));
  const data = parse(contactSchema, req.body);
  const id = await (tx(async () => {
    if (data.is_primary) await (db.run('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [client.id]));
    const newId = await (insert('client_contacts', { ...data, client_id: client.id }));
    await (record(req, { action: 'contact.created', entityType: 'client', entityId: client.id, clientId: client.id, label: client.name, summary: `Contacto añadido a ${client.name}: ${data.name}` }));
    return newId;
  }));
  res.status(201).json(await (db.get('SELECT * FROM client_contacts WHERE id = ?', [id])));
});

router.patch('/:id/contacts/:contactId', can('clients.write'), async (req, res) => {
  const client = await (loadClient(req.params.id));
  const contact = await (findOr404('client_contacts', req.params.contactId, { where: `AND client_id = ${client.id}` }));
  const data = parse(contactSchema.partial(), req.body);
  await (tx(async () => {
    if (data.is_primary) await (db.run('UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?', [client.id]));
    await (update('client_contacts', contact.id, data));
  }));
  res.json(await (db.get('SELECT * FROM client_contacts WHERE id = ?', [contact.id])));
});

router.delete('/:id/contacts/:contactId', can('clients.write'), async (req, res) => {
  const client = await (loadClient(req.params.id));
  const contact = await (findOr404('client_contacts', req.params.contactId, { where: `AND client_id = ${client.id}` }));
  await (tx(async () => {
    await (db.run('DELETE FROM client_contacts WHERE id = ?', [contact.id]));
    await (record(req, { action: 'contact.deleted', entityType: 'client', entityId: client.id, clientId: client.id, label: client.name, summary: `Contacto eliminado de ${client.name}: ${contact.name}`, before: contact }));
  }));
  res.json({ ok: true });
});

// ── Comunicaciones y notas ───────────────────────────────
const commSchema = z.object({
  kind: f.oneOf(['note', 'call', 'email', 'meeting', 'whatsapp', 'other']),
  subject: f.optText(200),
  body: f.text(10000),
  occurred_at: z.string().datetime({ offset: true }).optional(),
});

router.get('/:id/communications', can('clients.read'), async (req, res) => {
  const client = await (loadClient(req.params.id));
  res.json(
    await (db.all(
      'SELECT cc.*, u.name AS user_name FROM client_communications cc LEFT JOIN users u ON u.id = cc.user_id WHERE cc.client_id = ? ORDER BY cc.occurred_at DESC',
      [client.id],
    )),
  );
});

router.post('/:id/communications', can('clients.write'), async (req, res) => {
  const client = await (loadClient(req.params.id));
  const data = parse(commSchema, req.body);
  const id = await (tx(async () => {
    const newId = await (insert('client_communications', { ...data, occurred_at: data.occurred_at ?? nowIso(), client_id: client.id, user_id: req.user.id }));
    await (record(req, {
      action: data.kind === 'note' ? 'client.note_added' : 'client.communication_added',
      entityType: 'client',
      entityId: client.id,
      clientId: client.id,
      label: client.name,
      summary: data.kind === 'note' ? `Nota añadida a ${client.name}` : `Comunicación registrada con ${client.name}`,
    }));
    return newId;
  }));
  res.status(201).json(await (db.get('SELECT * FROM client_communications WHERE id = ?', [id])));
});

router.delete('/:id/communications/:commId', can('clients.write'), async (req, res) => {
  const client = await (loadClient(req.params.id));
  const comm = await (findOr404('client_communications', req.params.commId, { where: `AND client_id = ${client.id}` }));
  await (tx(async () => {
    await (db.run('DELETE FROM client_communications WHERE id = ?', [comm.id]));
    await (record(req, { action: 'client.communication_deleted', entityType: 'client', entityId: client.id, clientId: client.id, label: client.name, summary: `Comunicación eliminada de ${client.name}`, before: comm }));
  }));
  res.json({ ok: true });
});

router.get('/:id/activity', can('clients.read'), async (req, res) => {
  const client = await (loadClient(req.params.id));
  res.json(
    await (db.all(
      'SELECT a.id, a.action, a.summary, a.entity_type, a.entity_id, a.created_at, u.name AS user_name FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id WHERE a.client_id = ? ORDER BY a.id DESC LIMIT 200',
      [client.id],
    )),
  );
});

export default router;
