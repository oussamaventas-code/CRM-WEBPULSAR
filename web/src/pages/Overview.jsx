import { useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  Activity, ArrowRight, BadgeCheck, Banknote, Building2, CircleCheck, CreditCard, Database, FolderKanban, Globe, Hourglass, Layers, Package, Receipt, Server, Sparkles, Table2, TriangleAlert, UserPlus, Users, Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useQuickActions } from '../layout/QuickActions.jsx';
import { useApi } from '../lib/hooks.js';
import { money, int, relative } from '../lib/format.js';
import { Badge, Button, EmptyState, Glass, PageHeader, Section, Skeleton, cx } from '../components/ui.jsx';
import { KpiCard } from '../components/KpiCard.jsx';
import { FinanceSection } from '../components/FinanceSection.jsx';
import { finish, settle, skipMotion } from '../lib/motion.js';
import { Timeline } from '../components/Timeline.jsx';
import { HealthBar, HealthPill } from '../components/Health.jsx';

function greeting() {
  const h = Number(new Intl.DateTimeFormat('es-ES', { hour: 'numeric', hour12: false, timeZone: 'Europe/Madrid' }).format(new Date()));
  return h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}

function InfrastructureRow({ infra }) {
  const blocks = [
    { label: 'Servidores', icon: Server, counts: infra.servers, to: '/infraestructura?tab=servidores' },
    { label: 'Bases de datos', icon: Database, counts: infra.databases, to: '/infraestructura?tab=bases' },
    { label: 'Dominios', icon: Globe, counts: infra.domains, to: '/infraestructura?tab=dominios' },
  ];
  return (
    <Section
      title="INFRASTRUCTURE OVERVIEW"
      subtitle="Estado verificado por comprobaciones propias. Un recurso sin comprobar nunca aparece como operativo."
      icon={Layers}
      actions={
        <Link to="/infraestructura" className="btn-ghost btn-sm">
          Abrir centro de control <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      }
    >
      <div className="grid gap-4 2xl:grid-cols-[1.1fr_1fr]">
        <div className="grid gap-3 sm:grid-cols-3">
          {blocks.map((b) => (
            <Link key={b.label} to={b.to} className="lift rounded-[18px] border border-surface/80 bg-surface/55 p-4">
              <div className="flex items-center justify-between">
                <b.icon className="h-[18px] w-[18px] text-brand" strokeWidth={1.9} />
                <span className="num text-[22px] font-medium leading-none">{int(b.counts.total)}</span>
              </div>
              <p className="mb-3 mt-2 text-[12.5px] font-medium">{b.label} registrados</p>
              <HealthBar counts={b.counts} />
            </Link>
          ))}
          <div className="grid grid-cols-3 gap-3 sm:col-span-3">
            {[
              ['Dominios monitorizados', infra.monitored_domains, Globe],
              ['Servicios activos', infra.active_services, Package],
              ['Alertas abiertas', infra.open_alerts, TriangleAlert],
            ].map(([label, value, Icon]) => (
              <div key={label} className="rounded-[16px] border border-surface/80 bg-surface/45 px-3.5 py-3">
                <Icon className={cx('h-4 w-4', label === 'Alertas abiertas' && value ? 'text-danger' : 'text-ink-soft')} />
                <p className="num mt-1.5 text-[18px] font-medium">{int(value)}</p>
                <p className="text-[11.5px] leading-tight text-ink-soft">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[18px] border border-surface/80 bg-surface/45">
          <div className="flex items-center justify-between px-4 pb-2 pt-3">
            <p className="text-[12.5px] font-medium">Servidores</p>
            <span className="text-[11.5px] text-ink-soft">Última comprobación</span>
          </div>
          {infra.servers_list.length === 0 ? (
            <EmptyState compact icon={Server} title="Sin servidores registrados" description="Conecta Hostinger para importar tus VPS o añádelos manualmente." />
          ) : (
            <ul className="divide-y divide-line/60">
              {infra.servers_list.map((s) => (
                <li key={s.id}>
                  <Link to={`/infraestructura/servidores/${s.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-brand-ice/40">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{s.name}</p>
                      <p className="mono truncate text-[11.5px] text-ink-soft">{s.ipv4 ?? 'sin IP'}</p>
                    </div>
                    <HealthPill status={s.status} reason={s.status_reason} />
                    <span className="hidden w-24 text-right text-[11.5px] text-ink-faint sm:block">{s.last_check_at ? relative(s.last_check_at) : 'nunca'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}

function QuickActionsRow() {
  const { can } = useAuth();
  const quick = useQuickActions();
  const actions = [
    can('clients.write') && ['Nuevo cliente', UserPlus, 'client'],
    can('projects.write') && ['Nuevo proyecto', FolderKanban, 'project'],
    can('finance.write') && ['Registrar pago', CreditCard, 'payment'],
    can('finance.write') && ['Crear factura', Receipt, 'invoice'],
    can('infrastructure.write') && ['Añadir servidor', Server, 'server'],
    can('incidents.write') && ['Crear incidencia', TriangleAlert, 'incident'],
  ].filter(Boolean);
  if (!actions.length) return null;
  return (
    <Section title="Acciones rápidas" icon={Sparkles}>
      <div className="grid grid-cols-2 gap-2.5">
        {actions.map(([label, Icon, kind]) => (
          <button key={kind} onClick={() => quick.open(kind)} className="lift group flex flex-col items-start gap-2.5 rounded-[16px] border border-surface/80 bg-surface/60 p-3.5 text-left">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-brand-ice to-surface text-brand shadow-[0_4px_10px_-6px_rgba(37,99,235,0.5)] transition-transform duration-200 group-hover:scale-[1.04]">
              <Icon className="h-[17px] w-[17px]" strokeWidth={1.9} />
            </span>
            <span className="text-[12.5px] font-medium">{label}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

function GettingStarted({ demoLoaded }) {
  const { can } = useAuth();
  const quick = useQuickActions();
  return (
    <Glass strong className="mb-6 overflow-hidden p-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <div className="min-w-0">
          <Badge tone="brand" dot>
            Primeros pasos
          </Badge>
          <h2 className="mt-3 text-[19px] font-medium">Incorpora los datos reales de Web Pulsar</h2>
          <p className="mt-1 max-w-xl text-[13px] text-ink-soft">Todo empieza vacío para que no haya cifras inventadas. Completa los datos fiscales, crea tu primer cliente y conecta Hostinger y Cloudflare.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('settings.manage') && (
            <Link to="/configuracion?tab=empresa" className="btn-secondary">
              <Building2 className="h-4 w-4" /> Datos de la empresa
            </Link>
          )}
          {can('clients.write') && (
            <Button icon={UserPlus} onClick={() => quick.open('client')}>
              Primer cliente
            </Button>
          )}
          {can('backups.manage') && !demoLoaded && (
            <Link to="/configuracion?tab=datos" className="btn-ghost">
              Explorar con datos DEMO
            </Link>
          )}
        </div>
      </div>
    </Glass>
  );
}

export default function Overview() {
  const { user, can } = useAuth();
  const { data: d, loading } = useApi('/dashboard');
  const scope = useRef(null);

  useGSAP(
    () => {
      if (!d || skipMotion()) return undefined;
      gsap.from('[data-kpi]', { opacity: 0, y: 14, duration: 0.45, ease: 'power3.out', stagger: 0.05, clearProps: 'opacity,transform' });
      return settle(() => finish(scope.current.querySelectorAll('[data-kpi]')), 1200);
    },
    { scope, dependencies: [!!d] },
  );

  const isEmpty = d && (d.clients?.total.current ?? 0) === 0 && (d.infrastructure?.servers.total ?? 0) === 0;
  const fin = d?.finance;

  return (
    <div ref={scope}>
      <PageHeader
        eyebrow="Centro de operaciones"
        title={`${greeting()}, ${user?.name?.split(' ')[0] ?? ''}`}
        subtitle="Así está Web Pulsar ahora mismo. Todas las cifras se calculan en tiempo real desde la base de datos."
        meta={d?.demo && <Badge tone="violet" dot>Incluye datos DEMO</Badge>}
      />

      {isEmpty && <GettingStarted demoLoaded={d.demo} />}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {can('clients.read') && (
          <>
            <KpiCard icon={Users} label="Clientes totales" loading={loading && !d} value={d?.clients.total.current} delta={d?.clients.total} deltaLabel="vs. inicio de mes" description={d ? `${d.clients.new_this_month} nuevos este mes` : ''} to="/clientes" />
            <KpiCard icon={BadgeCheck} tone="ok" label="Clientes activos" loading={loading && !d} value={d?.clients.active} description={d?.clients.total.current ? `${Math.round((d.clients.active / d.clients.total.current) * 100)} % del total` : 'Sin clientes todavía'} to="/clientes?filtro=active" />
          </>
        )}
        {can('projects.read') && (
          <>
            <KpiCard icon={FolderKanban} tone="violet" label="Proyectos en desarrollo" loading={loading && !d} value={d?.projects.in_development} description={d?.projects.late ? `${d.projects.late} con la entrega vencida` : 'En desarrollo, revisión o pendientes del cliente'} to="/proyectos" alert={d?.projects.late > 0} />
            <KpiCard icon={CircleCheck} tone="deep" label="Proyectos completados" loading={loading && !d} value={d?.projects.completed} delta={d?.projects.completed_month} description={d ? `${d.projects.completed_month.current} completados este mes` : ''} to="/proyectos?estado=finished,delivered" />
          </>
        )}
        {can('finance.read') && fin && (
          <>
            <KpiCard icon={Receipt} label="Facturación del mes" value={fin.billed_month.current} format={(v) => money(v, { short: v >= 100000 })} delta={fin.billed_month} deltaLabel="vs. mismo periodo del mes anterior" description="Facturas emitidas y cargos del mes" to="/finanzas" />
            <KpiCard icon={Hourglass} tone="warn" label="Pagos pendientes" value={fin.outstanding_cents} format={(v) => money(v, { short: v >= 100000 })} description={fin.overdue_cents ? `${money(fin.overdue_cents)} vencido (${fin.overdue_count})` : 'Sin importes vencidos'} to="/finanzas?tab=cobros" alert={fin.overdue_cents > 0} />
            <KpiCard icon={Banknote} tone="ok" label="Ingresos recibidos" value={fin.received_month.current} format={(v) => money(v, { short: v >= 100000 })} delta={fin.received_month} deltaLabel="vs. mismo periodo del mes anterior" description="Cobrado este mes" to="/finanzas?tab=cobros" />
          </>
        )}
        {can('incidents.read') && (
          <KpiCard icon={TriangleAlert} tone="danger" label="Incidencias abiertas" loading={loading && !d} value={d?.incidents.open} description={d?.incidents.critical ? `${d.incidents.critical} críticas sin resolver` : `${d?.incidents.resolved_month ?? 0} resueltas este mes`} to="/incidencias" alert={d?.incidents.critical > 0} />
        )}
      </div>

      {can('finance.read') && (
        <div className="mb-6">
          <FinanceSection />
        </div>
      )}

      {can('infrastructure.read') && (
        <div className="mb-6">{d?.infrastructure ? <InfrastructureRow infra={d.infrastructure} /> : <Skeleton className="h-72 rounded-card" />}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {can('activity.read') && (
          <Section
            title="Actividad reciente"
            icon={Activity}
            className="lg:col-span-2"
            actions={
              <Link to="/actividad" className="btn-ghost btn-sm">
                Ver todo <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          >
            {d?.activity?.length === 0 ? (
              <EmptyState compact icon={Activity} title="Todavía no hay actividad" description="Aquí aparecerán altas de clientes, pagos, facturas, cambios de infraestructura e incidencias." />
            ) : (
              <Timeline items={d?.activity} loading={loading} compact />
            )}
          </Section>
        )}
        <QuickActionsRow />
      </div>
    </div>
  );
}
