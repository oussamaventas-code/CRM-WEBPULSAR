import { useEffect, useState } from 'react';
import { CircleCheck, CircleX, Cloud, ExternalLink, Mail, Plug, RefreshCw, Server, ShieldCheck, Unplug } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api, emitRefresh } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { relative } from '../../lib/format.js';
import { INTEGRATION_STATUS } from '../../lib/labels.js';
import { ConfirmDialog } from '../../components/Modal.jsx';
import { Button, Field, Glass, Input, LabelBadge, Notice, Skeleton, Switch } from '../../components/ui.jsx';

const ICON = { hostinger: Server, cloudflare: Cloud, smtp: Mail };
const CAP_LABEL = { vps: 'Servidores VPS y métricas', domains: 'Dominios y caducidad', billing: 'Suscripciones y renovaciones', accounts: 'Cuentas', zones: 'Zonas y dominios', dns: 'Registros DNS', workers: 'Workers', d1: 'Bases de datos D1', r2: 'Buckets R2' };

function SyncReport({ report }) {
  if (!report) return null;
  const items = [
    report.servers && `${report.servers.created + report.servers.updated} VPS (${report.servers.created} nuevos)`,
    report.metrics != null && `${report.metrics} muestras de métricas`,
    report.domains && `${report.domains.created + report.domains.updated} dominios`,
    report.subscriptions?.length && `${report.subscriptions.length} suscripciones`,
    report.zones && `${report.zones.created + report.zones.updated} zonas`,
    report.dns_records != null && `${report.dns_records} registros DNS`,
    report.workers != null && `${report.workers} Workers`,
    report.d1 != null && `${report.d1} bases D1`,
    report.r2 != null && `${report.r2} buckets R2`,
  ].filter(Boolean);
  return (
    <div className="mt-3 rounded-[14px] bg-surface/60 px-3.5 py-2.5 text-[12px]">
      <p className="font-medium text-ink">Última sincronización</p>
      <p className="text-ink-soft">{items.join(' · ') || 'Sin recursos encontrados'}</p>
      {report.warnings?.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-warn-ink">
          {report.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
    </div>
  );
}

function IntegrationCard({ integration: i }) {
  const { can } = useAuth();
  const toast = useToast();
  const Icon = ICON[i.key];
  const [token, setToken] = useState('');
  const [accountId, setAccountId] = useState(i.config.account_id ?? '');
  const [smtp, setSmtp] = useState({ host: i.config.host ?? '', port: i.config.port ?? 587, secure: !!i.config.secure, user: i.config.user ?? '', from: i.config.from ?? '', password: '' });
  const [busy, setBusy] = useState(null);
  const [disconnect, setDisconnect] = useState(false);
  const [errors, setErrors] = useState({});
  const manage = can('integrations.manage');
  const env = i.source === 'env';

  useEffect(() => setAccountId(i.config.account_id ?? ''), [i.config.account_id]);

  const run = async (kind, fn, ok) => {
    setBusy(kind);
    setErrors({});
    try {
      const res = await fn();
      if (res?.verify_error) toast.error({ message: `Guardado, pero la verificación falló: ${res.verify_error}` });
      else toast.success(ok);
      setToken('');
      emitRefresh();
    } catch (err) {
      setErrors(err.fields ?? {});
      toast.error(err);
      emitRefresh();
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run('save', () => api.put(`/integrations/${i.key}`, i.key === 'smtp' ? { ...smtp, password: smtp.password || undefined } : { token: token || undefined, account_id: accountId || undefined }), 'Credenciales guardadas y verificadas');

  const caps = Object.entries(i.capabilities ?? {});
  return (
    <Glass className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-surface bg-gradient-to-b from-brand-ice to-surface text-brand shadow-glass">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">{i.name}</p>
          <p className="text-[12px] text-ink-soft">
            {i.configured ? (env ? 'Credencial en variable de entorno del servidor' : `Token cifrado ${i.secret_hint ?? ''}`) : 'Pendiente de conexión'}
          </p>
        </div>
        <LabelBadge set={INTEGRATION_STATUS} value={i.status} />
      </div>

      {i.last_error && i.status !== 'connected' && <Notice tone="danger" className="mt-4">{i.last_error}</Notice>}

      {caps.length > 0 && (
        <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
          {caps.map(([k, c]) => (
            <li key={k} className="flex items-start gap-2 text-[12.5px]" title={c.error}>
              {c.ok ? <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" /> : <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />}
              <span className={c.ok ? 'text-ink' : 'text-ink-soft'}>
                {CAP_LABEL[k] ?? k}
                {!c.ok && <span className="block text-[11px] text-ink-faint">Sin permiso o no disponible</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-soft">
        {i.last_verified_at && <span>Verificada {relative(i.last_verified_at)}</span>}
        {i.last_sync_at && <span>Sincronizada {relative(i.last_sync_at)}</span>}
      </div>
      <SyncReport report={i.last_sync_report} />

      {manage && !env && (
        <div className="mt-4 space-y-3 border-t border-line/70 pt-4">
          {i.key === 'smtp' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Servidor SMTP" error={errors.host}><Input value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.hostinger.com" className="mono" /></Field>
              <Field label="Puerto" error={errors.port}><Input value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: e.target.value })} className="num" /></Field>
              <Field label="Usuario" error={errors.user}><Input value={smtp.user} onChange={(e) => setSmtp({ ...smtp, user: e.target.value })} autoComplete="off" /></Field>
              <Field label="Contraseña" hint={i.secret_hint ? 'Déjala vacía para conservar la actual' : undefined} error={errors.password}><Input type="password" value={smtp.password} onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} autoComplete="new-password" /></Field>
              <Field label="Remitente" error={errors.from} className="sm:col-span-2"><Input value={smtp.from} onChange={(e) => setSmtp({ ...smtp, from: e.target.value })} placeholder="Web Pulsar <facturacion@tudominio.com>" /></Field>
              <div className="sm:col-span-2"><Switch checked={smtp.secure} onChange={(v) => setSmtp({ ...smtp, secure: v })} label="Conexión SSL/TLS directa" description="Actívalo para el puerto 465" /></div>
            </div>
          ) : (
            <>
              <Field label={i.configured ? 'Nuevo token (opcional)' : 'Token de API'} error={errors.token} hint="Se cifra en el servidor y nunca vuelve al navegador.">
                <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="new-password" className="mono" placeholder={i.configured ? '••••••••••••' : 'Pega aquí el token'} />
              </Field>
              {i.key === 'cloudflare' && (
                <Field label="Account ID (opcional)" error={errors.account_id} hint="Necesario si el token es de cuenta en lugar de usuario">
                  <Input value={accountId} onChange={(e) => setAccountId(e.target.value)} className="mono" />
                </Field>
              )}
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button icon={Plug} onClick={save} loading={busy === 'save'} disabled={i.key !== 'smtp' && !token && !i.configured}>
              {i.configured ? 'Guardar y verificar' : 'Conectar'}
            </Button>
            {i.configured && (
              <Button variant="secondary" icon={ShieldCheck} loading={busy === 'verify'} onClick={() => run('verify', () => api.post(`/integrations/${i.key}/verify`), 'Conexión verificada')}>
                Verificar
              </Button>
            )}
            {i.configured && i.key !== 'smtp' && can('infrastructure.write') && (
              <Button variant="secondary" icon={RefreshCw} loading={busy === 'sync'} onClick={() => run('sync', () => api.post(`/integrations/${i.key}/sync`), 'Sincronización completada')}>
                Sincronizar ahora
              </Button>
            )}
            {i.configured && (
              <Button variant="ghost" icon={Unplug} className="text-danger" onClick={() => setDisconnect(true)}>
                Desconectar
              </Button>
            )}
          </div>
        </div>
      )}
      {manage && env && i.key !== 'smtp' && can('infrastructure.write') && (
        <div className="mt-4 flex gap-2 border-t border-line/70 pt-4">
          <Button variant="secondary" icon={ShieldCheck} loading={busy === 'verify'} onClick={() => run('verify', () => api.post(`/integrations/${i.key}/verify`), 'Conexión verificada')}>Verificar</Button>
          <Button variant="secondary" icon={RefreshCw} loading={busy === 'sync'} onClick={() => run('sync', () => api.post(`/integrations/${i.key}/sync`), 'Sincronización completada')}>Sincronizar ahora</Button>
        </div>
      )}

      <details className="group mt-4 rounded-[14px] bg-brand-ice/40 px-3.5 py-2.5 text-[12px]">
        <summary className="cursor-pointer font-medium text-brand-deep">Cómo obtener el acceso y limitaciones</summary>
        <p className="mt-2 text-ink-soft">{i.how}</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-ink-soft">{i.limits?.map((l) => <li key={l}>{l}</li>)}</ul>
        {i.docs && (
          <a href={i.docs} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 font-medium text-brand hover:underline">
            Documentación oficial <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </details>

      <ConfirmDialog
        open={disconnect}
        onClose={() => setDisconnect(false)}
        title={`Desconectar ${i.name}`}
        message="Se eliminará la credencial cifrada. Los recursos ya importados se conservan en el inventario."
        tone="danger"
        confirmLabel="Desconectar"
        onConfirm={async () => {
          await api.del(`/integrations/${i.key}`);
          toast.success('Integración desconectada');
          emitRefresh();
        }}
      />
    </Glass>
  );
}

export function IntegrationsPanel({ only }) {
  const { data, loading } = useApi('/integrations');
  if (loading && !data) return <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-72 rounded-card" /><Skeleton className="h-72 rounded-card" /></div>;
  const list = (data ?? []).filter((i) => !only || only.includes(i.key));
  return (
    <div>
      <Notice tone="brand" icon={ShieldCheck} className="mb-4">
        Las integraciones usan las APIs oficiales con tokens de mínimo privilegio. Los tokens se cifran con AES-256-GCM en el servidor y nunca se guardan en el navegador. Si una operación no está disponible por API, se indica como limitación.
      </Notice>
      <div className="grid gap-4 xl:grid-cols-2">{list.map((i) => <IntegrationCard key={i.key} integration={i} />)}</div>
    </div>
  );
}
