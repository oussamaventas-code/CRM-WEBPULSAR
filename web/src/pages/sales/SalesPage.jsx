import { useState } from 'react';
import { CalendarClock, Gauge, Kanban, LineChart, Plus, Target, Timer, TrendingUp, Trophy } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api, emitRefresh } from '../../lib/api.js';
import { useApi, useDebounced, useLookups, usePersistentState } from '../../lib/hooks.js';
import { date, dateShort, money, moneyCompact, pct } from '../../lib/format.js';
import { DEAL_COLUMNS, DEAL_STAGE } from '../../lib/labels.js';
import { dealFields } from '../../forms.js';
import { FormModal } from '../../components/FormModal.jsx';
import { ConfirmDialog } from '../../components/Modal.jsx';
import { KpiCard } from '../../components/KpiCard.jsx';
import { Avatar, Button, DemoTag, EmptyState, Glass, LabelBadge, PageHeader, SearchInput, Section, Segmented, Skeleton, cx } from '../../components/ui.jsx';

const COLUMN_TONE = { lead: 'bg-mute', contacted: 'bg-brand', proposal: 'bg-violet', negotiation: 'bg-warn', won: 'bg-ok', lost: 'bg-danger' };

function DealCard({ deal, dragging, canWrite, onOpen, onDragStart, onDragEnd }) {
  const overdue = deal.next_action_date && !['won', 'lost'].includes(deal.stage) && deal.next_action_date < new Date().toISOString().slice(0, 10);
  return (
    <button
      type="button"
      draggable={canWrite}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cx('lift block w-full rounded-[16px] border border-surface/90 bg-surface/85 p-3.5 text-left shadow-[0_1px_2px_rgba(23,32,51,0.05)]', dragging && 'opacity-50')}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium leading-snug">{deal.title}</p>
        {deal.is_demo ? <DemoTag /> : null}
      </div>
      <p className="mt-0.5 truncate text-[11.5px] text-ink-soft">{deal.client_label || deal.company || deal.contact_name || 'Sin contacto'}</p>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <p className="num text-[15px] font-medium">{money(deal.value_cents, { short: true })}</p>
          {deal.recurring_cents > 0 && <p className="num text-[11px] text-ink-soft">+ {money(deal.recurring_cents, { short: true })}/mes</p>}
        </div>
        <span className="num rounded-full bg-brand-ice px-2 py-0.5 text-[11px] font-medium text-brand-deep">{deal.probability}%</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-[11.5px] text-ink-soft">
        <span className={cx('inline-flex items-center gap-1 truncate', overdue && 'font-medium text-danger')}>
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{deal.next_action ? `${deal.next_action}${deal.next_action_date ? ` · ${dateShort(deal.next_action_date)}` : ''}` : deal.expected_close_date ? `Cierre ${dateShort(deal.expected_close_date)}` : 'Sin fecha'}</span>
        </span>
        {deal.owner_name && <Avatar name={deal.owner_name} size={22} />}
      </div>
    </button>
  );
}

