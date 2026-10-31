import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AppWindow, Boxes, Cloud, Cpu, Database, Globe, HardDrive, HeartPulse, LayoutDashboard, Map as MapIcon, MemoryStick, MoreHorizontal, Pencil, Plug, Plus, RefreshCw, Server, ShieldCheck, Trash2, TriangleAlert,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useQuickActions } from '../../layout/QuickActions.jsx';
import { api, emitRefresh } from '../../lib/api.js';
import { useApi, useLookups } from '../../lib/hooks.js';
import { date, int, isDemoLabel, relative } from '../../lib/format.js';
import { APP_KIND, DB_ENGINE, ENVIRONMENT, INTEGRATION_STATUS } from '../../lib/labels.js';
import { applicationFields, databaseFields, domainFields } from '../../forms.js';
import { DataTable } from '../../components/DataTable.jsx';
import { FormModal } from '../../components/FormModal.jsx';
import { ConfirmDialog } from '../../components/Modal.jsx';
import { Badge, Button, Chips, DemoTag, EmptyState, Glass, IconButton, LabelBadge, Menu, Notice, PageHeader, Section, Skeleton, Tabs, cx } from '../../components/ui.jsx';
import { HealthBar, HealthPill } from '../../components/Health.jsx';
import { DueDate } from '../../components/lists.jsx';
import { IntegrationsPanel } from './IntegrationsPanel.jsx';
import { InfraMap } from './InfraMap.jsx';
import { MonitoringPanel, checkFields } from './MonitoringPanel.jsx';

