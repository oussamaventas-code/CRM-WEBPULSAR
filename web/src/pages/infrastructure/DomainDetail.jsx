import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Cloud, Globe, HeartPulse, MoreHorizontal, Pencil, Plus, RefreshCw, Shield, Trash2, TriangleAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api, emitRefresh } from '../../lib/api.js';
import { useApi, useLookups } from '../../lib/hooks.js';
import { daysUntil, dateTime, isDemoLabel, relative } from '../../lib/format.js';
import { ALERT_SEVERITY, ALERT_STATUS, CHECK_STATUS, CHECK_TYPE } from '../../lib/labels.js';
import { domainFields } from '../../forms.js';
import { DataTable } from '../../components/DataTable.jsx';
import { FormModal } from '../../components/FormModal.jsx';
import { ConfirmDialog } from '../../components/Modal.jsx';
import { Badge, Button, DemoTag, EmptyState, ErrorState, IconButton, LabelBadge, Menu, Notice, PageHeader, Section, Skeleton, Stat } from '../../components/ui.jsx';
import { HealthPill } from '../../components/Health.jsx';
import { UptimeBars } from '../../components/charts.jsx';
import { DueDate } from '../../components/lists.jsx';

const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'].map((t) => ({ value: t, label: t }));
const dnsFields = [
  { name: 'type', label: 'Tipo', type: 'select', options: DNS_TYPES, required: true, default: 'A' },
  { name: 'name', label: 'Nombre', required: true, mono: true, placeholder: '@, www, api…' },
  { name: 'content', label: 'Contenido', required: true, mono: true, span: 2, placeholder: 'IP, destino o texto' },
  { name: 'ttl', label: 'TTL (segundos, 1 = automático)', type: 'number', default: 1 },
  { name: 'priority', label: 'Prioridad', type: 'number', show: (v) => v.type === 'MX' || v.type === 'SRV' },
  { name: 'proxied', label: 'Proxy', type: 'switch', switchLabel: 'Pasar por el proxy de Cloudflare', description: 'Oculta la IP de origen y activa CDN/WAF', show: (v) => ['A', 'AAAA', 'CNAME'].includes(v.type), span: 2 },
  { name: 'comment', label: 'Comentario', span: 2 },
];

