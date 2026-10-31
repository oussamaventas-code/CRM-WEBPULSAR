import { Router } from 'express';
import { db, nowIso, tx } from '../db/index.js';
import { can } from '../middleware/auth.js';
import { findOr404, insert, paginate, update } from '../lib/query.js';
import { f, parse, z } from '../lib/validate.js';
import { badRequest } from '../lib/errors.js';
import { record } from '../lib/audit.js';
import { notify } from '../lib/notify.js';

const router = Router();

export const DEAL_STAGES = ['lead', 'contacted', 'proposal', 'negotiation', 'won', 'lost'];
const OPEN_STAGES = ['lead', 'contacted', 'proposal', 'negotiation'];
const CLOSED = new Set(['won', 'lost']);
const STAGE_LABEL = { lead: 'Lead', contacted: 'Contactado', proposal: 'Propuesta', negotiation: 'Negociación', won: 'Ganado', lost: 'Perdido' };
// Probabilidad por defecto al mover un trato de etapa (editable a mano en la ficha).
const STAGE_PROBABILITY = { lead: 10, contacted: 25, proposal: 50, negotiation: 75, won: 100, lost: 0 };

const dealFields = {
  title: f.text(150),
  client_id: f.optId(),
  contact_name: f.optText(150),
  company: f.optText(150),
  email: f.optEmail(),
  phone: f.optPhone(),
  source: f.optText(100),
  service_interest: f.optText(200),
  stage: f.oneOf(DEAL_STAGES).default('lead'),
  value_cents: f.cents().default(0),
  recurring_cents: f.cents().default(0),
  probability: f.int(0, 100).optional(),
  expected_close_date: f.optDate(),
  owner_user_id: f.optId(),
  lost_reason: f.optText(300),
  notes: f.optText(10000),
  next_action: f.optText(200),
  next_action_date: f.optDate(),
};

const LIST_FROM = `(
  SELECT d.*, c.name AS client_name, COALESCE(NULLIF(c.company, ''), c.name) AS client_label, u.name AS owner_name
  FROM deals d LEFT JOIN clients c ON c.id = d.client_id LEFT JOIN users u ON u.id = d.owner_user_id
  WHERE d.deleted_at IS NULL
) x`;

function loadDeal(id) {
  return findOr404('deals', id, { where: 'AND deleted_at IS NULL', message: 'Oportunidad no encontrada' });
}

function assertClient(clientId) {
  if (clientId == null) return;
  const ok = db.value('SELECT 1 FROM clients WHERE id = ? AND deleted_at IS NULL', [clientId]);
  if (!ok) throw badRequest('Cliente no válido', { client_id: 'Cliente no válido' });
}

router.get('/', can('sales.read'), (req, res) => {
  const where = [];
  const params = [];
  if (req.query.stage) {
    const stages = String(req.query.stage).split(',').filter((s) => DEAL_STAGES.includes(s));
    if (stages.length) where.push(`x.stage IN (${stages.map(() => '?').join(', ')})`) && params.push(...stages);
  }
  if (req.query.owner_user_id) where.push('x.owner_user_id = ?') && params.push(Number(req.query.owner_user_id));
  res.json(
    paginate(req.query, {
      from: LIST_FROM,
      where,
      params,
      searchColumns: ['x.title', 'x.company', 'x.contact_name', 'x.client_label', 'x.email'],
      sortMap: { title: 'x.title COLLATE NOCASE', value: 'x.value_cents', stage: 'x.stage', expected_close_date: 'x.expected_close_date', updated_at: 'x.updated_at', created_at: 'x.created_at' },
      defaultSort: ['updated_at', 'desc'],
      tiebreak: 'x.id DESC',
    }),
  );
});

