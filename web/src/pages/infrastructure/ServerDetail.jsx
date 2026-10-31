import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Activity, AppWindow, Copy, Cpu, Database, FolderKanban, Globe, HeartPulse, KeyRound, MoreHorizontal, Network, Pencil, Plus, Power, RefreshCw, RotateCcw, Server, ShieldCheck, Terminal, Trash2, TriangleAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api, emitRefresh } from '../../lib/api.js';
import { useApi, useInterval, useLookups } from '../../lib/hooks.js';
import { bytes, date, dateTime, duration, isDemoLabel, relative } from '../../lib/format.js';
import { ALERT_SEVERITY, ALERT_STATUS, CHECK_STATUS, CHECK_TYPE, INCIDENT_STATUS, PROJECT_STATUS } from '../../lib/labels.js';
import { serverFields } from '../../forms.js';
import { FormModal } from '../../components/FormModal.jsx';
import { ConfirmDialog, Modal } from '../../components/Modal.jsx';
import { Badge, Button, DemoTag, EmptyState, ErrorState, Glass, IconButton, LabelBadge, Menu, Notice, PageHeader, Section, Segmented, Skeleton, Stat } from '../../components/ui.jsx';
import { MetricChart, Ring } from '../../components/charts.jsx';
import { HealthPill } from '../../components/Health.jsx';
import { checkFields } from './MonitoringPanel.jsx';

const pct = (used, total) => (used != null && total ? (used / total) * 100 : null);
const RANGES = [{ value: '1h', label: '1 h' }, { value: '6h', label: '6 h' }, { value: '24h', label: '24 h' }, { value: '7d', label: '7 días' }];

function AgentTokenModal({ result, onClose }) {
  const toast = useToast();
  if (!result) return null;
  const base = result.endpoint.replace(/\/api\/agent\/heartbeat$/, '');
  const script = [
    'sudo mkdir -p /opt/webpulsar-agent',
    `sudo curl -fsSL ${base}/api/agent/files/pulsar-agent.mjs -o /opt/webpulsar-agent/pulsar-agent.mjs`,
    `sudo curl -fsSL ${base}/api/agent/files/webpulsar-agent.service -o /etc/systemd/system/webpulsar-agent.service`,
    `printf 'WP_ENDPOINT=%s\\nWP_TOKEN=%s\\n' '${result.endpoint}' '${result.token}' | sudo tee /etc/webpulsar-agent.env >/dev/null`,
    'sudo chmod 600 /etc/webpulsar-agent.env',
    'sudo systemctl daemon-reload && sudo systemctl enable --now webpulsar-agent',
  ].join('\n');
  const copy = async (text, msg) => {
    await navigator.clipboard.writeText(text);
    toast.success(msg);
  };
  return (
    <Modal open onClose={onClose} title="Token del agente generado" icon={KeyRound} size="lg" footer={<Button onClick={onClose}>He guardado el token</Button>}>
      <Notice tone="warn" title="Se muestra una sola vez">Copia el token ahora: el servidor solo guarda su huella SHA-256. Si lo pierdes, genera uno nuevo (el anterior quedará revocado).</Notice>
      <div className="mt-4 flex items-center gap-2 rounded-[14px] border border-line bg-surface px-3 py-2.5">
        <code className="mono flex-1 truncate text-[12px]">{result.token}</code>
        <IconButton icon={Copy} label="Copiar token" onClick={() => copy(result.token, 'Token copiado')} />
      </div>
      <p className="mb-2 mt-5 flex items-center gap-2 text-[13px] font-medium"><Terminal className="h-4 w-4 text-brand" /> Instalación en el VPS (Ubuntu/Debian con Node.js 18 o superior)</p>
      <pre className="mono max-h-56 overflow-auto whitespace-pre-wrap rounded-[14px] bg-[#0F172A] p-4 text-[11.5px] leading-relaxed text-[#E2E8F0]">{script}</pre>
      <Button variant="secondary" icon={Copy} className="mt-3" onClick={() => copy(script, 'Comandos copiados')}>Copiar comandos</Button>
      <p className="mt-3 text-[12px] text-ink-soft">El agente envía cada 60 s CPU, memoria, disco, tráfico, carga y uptime por HTTPS. No abre puertos ni ejecuta órdenes remotas.</p>
    </Modal>
  );
}