export default function DomainDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const lk = useLookups(['clients', 'projects', 'servers']);
  const { data, error, reload, setData } = useApi(`/infrastructure/domains/${id}`);
  const [edit, setEdit] = useState(false);
  const [remove, setRemove] = useState(false);
  const [dnsForm, setDnsForm] = useState(null);
  const [dnsRemove, setDnsRemove] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <div className="space-y-4"><Skeleton className="h-16 w-80" /><Skeleton className="h-48 rounded-card" /></div>;
  const { domain: d } = data;
  const left = daysUntil(d.expires_at?.slice(0, 10));
  const manageDns = can('infrastructure.write') && data.cloudflare_ready;

  const refreshDns = async () => {
    setRefreshing(true);
    try {
      const dns = await api.post(`/infrastructure/domains/${id}/dns/refresh`);
      setData((x) => ({ ...x, dns }));
      toast.success('Registros DNS actualizados desde Cloudflare');
    } catch (err) {
      toast.error(err);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div>
      <PageHeader
        back={{ to: '/infraestructura?tab=dominios', label: 'Dominios' }}
        eyebrow="Ficha de dominio"
        title={<span className="mono">{d.name}</span>}
        subtitle={[d.client_name, d.project_name].filter(Boolean).join(' · ') || 'Sin cliente asignado'}
        meta={
          <>
            <HealthPill status={d.status} reason={d.status_reason} />
            {d.cloudflare_zone_id && <Badge tone="brand"><Cloud className="h-3 w-3" />Cloudflare · {d.zone_status}</Badge>}
            {left != null && left <= 30 && <Badge tone={left <= 7 ? 'danger' : 'warn'} dot>{left < 0 ? 'Caducado' : `Caduca en ${left} días`}</Badge>}
            {isDemoLabel(d.registrar) && <DemoTag />}
          </>
        }
        actions={
          can('infrastructure.write') && (
            <>
              <Button variant="secondary" icon={Pencil} onClick={() => setEdit(true)}>Editar</Button>
              <Menu trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label="Más" onClick={toggle} className="border border-line bg-surface/70" />} items={[{ label: 'Eliminar del inventario', icon: Trash2, danger: true, onClick: () => setRemove(true) }]} />
            </>
          )
        }
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Section title="Registro y propiedad" icon={Globe}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Stat label="Registrador" value={d.registrar} />
            <Stat label="Caducidad"><DueDate value={d.expires_at?.slice(0, 10)} /></Stat>
            <Stat label="Renovación automática" value={d.auto_renew == null ? null : d.auto_renew ? 'Sí' : 'No'} />
            <Stat label="Última sincronización" value={d.last_synced_at ? relative(d.last_synced_at) : null} />
            <Stat label="Cliente">{d.client_id ? <Link to={`/clientes/${d.client_id}`} className="text-brand hover:underline">{d.client_name}</Link> : null}</Stat>
            <Stat label="Proyecto">{d.project_id ? <Link to={`/proyectos/${d.project_id}`} className="text-brand hover:underline">{d.project_name}</Link> : null}</Stat>
            <Stat label="Servidor" className="col-span-2">{d.server_id ? <Link to={`/infraestructura/servidores/${d.server_id}`} className="text-brand hover:underline">{d.server_name}</Link> : null}</Stat>
          </dl>
        </Section>
        <Section title="DNS y SSL" icon={Shield}>
          <dl className="space-y-3">
            <Stat label="Proveedor DNS" value={d.dns_provider === 'cloudflare' ? 'Cloudflare' : d.dns_provider ?? 'Desconocido'} />
            <Stat label="Nameservers">{d.nameservers?.length ? <ul className="mono space-y-0.5 text-[12px]">{d.nameservers.map((n) => <li key={n}>{n}</li>)}</ul> : null}</Stat>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Modo SSL (Cloudflare)" value={d.ssl_mode} mono />
              <Stat label="Certificado caduca" value={d.ssl_expires_at ? dateTime(d.ssl_expires_at) : null} />
            </div>
          </dl>
        </Section>
        <Section title="Monitorización" icon={HeartPulse} flush>
          {!data.checks.length ? (
            <div className="px-5 pb-5">
              <p className="text-[12.5px] text-ink-soft">Sin comprobaciones. El estado no se puede verificar.</p>
              {can('infrastructure.write') && (
                <Button
                  size="sm"
                  className="mt-3"
                  icon={HeartPulse}
                  onClick={async () => {
                    await api.patch(`/infrastructure/domains/${id}`, { monitor: true });
                    toast.success('Comprobaciones creadas: HTTPS, SSL y caducidad');
                    emitRefresh();
                  }}
                >
                  Activar monitorización
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-line/60 pb-2">
              {data.checks.map((c) => (
                <li key={c.id} className="px-5 py-2.5">
                  <div className="flex items-center gap-2">
                    <LabelBadge set={CHECK_STATUS} value={c.last_status} />
                    <span className="truncate text-[13px] font-medium">{CHECK_TYPE.label(c.type)}</span>
                    <span className="num ml-auto text-[11.5px] text-ink-soft">{c.uptime_7d.pct == null ? '—' : `${c.uptime_7d.pct} % (7 d)`}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[11.5px] text-ink-soft">{c.last_message ?? 'pendiente'}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section
        title="Registros DNS"
        subtitle={d.cloudflare_zone_id ? 'Gestionados mediante la API de Cloudflare' : 'Solo lectura'}
        icon={Cloud}
        flush
        actions={
          data.cloudflare_ready && (
            <>
              <Button size="sm" variant="secondary" icon={RefreshCw} loading={refreshing} onClick={refreshDns}>Actualizar</Button>
              {manageDns && <Button size="sm" icon={Plus} onClick={() => setDnsForm({})}>Añadir registro</Button>}
            </>
          )
        }
      >
        {!d.cloudflare_zone_id && (
          <Notice tone="warn" className="mx-5 mb-4" title="Limitación">
            Los DNS de este dominio no están en una zona de Cloudflare conectada, así que no pueden gestionarse desde Web Pulsar. Acción manual: modifícalos en el panel de tu proveedor DNS{d.registrar ? ` (${d.registrar})` : ''}, o añade la zona a Cloudflare y sincroniza.
          </Notice>
        )}
        <DataTable
          rows={data.dns}
          empty={<EmptyState compact icon={Cloud} title="Sin registros DNS sincronizados" />}
          columns={[
            { key: 'type', header: 'Tipo', render: (r) => <Badge tone="brand" className="mono">{r.type}</Badge> },
            { key: 'name', header: 'Nombre', render: (r) => <span className="mono text-[12.5px]">{r.name}</span> },
            { key: 'content', header: 'Contenido', render: (r) => <span className="mono block max-w-[340px] truncate text-[12px] text-ink-soft" title={r.content}>{r.content}</span> },
            { key: 'ttl', header: 'TTL', hideOnMobile: true, render: (r) => <span className="mono text-[12px]">{r.ttl === 1 ? 'Auto' : r.ttl}</span> },
            { key: 'proxied', header: 'Proxy', hideOnMobile: true, render: (r) => (r.proxied == null ? <span className="text-ink-faint">—</span> : r.proxied ? <Badge tone="warn"><Cloud className="h-3 w-3" />Proxy</Badge> : <Badge>Solo DNS</Badge>) },
            { key: 'priority', header: 'Prio.', hideOnMobile: true, render: (r) => <span className="mono text-[12px]">{r.priority ?? '—'}</span> },
            manageDns && {
              key: 'actions',
              header: '',
              align: 'right',
              render: (r) => (
                <Menu
                  trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label="Acciones" onClick={toggle} className="h-8 w-8" />}
                  items={[{ label: 'Editar', icon: Pencil, onClick: () => setDnsForm({ ...r, proxied: !!r.proxied }) }, { label: 'Eliminar', icon: Trash2, danger: true, onClick: () => setDnsRemove(r) }]}
                />
              ),
            },
          ].filter(Boolean)}
        />
      </Section>

      {data.alerts.length > 0 && (
        <Section title="Alertas del dominio" icon={TriangleAlert} className="mt-6" flush>
          <ul className="divide-y divide-line/60 pb-2">
            {data.alerts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-2.5">
                <LabelBadge set={ALERT_SEVERITY} value={a.severity} dot={false} />
                <span className="flex-1 truncate text-[13px]">{a.title}</span>
                <LabelBadge set={ALERT_STATUS} value={a.status} />
                <span className="text-[11.5px] text-ink-soft">{relative(a.opened_at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <FormModal
        open={edit}
        onClose={() => setEdit(false)}
        title="Editar dominio"
        icon={Globe}
        size="lg"
        fields={domainFields(lk, { editing: true }).filter((f) => f.name !== 'monitor')}
        initial={{ ...d, expires_at: d.expires_at?.slice(0, 10) }}
        onSubmit={async (v) => {
          await api.patch(`/infrastructure/domains/${id}`, v);
          toast.success('Dominio actualizado');
          emitRefresh();
        }}
      />
      <FormModal
        open={!!dnsForm}
        onClose={() => setDnsForm(null)}
        title={dnsForm?.id ? 'Editar registro DNS' : 'Añadir registro DNS'}
        subtitle="El cambio se aplica en Cloudflare inmediatamente y queda auditado."
        icon={Cloud}
        fields={dnsFields}
        initial={dnsForm}
        onSubmit={async (v) => {
          if (v.priority == null) delete v.priority;
          const dns = dnsForm.id ? await api.patch(`/infrastructure/domains/${id}/dns/${dnsForm.id}`, v) : await api.post(`/infrastructure/domains/${id}/dns`, v);
          setData((x) => ({ ...x, dns }));
          toast.success('Registro DNS guardado en Cloudflare');
        }}
        submitLabel="Aplicar en Cloudflare"
      />
      <ConfirmDialog
        open={!!dnsRemove}
        onClose={() => setDnsRemove(null)}
        title="Eliminar registro DNS"
        message={dnsRemove && <>Se eliminará <span className="mono">{dnsRemove.type} {dnsRemove.name} → {dnsRemove.content}</span> en Cloudflare. Puede dejar servicios sin resolver.</>}
        requirePassword
        tone="danger"
        confirmLabel="Eliminar en Cloudflare"
        onConfirm={async ({ password }) => {
          const dns = await api.del(`/infrastructure/domains/${id}/dns/${dnsRemove.id}`, { password });
          setData((x) => ({ ...x, dns }));
          toast.success('Registro eliminado');
        }}
      />
      <ConfirmDialog
        open={remove}
        onClose={() => setRemove(false)}
        title="Eliminar dominio del inventario"
        message="Se eliminan sus comprobaciones y registros sincronizados en Web Pulsar. No afecta al registrador ni a Cloudflare."
        tone="danger"
        confirmLabel="Eliminar"
        onConfirm={async () => {
          await api.del(`/infrastructure/domains/${id}`);
          toast.success('Dominio eliminado del inventario');
          emitRefresh();
          navigate('/infraestructura?tab=dominios');
        }}
      />
    </div>
  );
}
