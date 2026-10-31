import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FolderKanban, Kanban, Plus, Table2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useQuickActions } from '../../layout/QuickActions.jsx';
import { api } from '../../lib/api.js';
import { useApi, useDebounced, useLookups, usePersistentState } from '../../lib/hooks.js';
import { money } from '../../lib/format.js';
import { KANBAN_COLUMNS, PROJECT_STATUS, PROJECT_TYPE } from '../../lib/labels.js';
import { Avatar, Button, Chips, DemoTag, EmptyState, Glass, PageHeader, Progress, SearchInput, Segmented, Select, Skeleton, cx } from '../../components/ui.jsx';
import { DueDate, ProjectsTable } from '../../components/lists.jsx';

const STATUS_FILTERS = [
  { value: 'open', label: 'Abiertos' },
  { value: '', label: 'Todos' },
  { value: 'in_development,in_review,waiting_client', label: 'En curso' },
  { value: 'quote,pending_approval', label: 'Presupuestos' },
  { value: 'finished,delivered', label: 'Completados' },
  { value: 'cancelled', label: 'Cancelados' },
];

const COLUMN_TONE = { quote: 'bg-mute', pending_approval: 'bg-warn', approved: 'bg-brand-light', in_development: 'bg-brand', in_review: 'bg-violet', waiting_client: 'bg-warn', finished: 'bg-ok', delivered: 'bg-ok' };

function KanbanBoard({ filters }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, setData } = useApi('/projects', { ...filters, status: undefined, open: undefined, pageSize: 500, sort: 'due_date', dir: 'asc' });
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  const items = (data?.items ?? []).filter((p) => p.status !== 'cancelled');

  const move = async (project, status) => {
    if (project.status === status) return;
    const previous = data;
    setData((d) => ({ ...d, items: d.items.map((p) => (p.id === project.id ? { ...p, status } : p)) }));
    try {
      await api.patch(`/projects/${project.id}`, { status });
      toast.success(`${project.name}: ${PROJECT_STATUS.label(status)}`);
    } catch (err) {
      setData(previous);
      toast.error(err);
    }
  };

  if (loading && !data) return <div className="flex gap-4 overflow-hidden">{KANBAN_COLUMNS.slice(0, 4).map((c) => <Skeleton key={c} className="h-80 w-72 shrink-0 rounded-card" />)}</div>;

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex min-w-max gap-4">
        {KANBAN_COLUMNS.map((status) => {
          const cards = items.filter((p) => p.status === status);
          return (
            <div
              key={status}
              onDragOver={(e) => {
                if (!can('projects.write')) return;
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((o) => (o === status ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (dragging) move(dragging, status);
                setDragging(null);
              }}
              className={cx('glass flex w-[280px] flex-col rounded-[22px] p-2.5 transition-shadow', over === status && 'ring-2 ring-brand/40')}
            >
              <div className="flex items-center gap-2 px-2 pb-2.5 pt-1.5">
                <span className={cx('h-2 w-2 rounded-full', COLUMN_TONE[status])} />
                <p className="text-[12.5px] font-medium">{PROJECT_STATUS.label(status)}</p>
                <span className="num ml-auto rounded-full bg-surface/80 px-2 text-[11px] text-ink-soft">{cards.length}</span>
              </div>
              <div className="flex min-h-[120px] flex-col gap-2">
                {cards.map((p) => (
                  <Link
                    key={p.id}
                    to={`/proyectos/${p.id}`}
                    draggable={can('projects.write')}
                    onDragStart={() => setDragging(p)}
                    onDragEnd={() => setDragging(null)}
                    className={cx('lift block rounded-[16px] border border-surface/90 bg-surface/85 p-3.5 shadow-[0_1px_2px_rgba(23,32,51,0.05)]', dragging?.id === p.id && 'opacity-50')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-medium leading-snug">{p.name}</p>
                      {p.is_demo ? <DemoTag /> : null}
                    </div>
                    <p className="mt-0.5 truncate text-[11.5px] text-ink-soft">{p.client_company || p.client_name} · {PROJECT_TYPE.label(p.type)}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <Progress value={p.progress} tone={p.progress === 100 ? 'ok' : 'brand'} />
                      <span className="num text-[11px] text-ink-soft">{p.progress}%</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11.5px]">
                      <DueDate value={p.due_date} done={['finished', 'delivered'].includes(p.status)} />
                      <div className="flex items-center gap-2">
                        {p.budget_cents > 0 && <span className="num text-ink-soft">{money(p.budget_cents, { short: true })}</span>}
                        {p.owner_name && <Avatar name={p.owner_name} size={22} />}
                      </div>
                    </div>
                  </Link>
                ))}
                {!cards.length && <p className="rounded-[14px] border border-dashed border-line px-3 py-6 text-center text-[11.5px] text-ink-faint">{can('projects.write') ? 'Arrastra proyectos aquí' : 'Vacío'}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const { can } = useAuth();
  const quick = useQuickActions();
  const [params] = useSearchParams();
  const lk = useLookups(['clients']);
  const [view, setView] = usePersistentState('projects-view', 'table');
  const [status, setStatus] = usePersistentState('projects-status', params.get('estado') ?? 'open');
  const [type, setType] = useState('');
  const [clientId, setClientId] = useState('');
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const filters = { q: search, type, client_id: clientId, ...(status === 'open' ? { open: '1' } : { status }) };
  const { data: count } = useApi('/projects', { pageSize: 1 });

  return (
    <div>
      <PageHeader
        title="Proyectos"
        subtitle="Webs, tiendas online, CRMs, aplicaciones y automatizaciones de cada cliente"
        actions={
          <>
            <Segmented
              label="Vista"
              value={view}
              onChange={setView}
              options={[
                { value: 'table', label: <span className="inline-flex items-center gap-1.5"><Table2 className="h-3.5 w-3.5" />Tabla</span> },
                { value: 'kanban', label: <span className="inline-flex items-center gap-1.5"><Kanban className="h-3.5 w-3.5" />Kanban</span> },
              ]}
            />
            {can('projects.write') && <Button icon={Plus} onClick={() => quick.open('project')}>Nuevo proyecto</Button>}
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar proyecto o cliente…" className="lg:w-72" />
        <Select className="lg:w-56" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Todos los clientes" options={(lk.clients ?? []).map((c) => ({ value: c.id, label: c.label }))} />
        <Select className="lg:w-52" value={type} onChange={(e) => setType(e.target.value)} placeholder="Todos los tipos" options={PROJECT_TYPE.options} />
        {view === 'table' && <div className="overflow-x-auto"><Chips options={STATUS_FILTERS} value={status} onChange={(v) => setStatus(v)} /></div>}
      </div>
      {count?.total === 0 ? (
        <Glass>
          <EmptyState
            icon={FolderKanban}
            title="Aún no hay proyectos"
            description="Cada proyecto pertenece a un cliente y se conecta con sus servicios, pagos e infraestructura."
            action={can('projects.write') && <Button icon={Plus} onClick={() => quick.open('project')}>Crear el primero</Button>}
          />
        </Glass>
      ) : view === 'kanban' ? (
        <KanbanBoard filters={filters} />
      ) : (
        <Glass className="overflow-hidden">
          <ProjectsTable params={{ ...filters, pageSize: 20 }} empty={<EmptyState compact icon={FolderKanban} title="Ningún proyecto coincide con los filtros" />} />
        </Glass>
      )}
    </div>
  );
}