function SummaryTab({ go }) {
  const { data, loading } = useApi('/infrastructure/overview');
  const integrations = useApi('/integrations/status');
  if (loading && !data) return <Skeleton className="h-80 rounded-card" />;
  const cards = [
    ['Servidores', Server, data.servers, 'servidores'],
    ['Dominios', Globe, data.domains, 'dominios'],
    ['Bases de datos', Database, data.databases, 'bases'],
    ['Aplicaciones', AppWindow, data.applications, 'aplicaciones'],
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, Icon, counts, tab]) => (
          <button key={label} onClick={() => go(tab)} className="glass sheen lift p-5 text-left">
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-b from-brand-ice to-surface text-brand"><Icon className="h-[19px] w-[19px]" /></span>
              <span className="num text-[26px] font-medium">{int(counts.total)}</span>
            </div>
            <p className="mb-3 mt-3 text-[13px] font-medium">{label}</p>
            <HealthBar counts={counts} />
          </button>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Requiere atención" icon={TriangleAlert} className="lg:col-span-2" flush>
          {!data.attention.length && !data.open_alerts.length ? (
            <EmptyState compact icon={ShieldCheck} title="Nada requiere atención" description="Ningún recurso verificado presenta incidencias ni advertencias." />
          ) : (
            <ul className="divide-y divide-line/60 pb-2">
              {data.open_alerts.map((a) => (
                <li key={`a${a.id}`} className="flex items-center gap-3 px-5 py-3">
                  <TriangleAlert className={cx('h-4 w-4', a.severity === 'critical' ? 'text-danger' : 'text-warn')} />
                  <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{a.title}</p><p className="text-[11.5px] text-ink-soft">Alerta · {relative(a.opened_at)}</p></div>
                  <button className="btn-ghost btn-sm" onClick={() => go('monitorizacion')}>Ver</button>
                </li>
              ))}
              {data.attention.map((r) => (
                <li key={`${r.type}${r.id}`}>
                  <Link to={r.type === 'server' ? `/infraestructura/servidores/${r.id}` : r.type === 'domain' ? `/infraestructura/dominios/${r.id}` : '/infraestructura?tab=bases'} className="flex items-center gap-3 px-5 py-3 hover:bg-brand-ice/40">
                    <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{r.name}</p><p className="truncate text-[11.5px] text-ink-soft">{r.status_reason}</p></div>
                    <HealthPill status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Integraciones" icon={Plug} actions={<button className="btn-ghost btn-sm" onClick={() => go('integraciones')}>Gestionar</button>}>
          <ul className="space-y-2.5">
            {(integrations.data?.items ?? []).map((i) => (
              <li key={i.key} className="flex items-center justify-between gap-2 rounded-[14px] bg-surface/55 px-3 py-2.5">
                <span className="flex items-center gap-2 text-[13px] font-medium">{i.key === 'cloudflare' ? <Cloud className="h-4 w-4 text-brand" /> : i.key === 'hostinger' ? <Server className="h-4 w-4 text-brand" /> : <Plug className="h-4 w-4 text-brand" />}{i.name}</span>
                <LabelBadge set={INTEGRATION_STATUS} value={i.status} />
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[['Comprobaciones', data.checks.total], ['Correctas', data.checks.up], ['Fallando', data.checks.down]].map(([l, v]) => (
              <div key={l} className="rounded-[12px] bg-surface/45 py-2"><p className="num text-[16px] font-medium">{int(v)}</p><p className="text-[10.5px] text-ink-soft">{l}</p></div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function ServersTab() {
  const { can } = useAuth();
  const quick = useQuickActions();
  const toast = useToast();
  const { data, loading } = useApi('/infrastructure/servers');
  const [syncing, setSyncing] = useState(false);
  const sync = async () => {
    setSyncing(true);
    try {
      const { report } = await api.post('/integrations/hostinger/sync');
      toast.success('Hostinger sincronizado', `${report.servers.created} VPS nuevos, ${report.servers.updated} actualizados${report.warnings.length ? ` · ${report.warnings.length} avisos` : ''}`);
      emitRefresh();
    } catch (err) {
      toast.error(err);
    } finally {
      setSyncing(false);
    }
  };
  return (
    <div>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        {can('infrastructure.write') && <Button variant="secondary" icon={RefreshCw} loading={syncing} onClick={sync}>Sincronizar Hostinger</Button>}
        {can('infrastructure.write') && <Button icon={Plus} onClick={() => quick.open('server')}>Añadir servidor</Button>}
      </div>
      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-card" />)}</div>
      ) : !data?.length ? (
        <Glass><EmptyState icon={Server} title="Sin servidores" description="Conecta Hostinger en la pestaña Integraciones para importar tus VPS con sus métricas, o añádelos manualmente." action={can('infrastructure.write') && <Button icon={Plus} onClick={() => quick.open('server')}>Añadir servidor</Button>} /></Glass>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((s) => (
            <Link key={s.id} to={`/infraestructura/servidores/${s.id}`} className={cx('glass sheen lift block p-5', s.status === 'down' && 'ring-1 ring-danger/30')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-[14.5px] font-medium">{s.name}{isDemoLabel(s.name) && <DemoTag />}</p>
                  <p className="mono mt-0.5 truncate text-[12px] text-ink-soft">{s.ipv4 ?? 'sin IP'}{s.hostname ? ` · ${s.hostname}` : ''}</p>
                </div>
                <HealthPill status={s.status} reason={s.status_reason} />
              </div>
              <p className="mt-3 line-clamp-2 min-h-[34px] text-[12px] text-ink-soft">{s.status_reason}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-[11.5px]">
                <span className="flex items-center gap-1.5 text-ink-soft"><Cpu className="h-3.5 w-3.5" /><span className="mono text-ink">{s.cpu_cores ?? '—'}</span> vCPU</span>
                <span className="flex items-center gap-1.5 text-ink-soft"><MemoryStick className="h-3.5 w-3.5" /><span className="mono text-ink">{s.ram_mb ? `${Math.round(s.ram_mb / 1024)} GB` : '—'}</span></span>
                <span className="flex items-center gap-1.5 text-ink-soft"><HardDrive className="h-3.5 w-3.5" /><span className="mono text-ink">{s.disk_mb ? `${Math.round(s.disk_mb / 1024)} GB` : '—'}</span></span>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-[11.5px] text-ink-soft">
                <span className="truncate">{s.provider_name}{s.region ? ` · ${s.region}` : ''}</span>
                <span className="truncate">{s.client_name ?? 'Sin cliente'}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-ink-faint">
                <span>{s.agent_configured ? 'Agente instalado' : 'Sin agente'}{s.provider_state ? ` · Hostinger: ${s.provider_state}` : ''}</span>
                <span>{s.last_check_at ? relative(s.last_check_at) : 'sin comprobar'}</span>
              </div>
              {s.open_alerts > 0 && <Badge tone="danger" dot className="mt-3">{s.open_alerts} alertas abiertas</Badge>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CrudTab({ path, title, icon, fields, columns, empty, entity, filters, renderFilters, addLabel, extra }) {
  const { can } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useApi(path, filters);
  const [form, setForm] = useState(null);
  const [remove, setRemove] = useState(null);
  return (
    <Section
      title={title}
      icon={icon}
      flush
      actions={
        <>
          {renderFilters}
          {can('infrastructure.write') && <Button size="sm" icon={Plus} onClick={() => setForm({})}>{addLabel}</Button>}
        </>
      }
    >
      <DataTable
        rows={data}
        loading={loading}
        error={error}
        onRetry={reload}
        empty={empty}
        columns={[
          ...columns,
          can('infrastructure.write') && {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => (
              <div onClick={(e) => e.stopPropagation()}>
                <Menu
                  trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label="Acciones" onClick={toggle} className="h-8 w-8" />}
                  items={[...(extra?.(r) ?? []), { label: 'Editar', icon: Pencil, onClick: () => setForm(r) }, { label: 'Eliminar del inventario', icon: Trash2, danger: true, onClick: () => setRemove(r) }]}
                />
              </div>
            ),
          },
        ].filter(Boolean)}
      />
      <FormModal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? `Editar ${entity}` : addLabel}
        icon={icon}
        size="lg"
        fields={fields(!!form?.id)}
        initial={form}
        onSubmit={async (v) => {
          if (form.id) await api.patch(`${path}/${form.id}`, v);
          else await api.post(path, v);
          toast.success(form.id ? 'Cambios guardados' : `${entity[0].toUpperCase()}${entity.slice(1)} registrado`);
          emitRefresh();
        }}
      />
      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        title={`Eliminar ${entity}`}
        message={remove && `«${remove.name}» se eliminará del inventario de Web Pulsar. No se borra nada en el proveedor.`}
        tone="danger"
        confirmLabel="Eliminar"
        onConfirm={async () => {
          await api.del(`${path}/${remove.id}`);
          toast.success('Eliminado del inventario');
          emitRefresh();
        }}
      />
    </Section>
  );
}

function DomainsTab() {
  const navigate = useNavigate();
  const lk = useLookups(['clients', 'projects', 'servers']);
  const { can } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(false);
  const { data, loading, error, reload } = useApi('/infrastructure/domains');
  return (
    <Section title="Dominios y DNS" icon={Globe} flush actions={can('infrastructure.write') && <Button size="sm" icon={Plus} onClick={() => setForm(true)}>Añadir dominio</Button>}>
      <DataTable
        rows={data}
        loading={loading}
        error={error}
        onRetry={reload}
        onRowClick={(r) => navigate(`/infraestructura/dominios/${r.id}`)}
        empty={<EmptyState compact icon={Globe} title="Sin dominios" description="Sincroniza Cloudflare (zonas y DNS) y Hostinger (dominios y caducidad), o añádelos manualmente." />}
        columns={[
          { key: 'name', header: 'Dominio', render: (r) => <span className="mono flex items-center gap-2 font-medium">{r.name}{r.is_demo ? <DemoTag /> : null}</span> },
          { key: 'client', header: 'Cliente', hideOnMobile: true, render: (r) => r.client_name ?? <span className="text-ink-faint">—</span> },
          { key: 'registrar', header: 'Registrador', hideOnMobile: true, render: (r) => r.registrar ?? <span className="text-ink-faint">—</span> },
          { key: 'dns', header: 'DNS', hideOnMobile: true, render: (r) => (r.cloudflare_zone_id ? <Badge tone={r.zone_status === 'active' ? 'brand' : 'warn'}><Cloud className="h-3 w-3" />Cloudflare · {r.zone_status}</Badge> : <span className="text-ink-faint">—</span>) },
          { key: 'ssl', header: 'SSL', hideOnMobile: true, render: (r) => (r.ssl_mode ? <span className="mono text-[12px]">{r.ssl_mode}</span> : <span className="text-ink-faint">—</span>) },
          { key: 'records', header: 'Registros', align: 'right', hideOnMobile: true, render: (r) => <span className="num">{r.dns_count}</span> },
          { key: 'expires', header: 'Caducidad', render: (r) => <DueDate value={r.expires_at?.slice(0, 10)} /> },
          { key: 'status', header: 'Estado', render: (r) => <HealthPill status={r.status} reason={r.status_reason} /> },
        ]}
      />
      <FormModal
        open={form}
        onClose={() => setForm(false)}
        title="Añadir dominio"
        icon={Globe}
        size="lg"
        fields={domainFields(lk)}
        onSubmit={async (v) => {
          const d = await api.post('/infrastructure/domains', v);
          toast.success('Dominio añadido');
          emitRefresh();
          navigate(`/infraestructura/dominios/${d.id}`);
        }}
      />
    </Section>
  );
}

function DatabasesTab() {
  const lk = useLookups(['clients', 'projects', 'servers', 'domains', 'databases', 'applications']);
  const toast = useToast();
  const [env, setEnv] = useState('');
  const [check, setCheck] = useState(null);
  return (
    <>
      <Notice tone="brand" className="mb-4">
        Nunca se muestran contraseñas ni cadenas de conexión. Guarda las credenciales en el almacén cifrado (Documentación → Credenciales). Una base de datos solo aparece como operativa si una consulta real (D1) o un endpoint de salud que la consulte responde correctamente.
      </Notice>
      <CrudTab
        path="/infrastructure/databases"
        title="Bases de datos"
        icon={Database}
        entity="base de datos"
        addLabel="Registrar base de datos"
        filters={{ environment: env }}
        renderFilters={<Chips options={[{ value: '', label: 'Todas' }, ...ENVIRONMENT.options]} value={env} onChange={setEnv} />}
        fields={() => databaseFields(lk)}
        empty={<EmptyState compact icon={Database} title="Sin bases de datos" description="Las bases D1 se importan al sincronizar Cloudflare. Registra aquí MySQL, PostgreSQL u otras." />}
        extra={(r) => [{ label: r.engine === 'd1' ? 'Añadir consulta D1 periódica' : 'Añadir comprobación', icon: HeartPulse, onClick: () => setCheck(r) }]}
        columns={[
          { key: 'name', header: 'Nombre', render: (r) => <div><p className="mono flex items-center gap-2 font-medium">{r.name}{r.is_demo ? <DemoTag /> : null}</p><p className="text-[11.5px] text-ink-soft">{DB_ENGINE.label(r.engine)} · {r.provider_name}</p></div> },
          { key: 'env', header: 'Entorno', render: (r) => <LabelBadge set={ENVIRONMENT} value={r.environment} dot={false} /> },
          { key: 'client', header: 'Cliente / proyecto', hideOnMobile: true, render: (r) => <span className="text-[12.5px]">{[r.client_name, r.project_name].filter(Boolean).join(' · ') || '—'}</span> },
          { key: 'ext', header: 'Identificador', hideOnMobile: true, render: (r) => (r.external_id ? <span className="mono text-[11.5px] text-ink-soft">{r.external_id.slice(0, 18)}{r.external_id.length > 18 ? '…' : ''}</span> : <span className="text-ink-faint">—</span>) },
          { key: 'region', header: 'Región', hideOnMobile: true, render: (r) => r.region ?? <span className="text-ink-faint">—</span> },
          { key: 'checked', header: 'Última comprobación', hideOnMobile: true, render: (r) => <span className="text-[12px] text-ink-soft">{r.last_check_at ? relative(r.last_check_at) : r.checks.length ? 'pendiente' : 'sin comprobaciones'}</span> },
          { key: 'created', header: 'Creada', hideOnMobile: true, render: (r) => <span className="num text-[12px] text-ink-soft">{date((r.provider_created_at ?? r.created_at)?.slice(0, 10))}</span> },
          { key: 'status', header: 'Estado', render: (r) => <HealthPill status={r.status} reason={r.status_reason} /> },
        ]}
      />
      <FormModal
        open={!!check}
        onClose={() => setCheck(null)}
        title="Nueva comprobación"
        icon={HeartPulse}
        fields={checkFields(lk)}
        initial={check && { name: `${check.engine === 'd1' ? 'Consulta D1' : 'Salud'} · ${check.name}`, type: check.engine === 'd1' ? 'd1_query' : 'http', entity_type: 'database', entity_id: check.id }}
        onSubmit={async (v) => {
          for (const k of ['interval_s', 'failure_threshold', 'timeout_ms']) if (v[k] == null) delete v[k];
          await api.post('/monitoring/checks', v);
          toast.success('Comprobación creada y ejecutada');
          emitRefresh();
        }}
      />
    </>
  );
}

function ApplicationsTab() {
  const lk = useLookups(['clients', 'projects', 'servers', 'domains', 'databases']);
  const buckets = useApi('/infrastructure/buckets');
  return (
    <div className="space-y-6">
      <CrudTab
        path="/infrastructure/applications"
        title="Aplicaciones y Workers"
        icon={AppWindow}
        entity="aplicación"
        addLabel="Registrar aplicación"
        fields={() => applicationFields(lk)}
        empty={<EmptyState compact icon={AppWindow} title="Sin aplicaciones" description="Los Workers se importan desde Cloudflare. Registra webs, APIs y tareas programadas para conectarlas con su servidor, dominio y base de datos." />}
        columns={[
          { key: 'name', header: 'Aplicación', render: (r) => <div><p className="flex items-center gap-2 font-medium">{r.name}{r.is_demo ? <DemoTag /> : null}</p><p className="text-[11.5px] text-ink-soft">{APP_KIND.label(r.kind)}{r.runtime ? ` · ${r.runtime}` : ''}</p></div> },
          { key: 'url', header: 'URL', hideOnMobile: true, render: (r) => (r.url ? <a href={r.url} target="_blank" rel="noreferrer noopener" className="mono text-[12px] text-brand hover:underline" onClick={(e) => e.stopPropagation()}>{r.url.replace(/^https?:\/\//, '')}</a> : <span className="text-ink-faint">—</span>) },
          { key: 'rel', header: 'Servidor · dominio · BD', hideOnMobile: true, render: (r) => <span className="text-[12px] text-ink-soft">{[r.server_name, r.domain_name, r.database_name].filter(Boolean).join(' · ') || '—'}</span> },
          { key: 'client', header: 'Cliente', hideOnMobile: true, render: (r) => r.client_name ?? <span className="text-ink-faint">—</span> },
          { key: 'status', header: 'Estado', render: (r) => <HealthPill status={r.status} reason={r.status_reason} /> },
        ]}
      />
      <Section title="Almacenamiento R2" subtitle="Buckets importados desde Cloudflare" icon={Boxes} flush>
        <DataTable
          rows={buckets.data}
          loading={buckets.loading}
          empty={<EmptyState compact icon={Boxes} title="Sin buckets R2" description="Aparecerán al sincronizar Cloudflare si la cuenta usa R2." />}
          columns={[
            { key: 'name', header: 'Bucket', render: (r) => <span className="mono font-medium">{r.name}</span> },
            { key: 'location', header: 'Ubicación', render: (r) => r.location ?? '—' },
            { key: 'client', header: 'Cliente', render: (r) => r.client_name ?? <span className="text-ink-faint">Sin asignar</span> },
            { key: 'created', header: 'Creado', render: (r) => <span className="num text-ink-soft">{date(r.provider_created_at?.slice(0, 10))}</span> },
          ]}
        />
      </Section>
    </div>
  );
}

const TABS = [
  { key: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { key: 'servidores', label: 'Servidores', icon: Server },
  { key: 'dominios', label: 'Dominios y DNS', icon: Globe },
  { key: 'bases', label: 'Bases de datos', icon: Database },
  { key: 'aplicaciones', label: 'Aplicaciones', icon: AppWindow },
  { key: 'mapa', label: 'Mapa', icon: MapIcon },
  { key: 'monitorizacion', label: 'Monitorización', icon: HeartPulse },
  { key: 'integraciones', label: 'Integraciones', icon: Plug },
];

export default function InfrastructurePage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'resumen';
  const { data: badges } = useApi('/badges');
  const go = (t) => setParams({ tab: t }, { replace: true });
  return (
    <div>
      <PageHeader eyebrow="WEB PULSAR INFRASTRUCTURE CONTROL" title="Infraestructura" subtitle="Servidores, dominios, DNS, bases de datos y aplicaciones de todos los clientes, conectados con Hostinger y Cloudflare." />
      <Tabs tabs={TABS.map((t) => (t.key === 'monitorizacion' ? { ...t, count: badges?.alerts, alert: true } : t))} value={tab} onChange={go} className="mb-6" />
      {tab === 'resumen' && <SummaryTab go={go} />}
      {tab === 'servidores' && <ServersTab />}
      {tab === 'dominios' && <DomainsTab />}
      {tab === 'bases' && <DatabasesTab />}
      {tab === 'aplicaciones' && <ApplicationsTab />}
      {tab === 'mapa' && <InfraMap />}
      {tab === 'monitorizacion' && <MonitoringPanel />}
      {tab === 'integraciones' && <IntegrationsPanel only={['hostinger', 'cloudflare']} />}
    </div>
  );
}
