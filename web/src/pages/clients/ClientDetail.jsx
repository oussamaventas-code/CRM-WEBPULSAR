import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Activity, Archive, ArchiveRestore, Building2, CalendarClock, CreditCard, Database, FileText, FolderKanban, Globe, LayoutDashboard, Mail, MapPin, MessageSquare, MoreHorizontal, Package, Pencil, Phone, Plus,
  Receipt, Repeat, Server, StickyNote, Trash2, UserPlus, Wallet, AppWindow,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useQuickActions } from '../../layout/QuickActions.jsx';
import { api, emitRefresh } from '../../lib/api.js';
import { useApi, useLookups } from '../../lib/hooks.js';
import { date, dateTime, isDemoLabel, money, relative } from '../../lib/format.js';
import { BILLING_PERIOD, CLIENT_STATUS, COMM_KIND, CS_STATUS, DB_ENGINE, ENVIRONMENT, PROJECT_STATUS, SERVICE_CATEGORY } from '../../lib/labels.js';
import { clientFields } from '../../forms.js';
import { FormModal } from '../../components/FormModal.jsx';
import { ConfirmDialog } from '../../components/Modal.jsx';
import { Avatar, Badge, Button, DemoTag, EmptyState, ErrorState, Field, Glass, IconButton, Input, LabelBadge, Menu, PageHeader, Progress, Section, Select, Skeleton, Stat, Tabs, Textarea, cx } from '../../components/ui.jsx';
import { DocumentsPanel, DueDate, InvoicesTable, PaymentsTable, ProjectsTable, RecurringTable, SecretsPanel, recurringFields } from '../../components/lists.jsx';
import { Timeline } from '../../components/Timeline.jsx';
import { HealthPill } from '../../components/Health.jsx';
import { DataTable } from '../../components/DataTable.jsx';