export default function ServerDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const lk = useLookups(['clients', 'projects', 'servers', 'domains', 'databases', 'applications']);
  const { data, error, reload } = useApi(`/infrastructure/servers/${id}`);
  const [range, setRange] = useState('24h');
  const metrics = useApi(`/infrastructure/servers/${id}/metrics`, { range });
  useInterval(() => {
    reload();
    metrics.reload();
  }, 60_000);
  const [edit, setEdit] = useState(false);
  const [remove, setRemove] = useState(false);
  const [power, setPower] = useState(null);
  const [tokenFor, setTokenFor] = useState(false);
  const [tokenResult, setTokenResult] = useState(null);
  const [check, setCheck] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <div className="space-y-4"><Skeleton className="h-16 w-80" /><Skeleton className="h-48 rounded-card" /></div>;
  const { server: s, latest_metric: m } = data;
  const points = metrics.data?.points ?? [];
  const fresh = m && Date.now() - Date.parse(m.collected_at) < 20 * 60_000;

  const refresh = async () => {
    setRefreshing(true);
    try {
      await api.post(`/infrastructure/servers/${id}/refresh`);
      emitRefresh();
      toast.success('Estado actualizado');
    } catch (err) {
      toast.error(err);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div>
      <PageHeader
        back={{ to: '/infraestructura?tab=servidores', label: 'Servidores' }}
        eyebrow="Ficha de servidor"
        title={s.name}
        subtitle={<span className="mono">{[s.ipv4, s.hostname].filter(Boolean).join(' · ') || 'Sin IP registrada'}</span>}
        meta={
          <>
            <HealthPill status={s.status} reason={s.status_reason} />
            <Badge tone="brand">{s.provider_name}</Badge>
            {s.provider_state && <Badge tone={s.provider_state === 'running' ? 'mute' : 'warn'}>Proveedor: {s.provider_state}</Badge>}
            {isDemoLabel(s.name) && <DemoTag />}
          </>
        }
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={refresh}>Actualizar</Button>
            {can('infrastructure.write') && (
              <>
                {data.hostinger_actions && (
                  <Menu
                    trigger={({ toggle }) => <Button variant="secondary" icon={Power} onClick={toggle}>Energía</Button>}
                    items={[
                      { label: 'Reiniciar', icon: RotateCcw, onClick: () => setPower('restart') },
                      { label: 'Arrancar', icon: Power, onClick: () => setPower('start') },
                      { label: 'Detener', icon: Power, danger: true, onClick: () => setPower('stop') },
                    ]}
                  />
                )}
                <Button variant="secondary" icon={Pencil} onClick={() => setEdit(true)}>Editar</Button>
                <Menu trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label="Más" onClick={toggle} className="border border-line bg-surface/70" />} items={[{ label: 'Eliminar del inventario', icon: Trash2, danger: true, onClick: () => setRemove(true) }]} />
              </>
            )}
          </>
        }
      />

      {s.status === 'unknown' && <Notice tone="brand" className="mb-6" title="Estado sin verificar">{s.status_reason}</Notice>}
      {(s.status === 'down' || s.status === 'warning') && <Notice tone={s.status === 'down' ? 'danger' : 'warn'} className="mb-6" title={s.status === 'down' ? 'Incidencia detectada' : 'Advertencia'}>{s.status_reason}</Notice>}

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <Glass className="p-5 xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[14.5px] font-medium">Recursos en uso</p>
              <p className="text-[12px] text-ink-soft">{m ? `Fuente: ${m.source === 'agent' ? 'agente Web Pulsar' : 'API de Hostinger'} · ${relative(m.collected_at)}` : 'Sin métricas: instala el agente o conecta Hostinger'}</p>
            </div>
            {m && !fresh && <Badge tone="warn">Datos con más de 20 min</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Ring label="CPU" value={m?.cpu_pct} sub={s.cpu_cores ? `${s.cpu_cores} vCPU` : null} />
            <Ring label="Memoria RAM" value={pct(m?.ram_used_bytes, m?.ram_total_bytes ?? (s.ram_mb ? s.ram_mb * 1048576 : null))} sub={m?.ram_used_bytes != null ? `${bytes(m.ram_used_bytes)} / ${bytes(m.ram_total_bytes ?? s.ram_mb * 1048576)}` : null} />
            <Ring label="Almacenamiento" value={pct(m?.disk_used_bytes, m?.disk_total_bytes ?? (s.disk_mb ? s.disk_mb * 1048576 : null))} sub={m?.disk_used_bytes != null ? `${bytes(m.disk_used_bytes)} / ${bytes(m.disk_total_bytes ?? s.disk_mb * 1048576)}` : null} />
            <div>
              <p className="text-[12px] text-ink-soft">Uptime</p>
              <p className="mono text-[15px] font-medium">{duration(m?.uptime_s)}</p>
              <p className="mt-2 text-[12px] text-ink-soft">Carga (1 min)</p>
              <p className="mono text-[15px] font-medium">{m?.load_1 != null ? m.load_1.toFixed(2) : '—'}</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] font-medium">Evolución</p>
            <Segmented label="Periodo de métricas" options={RANGES} value={range} onChange={setRange} />
          </div>
          <div className="mt-3 grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 flex items-center gap-3 text-[12px] text-ink-soft">
                <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-[#2563EB]" />CPU</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-[#8067E8]" />RAM</span>
              </p>
              <MetricChart points={points} max={100} lines={[{ label: 'CPU', color: '#2563EB', value: (p) => p.cpu_pct }, { label: 'RAM', color: '#8067E8', value: (p) => pct(p.ram_used_bytes, p.ram_total_bytes ?? (s.ram_mb ? s.ram_mb * 1048576 : null)) }]} timeFormat={range === '7d' ? (iso) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(iso)) : undefined} />
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[12px] text-ink-soft"><span className="h-0.5 w-3 rounded bg-[#0D9488]" />Disco</p>
              <MetricChart points={points} max={100} lines={[{ label: 'Disco', color: '#0D9488', value: (p) => pct(p.disk_used_bytes, p.disk_total_bytes ?? (s.disk_mb ? s.disk_mb * 1048576 : null)) }]} timeFormat={range === '7d' ? (iso) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(iso)) : undefined} />
            </div>
          </div>
          {m && (m.net_in_bytes != null || m.net_out_bytes != null) && (
            <p className="mt-4 flex items-center gap-2 text-[12px] text-ink-soft">
              <Network className="h-3.5 w-3.5" /> Tráfico {m.source === 'agent' ? 'acumulado desde el arranque' : 'del último intervalo'}: entrada <span className="mono text-ink">{bytes(m.net_in_bytes)}</span> · salida <span className="mono text-ink">{bytes(m.net_out_bytes)}</span>
            </p>
          )}
        </Glass>

        <Section title="Datos del servidor" icon={Server}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Stat label="IPv4" value={s.ipv4} mono />
            <Stat label="IPv6" value={s.ipv6} mono />
            <Stat label="Sistema" value={s.os} />
            <Stat label="Región" value={s.region} />
            <Stat label="Plan" value={s.plan} />
            <Stat label="ID externo" value={s.external_id} mono />
            <Stat label="vCPU / RAM" value={`${s.cpu_cores ?? '—'} · ${s.ram_mb ? bytes(s.ram_mb * 1048576) : '—'}`} mono />
            <Stat label="Disco / Tráfico" value={`${s.disk_mb ? bytes(s.disk_mb * 1048576) : '—'} · ${s.bandwidth_mb ? bytes(s.bandwidth_mb * 1048576) : '—'}`} mono />
            <Stat label="Alta" value={s.provisioned_at ? date(s.provisioned_at.slice(0, 10)) : date(s.created_at)} />
            <Stat label="Última comprobación" value={s.last_check_at ? dateTime(s.last_check_at) : 'Nunca'} />
            <Stat label="Cliente">{s.client_id ? <Link className="text-brand hover:underline" to={`/clientes/${s.client_id}`}>{s.client_name}</Link> : null}</Stat>
            <Stat label="Proyecto">{s.project_id ? <Link className="text-brand hover:underline" to={`/proyectos/${s.project_id}`}>{s.project_name}</Link> : null}</Stat>
          </dl>
          {s.notes && <p className="mt-4 whitespace-pre-line rounded-[12px] bg-surface/55 p-3 text-[12.5px] text-ink-soft">{s.notes}</p>}
        </Section>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Section title="Agente de monitorización" icon={ShieldCheck}>
          {s.agent_configured ? (
            <div className="space-y-3">
              <p className="text-[13px]">
                {s.last_heartbeat_at ? <>Último heartbeat <strong>{relative(s.last_heartbeat_at)}</strong></> : 'Token generado; esperando el primer heartbeat del agente.'}
                {s.agent_version && <span className="text-ink-soft"> · versión {s.agent_version}</span>}
              </p>
              {can('infrastructure.write') && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={KeyRound} onClick={() => setTokenFor(true)}>Regenerar token</Button>
                  <Button size="sm" variant="ghost" className="text-danger" onClick={async () => { await api.del(`/infrastructure/servers/${id}/agent-token`); toast.success('Agente revocado'); emitRefresh(); }}>Revocar agente</Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] text-ink-soft">Para obtener métricas reales en tiempo real y verificar que el servidor responde, instala el agente ligero de Web Pulsar. Envía datos por HTTPS con un token propio, sin abrir puertos.</p>
              {can('infrastructure.write') && <Button size="sm" icon={KeyRound} onClick={() => setTokenFor(true)}>Generar token e instrucciones</Button>}
            </div>
          )}
        </Section>
        <Section title="Comprobaciones" icon={HeartPulse} flush actions={can('monitoring.write') && <Button size="sm" variant="secondary" icon={Plus} onClick={() => setCheck(true)}>Añadir</Button>}>
          {!data.checks.length ? (
            <p className="px-5 pb-5 text-[12.5px] text-ink-soft">Sin comprobaciones. Añade una de puerto (p. ej. 22 o 443) o HTTP para verificar la disponibilidad.</p>
          ) : (
            <ul className="divide-y divide-line/60 pb-2">
              {data.checks.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                  <LabelBadge set={CHECK_STATUS} value={c.last_status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{c.name}</p>
                    <p className="truncate text-[11.5px] text-ink-soft">{CHECK_TYPE.label(c.type)} · {c.last_message ?? 'pendiente'}</p>
                  </div>
                  <span className="num text-[12px] text-ink-soft">{c.uptime_24h.pct == null ? '—' : `${c.uptime_24h.pct} %`}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Alertas" icon={TriangleAlert} flush>
          {!data.alerts.length ? (
            <p className="px-5 pb-5 text-[12.5px] text-ink-soft">Sin alertas registradas.</p>
          ) : (
            <ul className="divide-y divide-line/60 pb-2">
              {data.alerts.map((a) => (
                <li key={a.id} className="px-5 py-2.5">
                  <div className="flex items-center gap-2"><LabelBadge set={ALERT_SEVERITY} value={a.severity} dot={false} /><LabelBadge set={ALERT_STATUS} value={a.status} /></div>
                  <p className="mt-1 text-[13px] font-medium">{a.title}</p>
                  <p className="text-[11.5px] text-ink-soft">{relative(a.opened_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Proyectos y servicios alojados" icon={FolderKanban} flush>
          {![...data.projects, ...data.applications, ...data.domains, ...data.databases].length ? (
            <p className="px-5 pb-5 text-[12.5px] text-ink-soft">Nada vinculado todavía.</p>
          ) : (
            <ul className="divide-y divide-line/60 pb-2 text-[13px]">
              {data.projects.map((p) => <li key={`p${p.id}`}><Link to={`/proyectos/${p.id}`} className="flex items-center gap-2 px-5 py-2.5 hover:bg-brand-ice/40"><FolderKanban className="h-4 w-4 text-ink-soft" /><span className="flex-1 truncate">{p.name}</span><LabelBadge set={PROJECT_STATUS} value={p.status} /></Link></li>)}
              {data.applications.map((a) => <li key={`a${a.id}`} className="flex items-center gap-2 px-5 py-2.5"><AppWindow className="h-4 w-4 text-ink-soft" /><span className="flex-1 truncate">{a.name}</span><HealthPill status={a.status} /></li>)}
              {data.domains.map((d) => <li key={`d${d.id}`}><Link to={`/infraestructura/dominios/${d.id}`} className="flex items-center gap-2 px-5 py-2.5 hover:bg-brand-ice/40"><Globe className="h-4 w-4 text-ink-soft" /><span className="mono flex-1 truncate">{d.name}</span><HealthPill status={d.status} /></Link></li>)}
              {data.databases.map((b) => <li key={`b${b.id}`} className="flex items-center gap-2 px-5 py-2.5"><Database className="h-4 w-4 text-ink-soft" /><span className="mono flex-1 truncate">{b.name}</span><HealthPill status={b.status} /></li>)}
            </ul>
          )}
        </Section>
        <Section title="Incidencias" icon={Activity} flush>
          {!data.incidents.length ? (
            <p className="px-5 pb-5 text-[12.5px] text-ink-soft">Sin incidencias.</p>
          ) : (
            <ul className="divide-y divide-line/60 pb-2">
              {data.incidents.map((i) => <li key={i.id}><Link to={`/incidencias/${i.id}`} className="flex items-center gap-2 px-5 py-2.5 hover:bg-brand-ice/40"><span className="flex-1 truncate text-[13px]">{i.title}</span><LabelBadge set={INCIDENT_STATUS} value={i.status} /></Link></li>)}
            </ul>
          )}
        </Section>
      </div>

      <FormModal
        open={edit}
        onClose={() => setEdit(false)}
        title="Editar servidor"
        icon={Cpu}
        size="lg"
        notice={s.source === 'hostinger' && <Notice tone="brand">Los datos técnicos (IP, sistema, recursos…) se sincronizan desde Hostinger y no se editan aquí.</Notice>}
        fields={serverFields(lk).filter((f) => s.source !== 'hostinger' || ['name', 'client_id', 'project_id', 'notes'].includes(f.name))}
        initial={s}
        onSubmit={async (v) => {
          await api.patch(`/infrastructure/servers/${id}`, v);
          toast.success('Servidor actualizado');
          emitRefresh();
        }}
      />
      <FormModal
        open={check}
        onClose={() => setCheck(false)}
        title="Nueva comprobación"
        icon={HeartPulse}
        fields={checkFields(lk)}
        initial={{ name: `Puerto SSH · ${s.name}`, type: 'tcp', target: s.ipv4 ? `${s.ipv4}:22` : '', entity_type: 'server', entity_id: s.id }}
        onSubmit={async (v) => {
          for (const k of ['interval_s', 'failure_threshold', 'timeout_ms']) if (v[k] == null) delete v[k];
          await api.post('/monitoring/checks', v);
          toast.success('Comprobación creada y ejecutada');
          emitRefresh();
        }}
      />
      <ConfirmDialog
        open={tokenFor}
        onClose={() => setTokenFor(false)}
        title="Generar token del agente"
        message={s.agent_configured ? 'El token actual dejará de funcionar inmediatamente.' : 'Se creará un token único para este servidor y una comprobación de heartbeat.'}
        requirePassword
        confirmLabel="Generar"
        onConfirm={async ({ password }) => {
          const result = await api.post(`/infrastructure/servers/${id}/agent-token`, { password });
          setTokenResult(result);
          emitRefresh();
        }}
      />
      <AgentTokenModal result={tokenResult} onClose={() => setTokenResult(null)} />
      <ConfirmDialog
        open={!!power}
        onClose={() => setPower(null)}
        title={{ start: 'Arrancar servidor', stop: 'Detener servidor', restart: 'Reiniciar servidor' }[power] ?? ''}
        message={power === 'stop' ? 'Las webs y servicios alojados dejarán de estar disponibles hasta que vuelvas a arrancarlo.' : 'La orden se enviará a Hostinger y quedará registrada en la auditoría.'}
        requirePassword
        tone={power === 'stop' ? 'danger' : 'primary'}
        confirmLabel="Enviar orden"
        onConfirm={async ({ password }) => {
          const res = await api.post(`/infrastructure/servers/${id}/power`, { action: power, password });
          toast.success(res.message);
          emitRefresh();
        }}
      />
      <ConfirmDialog
        open={remove}
        onClose={() => setRemove(false)}
        title="Eliminar servidor del inventario"
        message="Se eliminan sus comprobaciones y métricas en Web Pulsar. No se borra nada en Hostinger."
        requireText={s.name}
        requirePassword
        tone="danger"
        confirmLabel="Eliminar"
        onConfirm={async ({ password }) => {
          await api.del(`/infrastructure/servers/${id}`, { password });
          toast.success('Servidor eliminado del inventario');
          emitRefresh();
          navigate('/infraestructura?tab=servidores');
        }}
      />
    </div>
  );
}