/** Resumen del embudo: valor por etapa, previsión ponderada, tasa de cierre y ciclo medio. */
router.get('/summary', can('sales.read'), (_req, res) => {
  const byStage = db.all(
    `SELECT stage, COUNT(*) AS count, COALESCE(SUM(value_cents), 0) AS value_cents,
            COALESCE(SUM(value_cents * probability / 100), 0) AS weighted_cents,
            COALESCE(SUM(recurring_cents), 0) AS recurring_cents
     FROM deals WHERE deleted_at IS NULL GROUP BY stage`,
  );
  const stages = DEAL_STAGES.map((stage) => ({ stage, count: 0, value_cents: 0, weighted_cents: 0, recurring_cents: 0, ...byStage.find((r) => r.stage === stage) }));
  const open = stages.filter((s) => OPEN_STAGES.includes(s.stage));
  const won = stages.find((s) => s.stage === 'won');
  const lost = stages.find((s) => s.stage === 'lost');
  const closedCount = won.count + lost.count;
  const month = db.all(
    `SELECT substr(expected_close_date, 1, 7) AS month, COALESCE(SUM(value_cents * probability / 100), 0) AS weighted_cents, COALESCE(SUM(value_cents), 0) AS value_cents, COUNT(*) AS count
     FROM deals WHERE deleted_at IS NULL AND stage IN ('lead','contacted','proposal','negotiation') AND expected_close_date IS NOT NULL
     GROUP BY month ORDER BY month LIMIT 12`,
  );
  res.json({
    stages,
    open_count: open.reduce((a, s) => a + s.count, 0),
    open_value_cents: open.reduce((a, s) => a + s.value_cents, 0),
    forecast_cents: open.reduce((a, s) => a + s.weighted_cents, 0),
    recurring_pipeline_cents: open.reduce((a, s) => a + s.recurring_cents, 0),
    won_value_cents: won.value_cents,
    win_rate: closedCount ? Math.round((won.count / closedCount) * 100) : null,
    avg_cycle_days: db.value("SELECT ROUND(AVG(julianday(closed_at) - julianday(created_at))) FROM deals WHERE deleted_at IS NULL AND stage = 'won' AND closed_at IS NOT NULL AND closed_at >= created_at"),
    stale_count: db.value("SELECT COUNT(*) FROM deals WHERE deleted_at IS NULL AND stage IN ('lead','contacted','proposal','negotiation') AND updated_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-14 days')"),
    overdue_actions: db.value("SELECT COUNT(*) FROM deals WHERE deleted_at IS NULL AND stage IN ('lead','contacted','proposal','negotiation') AND next_action_date IS NOT NULL AND next_action_date < date('now')"),
    by_month: month,
  });
});

router.get('/:id', can('sales.read'), (req, res) => {
  loadDeal(req.params.id);
  res.json(db.get(`SELECT * FROM ${LIST_FROM} WHERE x.id = ?`, [req.params.id]));
});

router.post('/', can('sales.write'), (req, res) => {
  const data = parse(z.object(dealFields), req.body);
  assertClient(data.client_id);
  const id = tx(() => {
    const newId = insert('deals', {
      ...data,
      probability: data.probability ?? STAGE_PROBABILITY[data.stage],
      closed_at: CLOSED.has(data.stage) ? nowIso() : null,
      created_by: req.user.id,
    });
    record(req, { action: 'deal.created', entityType: 'deal', entityId: newId, clientId: data.client_id ?? null, label: data.title, summary: `Oportunidad creada: ${data.title}`, after: data });
    return newId;
  });
  res.status(201).json(db.get(`SELECT * FROM ${LIST_FROM} WHERE x.id = ?`, [id]));
});

router.patch('/:id', can('sales.write'), (req, res) => {
  const before = loadDeal(req.params.id);
  const data = parse(z.object(dealFields).partial(), req.body);
  if (data.client_id) assertClient(data.client_id);
  const stageChanged = data.stage && data.stage !== before.stage;
  const changes = { ...data };
  if (stageChanged) {
    if (data.probability === undefined) changes.probability = STAGE_PROBABILITY[data.stage];
    changes.closed_at = CLOSED.has(data.stage) ? nowIso() : null;
    if (data.stage !== 'lost') changes.lost_reason = null;
  }
  tx(() => {
    update('deals', before.id, changes);
    record(req, {
      action: stageChanged ? 'deal.stage_changed' : 'deal.updated',
      entityType: 'deal',
      entityId: before.id,
      clientId: before.client_id,
      label: before.title,
      summary: stageChanged ? `${before.title}: ${STAGE_LABEL[before.stage]} → ${STAGE_LABEL[data.stage]}` : `Oportunidad actualizada: ${before.title}`,
      before: Object.fromEntries(Object.keys(data).map((k) => [k, before[k]])),
      after: data,
    });
    if (stageChanged && data.stage === 'won') {
      notify({
        excludeUserId: req.user.id,
        type: 'deal.won',
        title: `Oportunidad ganada: ${before.title}`,
        body: `${req.user.name} ha cerrado la venta.`,
        severity: 'success',
        entityType: 'deal',
        entityId: before.id,
        link: '/ventas',
      });
    }
  });
  res.json(db.get(`SELECT * FROM ${LIST_FROM} WHERE x.id = ?`, [before.id]));
});

router.delete('/:id', can('sales.write'), (req, res) => {
  const deal = loadDeal(req.params.id);
  tx(() => {
    db.run('UPDATE deals SET deleted_at = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), deal.id]);
    record(req, { action: 'deal.deleted', entityType: 'deal', entityId: deal.id, clientId: deal.client_id, label: deal.title, summary: `Oportunidad eliminada: ${deal.title}`, before: deal });
  });
  res.json({ ok: true });
});

export default router;