const TABS = [
  { key: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { key: 'proyectos', label: 'Proyectos', icon: FolderKanban },
  { key: 'servicios', label: 'Servicios', icon: Package },
  { key: 'infraestructura', label: 'Infraestructura', icon: Server },
  { key: 'finanzas', label: 'Finanzas', icon: Wallet },
  { key: 'documentos', label: 'Documentos', icon: FileText },
  { key: 'comunicaciones', label: 'Comunicaciones', icon: MessageSquare },
  { key: 'actividad', label: 'Actividad', icon: Activity },
];

function SummaryTab({ data, onAddContact }) {
  const { client, summary, contacts } = data;
  const { can } = useAuth();
  const toast = useToast();
  const [removeContact, setRemoveContact] = useState(null);
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        {can('finance.read') && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Total facturado', money(summary.billed_cents), Receipt, ''],
              ['Total cobrado', money(summary.collected_cents), CreditCard, ''],
              ['Deuda pendiente', money(summary.pending_cents), Wallet, summary.pending_cents > 0 ? 'text-warn-ink' : ''],
              ['Próximo vencimiento', summary.next_due_date ? date(summary.next_due_date) : 'Ninguno', CalendarClock, summary.overdue ? 'text-danger' : ''],
            ].map(([label, value, Icon, cls]) => (
              <Glass key={label} className="p-4">
                <Icon className="h-4 w-4 text-brand" />
                <p className={cx('num mt-2 text-[18px] font-medium', cls)}>{value}</p>
                <p className="text-[12px] text-ink-soft">{label}</p>
              </Glass>
            ))}
          </div>
        )}
        <Section title="Proyectos activos" icon={FolderKanban} flush>
          {summary.active_projects.length === 0 ? (
            <EmptyState compact icon={FolderKanban} title="Sin proyectos activos" />
          ) : (
            <ul className="divide-y divide-line/60 pb-2">
              {summary.active_projects.map((p) => (
                <li key={p.id}>
                  <Link to={`/proyectos/${p.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-brand-ice/40">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{p.name}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Progress value={p.progress} className="max-w-[160px]" />
                        <span className="num text-[11.5px] text-ink-soft">{p.progress}%</span>
                      </div>
                    </div>
                    <LabelBadge set={PROJECT_STATUS} value={p.status} />
                    <span className="hidden w-28 text-right text-[12px] sm:block">
                      <DueDate value={p.due_date} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Servicios contratados" icon={Package} flush>
          {summary.services.length === 0 ? (
            <EmptyState compact icon={Package} title="Sin servicios contratados" />
          ) : (
            <ul className="divide-y divide-line/60 pb-2">
              {summary.services.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{s.name}</p>
                    <p className="text-[12px] text-ink-soft">{SERVICE_CATEGORY.label(s.category)}</p>
                  </div>
                  <span className="num text-[13px]">
                    {money(s.price_cents)}
                    <span className="text-ink-soft"> · {BILLING_PERIOD.label(s.billing_period).toLowerCase()}</span>
                  </span>
                  <LabelBadge set={CS_STATUS} value={s.status} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <div className="space-y-6">
        <Section title="Datos de contacto" icon={Building2}>
          <dl className="space-y-3">
            <Stat label="Email">{client.email ? <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1.5 text-brand hover:underline"><Mail className="h-3.5 w-3.5" />{client.email}</a> : null}</Stat>
            <Stat label="Teléfono">{client.phone ? <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1.5 hover:text-brand"><Phone className="h-3.5 w-3.5" />{client.phone}</a> : null}</Stat>
            <Stat label="Dirección">{[client.address, [client.postal_code, client.city].filter(Boolean).join(' '), client.province, client.country].filter(Boolean).length ? <span className="inline-flex gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{[client.address, [client.postal_code, client.city].filter(Boolean).join(' '), client.province, client.country].filter(Boolean).join(', ')}</span> : null}</Stat>
            <Stat label="CIF / NIF" value={client.tax_id} mono />
            {(client.fiscal_name || client.fiscal_address) && <Stat label="Datos fiscales" value={[client.fiscal_name, client.fiscal_address].filter(Boolean).join(' · ')} />}
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Alta" value={date(client.onboarded_at)} />
              <Stat label="Captación" value={client.source} />
            </div>
            <Stat label="Última actividad">{summary.last_activity ? <span>{summary.last_activity.summary} <span className="text-ink-soft">· {relative(summary.last_activity.created_at)}</span></span> : null}</Stat>
          </dl>
        </Section>
        <Section
          title="Personas de contacto"
          icon={UserPlus}
          flush
          actions={can('clients.write') && <IconButton icon={Plus} label="Añadir contacto" onClick={onAddContact} className="h-8 w-8" />}
        >
          {contacts.length === 0 ? (
            <p className="px-5 pb-5 text-[12.5px] text-ink-soft">Sin contactos adicionales.</p>
          ) : (
            <ul className="divide-y divide-line/60 pb-2">
              {contacts.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                  <Avatar name={c.name} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-[13px] font-medium">
                      {c.name} {c.is_primary ? <Badge tone="brand">Principal</Badge> : null}
                    </p>
                    <p className="truncate text-[11.5px] text-ink-soft">{[c.position, c.email, c.phone].filter(Boolean).join(' · ')}</p>
                  </div>
                  {can('clients.write') && <IconButton icon={Trash2} label="Eliminar contacto" className="h-8 w-8" onClick={() => setRemoveContact(c)} />}
                </li>
              ))}
            </ul>
          )}
        </Section>
        {client.notes && (
          <Section title="Notas internas" icon={StickyNote}>
            <p className="whitespace-pre-line text-[13px] text-ink-soft">{client.notes}</p>
          </Section>
        )}
      </div>
      <ConfirmDialog
        open={!!removeContact}
        onClose={() => setRemoveContact(null)}
        title="Eliminar contacto"
        message={removeContact?.name}
        tone="danger"
        confirmLabel="Eliminar"
        onConfirm={async () => {
          await api.del(`/clients/${client.id}/contacts/${removeContact.id}`);
          toast.success('Contacto eliminado');
          emitRefresh();
        }}
      />
    </div>
  );
}

function ServicesTab({ clientId }) {
  const { can } = useAuth();
  const toast = useToast();
  const lk = useLookups(['services', 'projects']);
  const { data, loading, error, reload } = useApi('/client-services', { client_id: clientId });
  const [assign, setAssign] = useState(false);
  const [edit, setEdit] = useState(null);
  const projects = (lk.projects ?? []).filter((p) => p.client_id === clientId).map((p) => ({ value: p.id, label: p.label }));
  return (
    <Section
      title="Servicios contratados"
      icon={Package}
      flush
      actions={can('services.write') && <Button size="sm" icon={Plus} onClick={() => setAssign(true)}>Asignar servicio</Button>}
    >
      <DataTable
        rows={data}
        loading={loading}
        error={error}
        onRetry={reload}
        empty={<EmptyState compact icon={Package} title="Sin servicios asignados" description="Asigna servicios del catálogo: hosting, mantenimiento, desarrollo…" />}
        columns={[
          { key: 'name', header: 'Servicio', render: (r) => <div><p className="font-medium">{r.service_name}</p><p className="text-[11.5px] text-ink-soft">{SERVICE_CATEGORY.label(r.category)}</p></div> },
          { key: 'project', header: 'Proyecto', hideOnMobile: true, render: (r) => r.project_name ?? <span className="text-ink-faint">—</span> },
          { key: 'price', header: 'Precio', align: 'right', render: (r) => <span className="num">{money(r.price_cents)}</span> },
          { key: 'period', header: 'Periodicidad', render: (r) => BILLING_PERIOD.label(r.billing_period) },
          { key: 'start', header: 'Desde', hideOnMobile: true, render: (r) => <span className="num text-ink-soft">{date(r.start_date)}</span> },
          { key: 'status', header: 'Estado', render: (r) => <LabelBadge set={CS_STATUS} value={r.status} /> },
          can('services.write') && { key: 'a', header: '', align: 'right', render: (r) => <IconButton icon={Pencil} label="Editar" className="h-8 w-8" onClick={() => setEdit(r)} /> },
        ].filter(Boolean)}
      />
      <FormModal
        open={assign}
        onClose={() => setAssign(false)}
        title="Asignar servicio"
        icon={Package}
        fields={[
          { name: 'service_id', label: 'Servicio', type: 'select', numeric: true, required: true, span: 2, options: (lk.services ?? []).map((s) => ({ value: s.id, label: `${s.label} · ${money(s.price_cents)} ${BILLING_PERIOD.label(s.billing_period).toLowerCase()}` })) },
          { name: 'project_id', label: 'Proyecto', type: 'select', numeric: true, options: projects },
          { name: 'price_cents', label: 'Precio acordado', type: 'money', hint: 'Vacío = precio de catálogo' },
          { name: 'start_date', label: 'Inicio', type: 'date' },
          { name: 'end_date', label: 'Fin', type: 'date' },
          { name: 'create_recurring', label: 'Cobro recurrente', type: 'switch', switchLabel: 'Crear cobro recurrente automático', description: 'Solo para servicios mensuales, trimestrales o anuales', span: 2, show: (v) => ['monthly', 'quarterly', 'yearly'].includes(lk.services?.find((s) => String(s.id) === String(v.service_id))?.billing_period) },
          { name: 'notes', label: 'Notas', type: 'textarea', span: 2 },
        ]}
        onSubmit={async (v) => {
          await api.post('/client-services', { ...v, client_id: clientId });
          toast.success('Servicio asignado');
          emitRefresh();
        }}
        submitLabel="Asignar"
      />
      <FormModal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={`Editar ${edit?.service_name ?? ''}`}
        icon={Package}
        fields={[
          { name: 'price_cents', label: 'Precio', type: 'money', required: true },
          { name: 'billing_period', label: 'Periodicidad', type: 'select', options: BILLING_PERIOD.options, required: true },
          { name: 'start_date', label: 'Inicio', type: 'date' },
          { name: 'end_date', label: 'Fin', type: 'date' },
          { name: 'status', label: 'Estado', type: 'select', options: CS_STATUS.options, required: true, hint: 'Pausar o cancelar también detiene sus cobros recurrentes' },
          { name: 'project_id', label: 'Proyecto', type: 'select', numeric: true, options: projects },
          { name: 'notes', label: 'Notas', type: 'textarea', span: 2 },
        ]}
        initial={edit}
        onSubmit={async (v) => {
          await api.patch(`/client-services/${edit.id}`, v);
          toast.success('Servicio actualizado');
          emitRefresh();
        }}
      />
    </Section>
  );
}

function InfraTab({ clientId }) {
  const { can } = useAuth();
  const quick = useQuickActions();
  const params = { client_id: clientId };
  const servers = useApi('/infrastructure/servers', params);
  const domains = useApi('/infrastructure/domains', params);
  const dbs = useApi('/infrastructure/databases', params);
  const apps = useApi('/infrastructure/applications', params);
  const block = (title, Icon, res, render, link) => (
    <Section title={title} icon={Icon} flush actions={<Link to={link} className="btn-ghost btn-sm">Ver todo</Link>}>
      {res.loading && !res.data ? (
        <div className="space-y-2 px-5 pb-5"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
      ) : !res.data?.length ? (
        <p className="px-5 pb-5 text-[12.5px] text-ink-soft">Ninguno asociado a este cliente.</p>
      ) : (
        <ul className="divide-y divide-line/60 pb-2">{res.data.map(render)}</ul>
      )}
    </Section>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {block('Servidores', Server, servers, (s) => (
        <li key={s.id}>
          <Link to={`/infraestructura/servidores/${s.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-brand-ice/40">
            <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{s.name}</p><p className="mono text-[11.5px] text-ink-soft">{s.ipv4 ?? '—'} · {s.provider_name}</p></div>
            <HealthPill status={s.status} reason={s.status_reason} />
          </Link>
        </li>
      ), '/infraestructura?tab=servidores')}
      {block('Dominios', Globe, domains, (d) => (
        <li key={d.id}>
          <Link to={`/infraestructura/dominios/${d.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-brand-ice/40">
            <div className="min-w-0 flex-1"><p className="mono truncate text-[13px] font-medium">{d.name}</p><p className="text-[11.5px] text-ink-soft">Caduca: <DueDate value={d.expires_at?.slice(0, 10)} /></p></div>
            <HealthPill status={d.status} reason={d.status_reason} />
          </Link>
        </li>
      ), '/infraestructura?tab=dominios')}
      {block('Bases de datos', Database, dbs, (b) => (
        <li key={b.id} className="flex items-center gap-3 px-5 py-2.5">
          <div className="min-w-0 flex-1"><p className="mono truncate text-[13px] font-medium">{b.name}</p><p className="text-[11.5px] text-ink-soft">{DB_ENGINE.label(b.engine)}</p></div>
          <LabelBadge set={ENVIRONMENT} value={b.environment} dot={false} />
          <HealthPill status={b.status} reason={b.status_reason} />
        </li>
      ), '/infraestructura?tab=bases')}
      {block('Aplicaciones', AppWindow, apps, (a) => (
        <li key={a.id} className="flex items-center gap-3 px-5 py-2.5">
          <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{a.name}</p><p className="mono truncate text-[11.5px] text-ink-soft">{a.url ?? a.server_name ?? '—'}</p></div>
          <HealthPill status={a.status} reason={a.status_reason} />
        </li>
      ), '/infraestructura?tab=aplicaciones')}
      {can('infrastructure.write') && (
        <div className="lg:col-span-2">
          <Button variant="secondary" icon={Server} onClick={() => quick.open('server', { client_id: clientId })}>
            Añadir servidor a este cliente
          </Button>
        </div>
      )}
    </div>
  );
}

function FinanceTab({ clientId }) {
  const { can } = useAuth();
  const quick = useQuickActions();
  const toast = useToast();
  const lk = useLookups(['clients', 'projects']);
  const [recurring, setRecurring] = useState(false);
  return (
    <div className="space-y-6">
      <Section
        title="Facturas"
        icon={Receipt}
        flush
        actions={can('finance.write') && <Button size="sm" icon={Plus} onClick={() => quick.open('invoice', { client_id: clientId })}>Crear factura</Button>}
      >
        <InvoicesTable params={{ client_id: clientId }} pageSize={10} />
      </Section>
      <Section
        title="Pagos de entrada"
        subtitle="Anticipos, pagos de proyecto y cobros de facturas"
        icon={CreditCard}
        flush
        actions={can('finance.write') && <Button size="sm" variant="secondary" icon={Plus} onClick={() => quick.open('payment', { client_id: clientId, mode: 'standalone' })}>Registrar pago de entrada</Button>}
      >
        <PaymentsTable params={{ client_id: clientId, kind: 'entry', pageSize: 10 }} empty={<EmptyState compact icon={CreditCard} title="Sin pagos de entrada" />} />
      </Section>
      <Section
        title="Mensualidades"
        subtitle="Cuota mensual del cliente y estado de cada mes"
        icon={Repeat}
        flush
        actions={can('finance.write') && <Button size="sm" variant="secondary" icon={Plus} onClick={() => setRecurring(true)}>Nueva cuota mensual</Button>}
      >
        <RecurringTable params={{ client_id: clientId }} />
        <div className="mt-2 border-t border-surface/60 pt-2">
          <p className="px-5 pb-1 pt-2 text-[12px] font-medium uppercase tracking-[0.04em] text-ink-soft">Cobros de cada mes</p>
          <PaymentsTable params={{ client_id: clientId, kind: 'monthly', pageSize: 12 }} empty={<EmptyState compact icon={Repeat} title="Sin mensualidades generadas todavía" />} />
        </div>
      </Section>
      <FormModal
        open={recurring}
        onClose={() => setRecurring(false)}
        title="Nueva cuota mensual"
        subtitle="Lo que el cliente paga cada mes: mantenimiento, hosting, suscripción…"
        icon={Repeat}
        fields={recurringFields(lk, { creating: true })}
        initial={{ client_id: clientId }}
        onSubmit={async (v) => {
          await api.post('/recurring', v);
          toast.success('Cuota mensual creada', v.first_paid_at ? 'Primera cuota registrada como cobrada' : undefined);
          emitRefresh();
        }}
      />
    </div>
  );
}

function CommunicationsTab({ clientId }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading } = useApi(`/clients/${clientId}/communications`);
  const [kind, setKind] = useState('note');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.post(`/clients/${clientId}/communications`, { kind, subject: subject || null, body });
      setSubject('');
      setBody('');
      toast.success(kind === 'note' ? 'Nota añadida' : 'Comunicación registrada');
      emitRefresh();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {can('clients.write') && (
        <Section title="Registrar" icon={MessageSquare}>
          <form onSubmit={submit} className="space-y-3">
            <Field label="Tipo">
              <Select value={kind} onChange={(e) => setKind(e.target.value)} options={COMM_KIND.options} />
            </Field>
            <Field label="Asunto">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <Field label="Detalle *">
              <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Qué se habló, acuerdos, próximos pasos…" />
            </Field>
            <Button type="submit" loading={busy} disabled={!body.trim()} className="w-full">
              Guardar
            </Button>
          </form>
        </Section>
      )}
      <Section title="Historial de comunicaciones" icon={MessageSquare} className={!can('clients.write') ? 'lg:col-span-2' : ''}>
        {loading && !data ? (
          <Skeleton className="h-24" />
        ) : !data?.length ? (
          <EmptyState compact icon={MessageSquare} title="Sin comunicaciones registradas" description="Llamadas, reuniones, emails y notas internas quedarán en este historial." />
        ) : (
          <ul className="space-y-3">
            {data.map((c) => (
              <li key={c.id} className="rounded-[16px] border border-surface/80 bg-surface/55 p-4">
                <div className="flex items-center gap-2">
                  <Badge tone={c.kind === 'note' ? 'violet' : 'brand'}>{COMM_KIND.label(c.kind)}</Badge>
                  {c.subject && <p className="truncate text-[13px] font-medium">{c.subject}</p>}
                  <span className="ml-auto whitespace-nowrap text-[11.5px] text-ink-soft">{dateTime(c.occurred_at)}</span>
                </div>
                <p className="mt-2 whitespace-pre-line text-[13px] text-ink">{c.body}</p>
                <p className="mt-2 text-[11.5px] text-ink-faint">{c.user_name ?? 'Sistema'}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function ActivityTab({ clientId }) {
  const { data, loading } = useApi(`/clients/${clientId}/activity`);
  return (
    <Section title="Historial del cliente" icon={Activity}>
      {data?.length === 0 ? <EmptyState compact icon={Activity} title="Sin actividad registrada" /> : <Timeline items={data} loading={loading} />}
    </Section>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const clientId = Number(id);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'resumen';
  const { can } = useAuth();
  const toast = useToast();
  const quick = useQuickActions();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(`/clients/${id}`);
  const [edit, setEdit] = useState(false);
  const [contact, setContact] = useState(false);
  const [remove, setRemove] = useState(false);
  const [archive, setArchive] = useState(false);

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <div className="space-y-4"><Skeleton className="h-16 w-80" /><Skeleton className="h-10 w-full max-w-3xl" /><Skeleton className="h-72 rounded-card" /></div>;

  const { client } = data;
  const archived = client.status === 'archived';
  const title = client.company || client.name;

  return (
    <div>
      <PageHeader
        back={{ to: '/clientes', label: 'Clientes' }}
        title={
          <span className="flex items-center gap-4">
            <Avatar name={title} size={52} className="hidden sm:inline-flex" />
            <span className="min-w-0 truncate">{title}</span>
          </span>
        }
        subtitle={[client.company ? client.name : null, client.email, client.city].filter(Boolean).join(' · ')}
        meta={
          <>
            <LabelBadge set={CLIENT_STATUS} value={client.status} />
            {isDemoLabel(client.name) && <DemoTag />}
            {client.tags.map((t) => <Badge key={t}>{t}</Badge>)}
          </>
        }
        actions={
          <>
            {can('clients.write') && !archived && <Button variant="secondary" icon={Pencil} onClick={() => setEdit(true)}>Editar</Button>}
            {can('finance.write') && !archived && <Button icon={Receipt} onClick={() => quick.open('invoice', { client_id: clientId })}>Crear factura</Button>}
            <Menu
              trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label="Más acciones" onClick={toggle} className="border border-line bg-surface/70" />}
              items={[
                can('projects.write') && !archived && { label: 'Nuevo proyecto', icon: FolderKanban, onClick: () => quick.open('project', { client_id: clientId }) },
                can('finance.write') && { label: 'Registrar pago', icon: CreditCard, onClick: () => quick.open('payment', { client_id: clientId }) },
                can('clients.write') && { label: 'Añadir nota', icon: StickyNote, onClick: () => setParams({ tab: 'comunicaciones' }) },
                can('clients.write') && { divider: true },
                can('clients.write') && (archived ? { label: 'Reactivar cliente', icon: ArchiveRestore, onClick: () => setArchive(true) } : { label: 'Archivar cliente', icon: Archive, onClick: () => setArchive(true) }),
                can('clients.delete') && { label: 'Eliminar cliente', icon: Trash2, danger: true, onClick: () => setRemove(true) },
              ]}
            />
          </>
        }
      />
      <Tabs tabs={TABS} value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} className="mb-6" />
      {tab === 'resumen' && <SummaryTab data={data} onAddContact={() => setContact(true)} />}
      {tab === 'proyectos' && (
        <Section title="Proyectos" icon={FolderKanban} flush actions={can('projects.write') && <Button size="sm" icon={Plus} onClick={() => quick.open('project', { client_id: clientId })}>Nuevo proyecto</Button>}>
          <ProjectsTable params={{ client_id: clientId }} />
        </Section>
      )}
      {tab === 'servicios' && <ServicesTab clientId={clientId} />}
      {tab === 'infraestructura' && <InfraTab clientId={clientId} />}
      {tab === 'finanzas' && <FinanceTab clientId={clientId} />}
      {tab === 'documentos' && (
        <div className="space-y-6">
          <Section title="Repositorio documental" icon={FileText} flush>
            <DocumentsPanel clientId={clientId} />
          </Section>
          {can('secrets.use') && (
            <Section title="Credenciales del cliente" subtitle="Almacén cifrado: los valores nunca se muestran" icon={Server} flush>
              <SecretsPanel params={{ client_id: clientId }} />
            </Section>
          )}
        </div>
      )}
      {tab === 'comunicaciones' && <CommunicationsTab clientId={clientId} />}
      {tab === 'actividad' && <ActivityTab clientId={clientId} />}

      <FormModal
        open={edit}
        onClose={() => setEdit(false)}
        title="Editar cliente"
        icon={Pencil}
        size="lg"
        fields={clientFields()}
        initial={client}
        onSubmit={async (v) => {
          await api.patch(`/clients/${clientId}`, v);
          toast.success('Cliente actualizado');
          emitRefresh();
        }}
      />
      <FormModal
        open={contact}
        onClose={() => setContact(false)}
        title="Añadir persona de contacto"
        icon={UserPlus}
        fields={[
          { name: 'name', label: 'Nombre', required: true },
          { name: 'position', label: 'Cargo' },
          { name: 'email', label: 'Email', type: 'email' },
          { name: 'phone', label: 'Teléfono', type: 'tel' },
          { name: 'is_primary', label: 'Principal', type: 'switch', switchLabel: 'Contacto principal', span: 2 },
          { name: 'notes', label: 'Notas', type: 'textarea', span: 2 },
        ]}
        onSubmit={async (v) => {
          await api.post(`/clients/${clientId}/contacts`, v);
          toast.success('Contacto añadido');
          emitRefresh();
        }}
      />
      <ConfirmDialog
        open={archive}
        onClose={() => setArchive(false)}
        title={archived ? 'Reactivar cliente' : 'Archivar cliente'}
        message={archived ? 'El cliente volverá a aparecer en los listados activos.' : 'El cliente se ocultará de los listados habituales. Se conserva todo su historial, proyectos y finanzas.'}
        confirmLabel={archived ? 'Reactivar' : 'Archivar'}
        onConfirm={async () => {
          await api.post(`/clients/${clientId}/${archived ? 'reactivate' : 'archive'}`);
          toast.success(archived ? 'Cliente reactivado' : 'Cliente archivado');
          emitRefresh();
        }}
      />
      <ConfirmDialog
        open={remove}
        onClose={() => setRemove(false)}
        title="Eliminar cliente"
        message={
          <>
            Esta acción oculta definitivamente el expediente. <strong className="text-ink">No se puede eliminar un cliente con facturas, cobros, gastos o pagos recurrentes</strong>: en ese caso, archívalo.
          </>
        }
        requireText={client.name}
        requirePassword
        tone="danger"
        confirmLabel="Eliminar definitivamente"
        onConfirm={async ({ password, text }) => {
          await api.del(`/clients/${clientId}`, { confirm_name: text, password });
          toast.success('Cliente eliminado');
          emitRefresh();
          navigate('/clientes');
        }}
      />
    </div>
  );
}