function DealsBoard({ q, onOpen }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, setData } = useApi('/deals', { q, pageSize: 500, sort: 'updated_at', dir: 'desc' });
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  const items = data?.items ?? [];

  const move = async (deal, stage) => {
    if (deal.stage === stage) return;
    const previous = data;
    setData((d) => ({ ...d, items: d.items.map((x) => (x.id === deal.id ? { ...x, stage } : x)) }));
    try {
      await api.patch(`/deals/${deal.id}`, { stage });
      toast.success(`${deal.title}: ${DEAL_STAGE.label(stage)}`);
      emitRefresh();
    } catch (err) {
      setData(previous);
      toast.error(err);
    }
  };

  if (loading && !data) return <div className="flex gap-4 overflow-hidden">{DEAL_COLUMNS.slice(0, 4).map((c) => <Skeleton key={c} className="h-80 w-72 shrink-0 rounded-card" />)}</div>;

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex min-w-max gap-4">
        {DEAL_COLUMNS.map((stage) => {
          const cards = items.filter((d) => d.stage === stage);
          const total = cards.reduce((a, d) => a + d.value_cents, 0);
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                if (!can('sales.write')) return;
                e.preventDefault();
                setOver(stage);
              }}
              onDragLeave={() => setOver((o) => (o === stage ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (dragging) move(dragging, stage);
                setDragging(null);
              }}
              className={cx('glass flex w-[280px] flex-col rounded-[22px] p-2.5 transition-shadow', over === stage && 'ring-2 ring-brand/40')}
            >
              <div className="px-2 pb-2.5 pt-1.5">
                <div className="flex items-center gap-2">
                  <span className={cx('h-2 w-2 rounded-full', COLUMN_TONE[stage])} />
                  <p className="text-[12.5px] font-medium">{DEAL_STAGE.label(stage)}</p>
                  <span className="num ml-auto rounded-full bg-surface/80 px-2 text-[11px] text-ink-soft">{cards.length}</span>
                </div>
                <p className="num mt-1 pl-4 text-[11.5px] text-ink-soft">{money(total, { short: true })}</p>
              </div>
              <div className="flex min-h-[120px] flex-col gap-2">
                {cards.map((d) => (
                  <DealCard key={d.id} deal={d} canWrite={can('sales.write')} dragging={dragging?.id === d.id} onOpen={() => onOpen(d)} onDragStart={() => setDragging(d)} onDragEnd={() => setDragging(null)} />
                ))}
                {!cards.length && <p className="rounded-[14px] border border-dashed border-line px-3 py-6 text-center text-[11.5px] text-ink-faint">{can('sales.write') ? 'Arrastra oportunidades aquí' : 'Vacío'}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ForecastView({ summary }) {
  const open = summary.stages.filter((s) => !['won', 'lost'].includes(s.stage));
  const maxValue = Math.max(1, ...open.map((s) => s.value_cents));
  const maxMonth = Math.max(1, ...summary.by_month.map((m) => m.value_cents));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Embudo por etapa" subtitle="Valor total y previsión ponderada por probabilidad" icon={Target}>
        <ul className="space-y-4 px-5 pb-5 pt-3">
          {open.map((s) => (
            <li key={s.stage}>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="font-medium">{DEAL_STAGE.label(s.stage)} <span className="text-ink-soft">· {s.count}</span></span>
                <span className="num text-ink-soft">{money(s.value_cents, { short: true })} <span className="text-ink-faint">→</span> <span className="font-medium text-ink">{money(Math.round(s.weighted_cents), { short: true })}</span></span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-track">
                <div className="relative h-full rounded-full bg-brand/25" style={{ width: `${(s.value_cents / maxValue) * 100}%` }}>
                  <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${s.value_cents ? (s.weighted_cents / s.value_cents) * 100 : 0}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Cierres previstos por mes" subtitle="Solo oportunidades abiertas con fecha de cierre" icon={LineChart}>
        {summary.by_month.length === 0 ? (
          <EmptyState compact icon={CalendarClock} title="Sin fechas de cierre" description="Añade un cierre previsto a tus oportunidades para ver la previsión por mes." />
        ) : (
          <ul className="space-y-4 px-5 pb-5 pt-3">
            {summary.by_month.map((m) => (
              <li key={m.month}>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="font-medium capitalize">{date(`${m.month}-01`).replace(/^\d+\s/, '')} <span className="text-ink-soft">· {m.count}</span></span>
                  <span className="num font-medium">{money(Math.round(m.weighted_cents), { short: true })}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-track">
                  <div className="h-full rounded-full bg-violet" style={{ width: `${(m.value_cents / maxMonth) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

export default function SalesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const lk = useLookups(['clients', 'users']);
  const [view, setView] = usePersistentState('sales-view', 'kanban');
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const [editing, setEditing] = useState(null);
  const [remove, setRemove] = useState(false);
  const { data: summary, loading, reload } = useApi('/deals/summary');
  const isNew = editing && !editing.id;
  const empty = summary && summary.stages.every((s) => s.count === 0);

  const afterChange = () => {
    emitRefresh();
    reload();
  };

  return (
    <div>
      <PageHeader
        title="Ventas"
        subtitle="Del primer contacto al cierre: leads, propuestas y previsión de ingresos"
        actions={
          <>
            <Segmented
              label="Vista"
              value={view}
              onChange={setView}
              options={[
                { value: 'kanban', label: <span className="inline-flex items-center gap-1.5"><Kanban className="h-3.5 w-3.5" />Pipeline</span> },
                { value: 'forecast', label: <span className="inline-flex items-center gap-1.5"><LineChart className="h-3.5 w-3.5" />Previsión</span> },
              ]}
            />
            {can('sales.write') && <Button icon={Plus} onClick={() => setEditing({})}>Nueva oportunidad</Button>}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={TrendingUp} label="Pipeline abierto" loading={loading} value={summary ? summary.open_value_cents / 100 : null} format={(v) => moneyCompact(v * 100)} description={summary ? `${summary.open_count} oportunidades abiertas` : ''} tone="brand" />
        <KpiCard icon={Gauge} label="Previsión ponderada" loading={loading} value={summary ? summary.forecast_cents / 100 : null} format={(v) => moneyCompact(v * 100)} description={summary?.recurring_pipeline_cents ? `+ ${moneyCompact(summary.recurring_pipeline_cents)}/mes recurrente` : 'Valor × probabilidad'} tone="violet" />
        <KpiCard icon={Trophy} label="Tasa de cierre" loading={loading} value={summary?.win_rate ?? null} format={(v) => pct(v)} description={summary ? `${moneyCompact(summary.won_value_cents)} ganados` : ''} tone="ok" />
        <KpiCard icon={Timer} label="Ciclo medio de venta" loading={loading} value={summary?.avg_cycle_days ?? null} format={(v) => `${v} d`} description={summary ? `${summary.stale_count} estancadas · ${summary.overdue_actions} acciones vencidas` : ''} tone="warn" alert={!!summary?.overdue_actions} />
      </div>

      {empty ? (
        <Glass>
          <EmptyState
            icon={TrendingUp}
            title="Aún no hay oportunidades"
            description="Registra cada lead desde el primer contacto y muévelo por el embudo hasta cerrarlo. La previsión se calcula sola."
            action={can('sales.write') && <Button icon={Plus} onClick={() => setEditing({})}>Crear la primera</Button>}
          />
        </Glass>
      ) : view === 'forecast' ? (
        summary && <ForecastView summary={summary} />
      ) : (
        <>
          <div className="mb-4">
            <SearchInput value={q} onChange={setQ} placeholder="Buscar oportunidad…" className="lg:w-80" />
          </div>
          <DealsBoard q={search} onOpen={setEditing} />
        </>
      )}

      <FormModal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={isNew ? 'Nueva oportunidad' : 'Oportunidad'}
        subtitle={editing?.stage ? <LabelBadge set={DEAL_STAGE} value={editing.stage} /> : undefined}
        icon={TrendingUp}
        size="lg"
        fields={dealFields(lk)}
        initial={editing}
        submitLabel={isNew ? 'Crear oportunidad' : 'Guardar'}
        onSubmit={async (v) => {
          if (isNew) await api.post('/deals', v);
          else await api.patch(`/deals/${editing.id}`, v);
          toast.success(isNew ? 'Oportunidad creada' : 'Oportunidad actualizada');
          afterChange();
        }}
      >
        {() =>
          !isNew && can('sales.write') ? (
            <div className="mt-4 flex justify-end">
              <button type="button" className="text-[12.5px] font-medium text-danger hover:underline" onClick={() => setRemove(true)}>Eliminar oportunidad</button>
            </div>
          ) : null
        }
      </FormModal>
      <ConfirmDialog
        open={remove}
        onClose={() => setRemove(false)}
        title="Eliminar oportunidad"
        message={editing?.title}
        tone="danger"
        confirmLabel="Eliminar"
        onConfirm={async () => {
          await api.del(`/deals/${editing.id}`);
          toast.success('Oportunidad eliminada');
          setEditing(null);
          afterChange();
        }}
      />
    </div>
  );
}
