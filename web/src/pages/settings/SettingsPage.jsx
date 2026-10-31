import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bell, Building2, Copy, Database, DatabaseBackup, Download, FlaskConical, HeartPulse, KeyRound, Link2, Lock, MonitorSmartphone, MoreHorizontal, Pencil, Plug, Plus, Receipt, ShieldCheck, Trash2, UserCog, UserPlus, Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api, download, emitRefresh } from '../../lib/api.js';
import { useApi } from '../../lib/hooks.js';
import { bytes, dateTime, relative } from '../../lib/format.js';
import { ROLE } from '../../lib/labels.js';
import { FormFields, FormModal, collectValues, useFormState } from '../../components/FormModal.jsx';
import { ConfirmDialog, Modal } from '../../components/Modal.jsx';
import { DataTable } from '../../components/DataTable.jsx';
import { Avatar, Badge, Button, EmptyState, Field, IconButton, Input, LabelBadge, Menu, Notice, PageHeader, Section, Skeleton, Tabs } from '../../components/ui.jsx';
import { IntegrationsPanel } from '../infrastructure/IntegrationsPanel.jsx';

function SettingsForm({ settingKey, fields, data, title, icon, transformIn = (v) => v, transformOut = (v) => v, notice }) {
  const toast = useToast();
  const [values, setValues] = useFormState(fields, transformIn(data ?? {}), !!data);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      await api.put(`/settings/${settingKey}`, transformOut(collectValues(fields, values)));
      toast.success('Configuración guardada');
      emitRefresh();
    } catch (err) {
      setErrors(err.fields ?? {});
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title={title} icon={icon} actions={<Button size="sm" loading={busy} onClick={save}>Guardar</Button>}>
      {notice && <div className="mb-4">{notice}</div>}
      <FormFields fields={fields} values={values} setValues={setValues} errors={errors} />
    </Section>
  );
}

const companyFields = [
  { name: 'name', label: 'Nombre comercial', required: true },
  { name: 'legal_name', label: 'Razón social' },
  { name: 'tax_id', label: 'NIF / CIF', mono: true },
  { name: 'email', label: 'Email de facturación', type: 'email' },
  { name: 'address', label: 'Domicilio fiscal', span: 2 },
  { name: 'postal_code', label: 'Código postal' },
  { name: 'city', label: 'Ciudad' },
  { name: 'province', label: 'Provincia' },
  { name: 'country', label: 'País' },
  { name: 'phone', label: 'Teléfono' },
  { name: 'website', label: 'Web' },
  { name: 'iban', label: 'IBAN para cobros', mono: true, span: 2, hint: 'Aparece en las facturas como forma de pago' },
];

const invoicingFields = [
  { name: 'tax_rates', label: 'Tipos de IVA disponibles (%)', hint: 'Separados por comas, p. ej. 21, 10, 4, 0' },
  { name: 'default_tax_rate', label: 'IVA por defecto (%)', type: 'number' },
  { name: 'withholding_rates', label: 'Retenciones IRPF disponibles (%)', hint: 'Separadas por comas, p. ej. 0, 7, 15' },
  { name: 'default_withholding', label: 'Retención por defecto (%)', type: 'number' },
  { name: 'payment_terms_days', label: 'Plazo de pago (días)', type: 'number' },
  {
    name: 'verifactu_mode',
    label: 'Régimen de registro',
    type: 'select',
    required: true,
    options: [
      { value: 'not_configured', label: 'Sin configurar' },
      { value: 'verifactu', label: 'VeriFactu (envío a la AEAT)' },
      { value: 'no_verifactu', label: 'No VeriFactu (conservación de registros)' },
    ],
  },
  { name: 'footer', label: 'Pie de factura', type: 'textarea', span: 2, hint: 'Texto legal, condiciones de pago, inscripción registral…' },
];
const list = (s) => String(s ?? '').split(',').map((x) => Number(x.trim().replace(',', '.'))).filter((n) => Number.isFinite(n));

const seriesFields = (editing) => [
  { name: 'code', label: 'Código', required: true, mono: true, disabled: editing, readOnly: editing },
  { name: 'name', label: 'Nombre', required: true },
  { name: 'prefix', label: 'Prefijo', mono: true },
  { name: 'format', label: 'Formato', mono: true, default: '{PREFIX}{YYYY}-{NUM}', hint: '{PREFIX} {YYYY} {YY} {NUM}' },
  { name: 'padding', label: 'Dígitos del número', type: 'number', default: 4 },
  { name: 'kind', label: 'Tipo', type: 'select', required: true, default: 'standard', options: [{ value: 'standard', label: 'Ordinaria' }, { value: 'rectifying', label: 'Rectificativa' }] },
  { name: 'reset_yearly', label: 'Reinicio anual', type: 'switch', switchLabel: 'Reiniciar la numeración cada año', default: true },
  { name: 'is_default', label: 'Por defecto', type: 'switch', switchLabel: 'Serie por defecto de su tipo' },
  { name: 'active', label: 'Activa', type: 'switch', switchLabel: 'Serie activa', default: true },
];

function InvoicingTab({ settings }) {
  const toast = useToast();
  const { data: series, loading } = useApi('/invoice-series');
  const [form, setForm] = useState(null);
  return (
    <div className="space-y-6">
      <SettingsForm
        settingKey="invoicing"
        title="Facturación"
        icon={Receipt}
        fields={invoicingFields}
        data={settings.invoicing}
        transformIn={(d) => ({ ...d, tax_rates: d.tax_rates?.join(', '), withholding_rates: d.withholding_rates?.join(', ') })}
        transformOut={(v) => ({ ...v, tax_rates: list(v.tax_rates), withholding_rates: list(v.withholding_rates), currency: 'EUR' })}
        notice={
          <Notice tone="warn" title="Cumplimiento normativo">
            Web Pulsar numera de forma correlativa por serie, congela los datos fiscales al emitir e impide modificar facturas emitidas, y genera un registro encadenado con la estructura de VeriFactu. <strong>No envía registros a la AEAT</strong> ni garantiza por sí solo el cumplimiento de VeriFactu o de la factura electrónica obligatoria: valida la configuración y los requisitos vigentes con tu asesoría antes de usarlo como sistema oficial.
          </Notice>
        }
      />
      <Section title="Series de facturación" icon={Receipt} flush actions={<Button size="sm" icon={Plus} onClick={() => setForm({})}>Nueva serie</Button>}>
        <DataTable
          rows={series}
          loading={loading}
          columns={[
            { key: 'code', header: 'Código', render: (r) => <span className="mono font-medium">{r.code}</span> },
            { key: 'name', header: 'Nombre' },
            { key: 'format', header: 'Formato', render: (r) => <span className="mono text-[12px]">{r.format.replace('{PREFIX}', r.prefix).replace('{YYYY}', new Date().getFullYear()).replace('{YY}', String(new Date().getFullYear()).slice(-2)).replace('{NUM}', '1'.padStart(r.padding, '0'))}</span> },
            { key: 'kind', header: 'Tipo', render: (r) => <Badge tone={r.kind === 'rectifying' ? 'violet' : 'brand'}>{r.kind === 'rectifying' ? 'Rectificativa' : 'Ordinaria'}</Badge> },
            { key: 'issued', header: 'Emitidas', align: 'right', render: (r) => <span className="num">{r.issued_count}</span> },
            { key: 'flags', header: '', render: (r) => <div className="flex gap-1">{r.is_default ? <Badge tone="ok">Por defecto</Badge> : null}{!r.active && <Badge>Inactiva</Badge>}{r.is_demo ? <Badge tone="violet">DEMO</Badge> : null}</div> },
            { key: 'a', header: '', align: 'right', render: (r) => <IconButton icon={Pencil} label="Editar" className="h-8 w-8" onClick={() => setForm({ ...r, reset_yearly: !!r.reset_yearly, is_default: !!r.is_default, active: !!r.active })} /> },
          ]}
        />
      </Section>
      <FormModal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? `Serie ${form.code}` : 'Nueva serie'}
        icon={Receipt}
        notice={form?.issued_count > 0 && <Notice tone="warn">Esta serie ya tiene facturas emitidas: solo puedes cambiar el nombre, activarla o marcarla por defecto.</Notice>}
        fields={seriesFields(!!form?.id)}
        initial={form}
        onSubmit={async (v) => {
          if (form.id) await api.patch(`/invoice-series/${form.id}`, v);
          else await api.post('/invoice-series', v);
          toast.success('Serie guardada');
          emitRefresh();
        }}
      />
    </div>
  );
}

function UsersTab() {
  const { user: me } = useAuth();
  const toast = useToast();
  const users = useApi('/users');
  const roles = useApi('/roles');
  const [form, setForm] = useState(null);
  const [link, setLink] = useState(null);
  const roleOptions = ROLE.options;
  return (
    <div className="space-y-6">
      <Section title="Usuarios" icon={Users} flush actions={<Button size="sm" icon={UserPlus} onClick={() => setForm({})}>Nuevo usuario</Button>}>
        <DataTable
          rows={users.data}
          loading={users.loading}
          columns={[
            { key: 'name', header: 'Usuario', render: (r) => <div className="flex items-center gap-3"><Avatar name={r.name} size={32} /><div><p className="flex items-center gap-2 font-medium">{r.name}{r.is_owner ? <Badge tone="brand">Principal</Badge> : null}{r.id === me.id && <Badge>Tú</Badge>}</p><p className="text-[12px] text-ink-soft">{r.email}</p></div></div> },
            { key: 'role', header: 'Rol', render: (r) => <LabelBadge set={ROLE} value={r.role} dot={false} /> },
            { key: 'status', header: 'Estado', render: (r) => (r.locked_until && r.locked_until > new Date().toISOString() ? <Badge tone="danger" dot>Bloqueado temporalmente</Badge> : <Badge tone={r.status === 'active' ? 'ok' : 'mute'} dot>{r.status === 'active' ? 'Activo' : 'Desactivado'}</Badge>) },
            { key: 'login', header: 'Último acceso', hideOnMobile: true, render: (r) => <span className="text-[12px] text-ink-soft">{r.last_login_at ? relative(r.last_login_at) : 'Nunca'}</span> },
            {
              key: 'a',
              header: '',
              align: 'right',
              render: (r) => (
                <Menu
                  trigger={({ toggle }) => <IconButton icon={MoreHorizontal} label="Acciones" onClick={toggle} className="h-8 w-8" />}
                  items={[
                    { label: 'Editar', icon: Pencil, onClick: () => setForm(r) },
                    {
                      label: 'Generar enlace de contraseña',
                      icon: Link2,
                      onClick: async () => {
                        try {
                          setLink({ ...(await api.post(`/users/${r.id}/reset-link`)), name: r.name });
                        } catch (err) {
                          toast.error(err);
                        }
                      },
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Section>
      <Section title="Roles y permisos" subtitle="Los permisos se aplican en el servidor, no solo ocultando botones" icon={ShieldCheck}>
        {!roles.data ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {roles.data.roles.map((r) => (
              <div key={r.key} className="rounded-[16px] border border-surface/80 bg-surface/55 p-4">
                <div className="flex items-center justify-between"><LabelBadge set={ROLE} value={r.key} dot={false} /><span className="text-[11.5px] text-ink-soft">{r.users} usuarios</span></div>
                <p className="mt-2 text-[12.5px] text-ink-soft">{r.description}</p>
                <p className="mt-2 text-[11.5px] text-ink-faint">{r.permissions.length} de {roles.data.permissions.length} permisos</p>
                <details className="mt-2 text-[12px]">
                  <summary className="cursor-pointer text-brand">Ver permisos</summary>
                  <ul className="mt-2 space-y-0.5 text-ink-soft">{roles.data.permissions.filter((p) => r.permissions.includes(p.key)).map((p) => <li key={p.key}>· {p.description}</li>)}</ul>
                </details>
              </div>
            ))}
          </div>
        )}
      </Section>
      <FormModal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? `Editar ${form.name}` : 'Nuevo usuario'}
        subtitle={form?.id ? null : 'Si no indicas contraseña se generará un enlace para que la cree el propio usuario.'}
        icon={UserCog}
        fields={
          form?.id
            ? [
                { name: 'name', label: 'Nombre', required: true, span: 2 },
                { name: 'role', label: 'Rol', type: 'select', options: roleOptions, required: true, disabled: !!form.is_owner },
                { name: 'status', label: 'Estado', type: 'select', required: true, disabled: !!form.is_owner || form.id === me.id, options: [{ value: 'active', label: 'Activo' }, { value: 'disabled', label: 'Desactivado' }] },
              ]
            : [
                { name: 'name', label: 'Nombre', required: true },
                { name: 'email', label: 'Email', type: 'email', required: true },
                { name: 'role', label: 'Rol', type: 'select', options: roleOptions, required: true, default: 'admin' },
                { name: 'password', label: 'Contraseña inicial (opcional)', type: 'password', autoComplete: 'new-password', hint: 'Mínimo 12 caracteres' },
              ]
        }
        initial={form}
        onSubmit={async (v) => {
          if (form.id) {
            await api.patch(`/users/${form.id}`, v);
            toast.success('Usuario actualizado');
          } else {
            if (!v.password) delete v.password;
            const res = await api.post('/users', v);
            if (res.setup_link) setLink({ url: res.setup_link, expires_minutes: res.expires_minutes, name: res.user.name });
            toast.success('Usuario creado');
          }
          emitRefresh();
        }}
      />
      <Modal open={!!link} onClose={() => setLink(null)} title="Enlace para establecer contraseña" icon={KeyRound} size="md" footer={<Button onClick={() => setLink(null)}>Hecho</Button>}>
        <Notice tone="warn">Envíaselo a {link?.name} por un canal seguro. Caduca en {link?.expires_minutes} minutos y solo se muestra ahora.</Notice>
        <div className="mt-4 flex items-center gap-2 rounded-[14px] border border-line bg-surface px-3 py-2.5">
          <code className="mono flex-1 truncate text-[12px]">{link?.url}</code>
          <IconButton icon={Copy} label="Copiar enlace" onClick={async () => { await navigator.clipboard.writeText(link.url); toast.success('Enlace copiado'); }} />
        </div>
      </Modal>
    </div>
  );
}

const monitoringFields = [
  { name: 'default_interval_s', label: 'Intervalo por defecto (s)', type: 'number' },
  { name: 'failure_threshold', label: 'Fallos seguidos para alertar', type: 'number' },
  { name: 'latency_warn_ms', label: 'Aviso de latencia HTTP (ms)', type: 'number' },
  { name: 'heartbeat_stale_s', label: 'Heartbeat caducado tras (s)', type: 'number' },
  { name: 'cpu_warn_pct', label: 'Advertencia de CPU (%)', type: 'number' },
  { name: 'ram_warn_pct', label: 'Advertencia de RAM (%)', type: 'number' },
  { name: 'disk_warn_pct', label: 'Advertencia de disco (%)', type: 'number' },
  { name: 'domain_expiry_days', label: 'Avisar caducidad de dominio (días)', type: 'number' },
  { name: 'ssl_expiry_days', label: 'Avisar caducidad de SSL (días)', type: 'number' },
  { name: 'results_retention_days', label: 'Conservar resultados (días)', type: 'number' },
  { name: 'metrics_retention_days', label: 'Conservar métricas (días)', type: 'number' },
];
const automationFields = [
  { name: 'payment_due_reminder', type: 'switch', label: 'Pagos', switchLabel: 'Avisar de pagos próximos a vencer y vencidos', span: 2 },
  { name: 'invoice_overdue', type: 'switch', label: 'Facturas', switchLabel: 'Marcar y avisar de facturas vencidas', span: 2 },
  { name: 'recurring_generation', type: 'switch', label: 'Recurrentes', switchLabel: 'Generar automáticamente los cobros recurrentes al vencer', span: 2 },
  { name: 'server_down', type: 'switch', label: 'Servidores', switchLabel: 'Avisar cuando un servidor deje de responder', span: 2 },
  { name: 'domain_expiry', type: 'switch', label: 'Dominios', switchLabel: 'Avisar de dominios próximos a caducar', span: 2 },
  { name: 'alert_to_incident', type: 'switch', label: 'Incidencias', switchLabel: 'Crear incidencia automáticamente desde alertas críticas', span: 2 },
  { name: 'project_status_change', type: 'switch', label: 'Proyectos', switchLabel: 'Notificar cuando un proyecto cambie de estado', span: 2 },
  { name: 'task_reminders', type: 'switch', label: 'Tareas', switchLabel: 'Recordar tareas próximas o vencidas a su responsable', span: 2 },
  { name: 'integration_sync_hours', label: 'Sincronizar integraciones cada (horas, 0 = manual)', type: 'number' },
];

function AccountTab() {
  const toast = useToast();
  const { user } = useAuth();
  const sessions = useApi('/auth/sessions');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const change = async () => {
    if (next !== repeat) return setErrors({ repeat: 'No coincide' });
    setBusy(true);
    setErrors({});
    try {
      await api.post('/auth/change-password', { current_password: current, new_password: next });
      setCurrent('');
      setNext('');
      setRepeat('');
      toast.success('Contraseña cambiada', 'Se han cerrado tus otras sesiones.');
      sessions.reload();
    } catch (err) {
      setErrors(err.fields ?? {});
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Cambiar contraseña" icon={Lock}>
        <p className="mb-4 text-[12.5px] text-ink-soft">{user.name} · {user.email}</p>
        <div className="space-y-3">
          <Field label="Contraseña actual" error={errors.current_password}><Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
          <Field label="Nueva contraseña" error={errors.new_password} hint="Mínimo 12 caracteres combinando mayúsculas, minúsculas, números o símbolos"><Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
          <Field label="Repite la nueva contraseña" error={errors.repeat}><Input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} /></Field>
          <Button loading={busy} onClick={change} disabled={!current || !next}>Cambiar contraseña</Button>
        </div>
      </Section>
      <Section title="Sesiones activas" icon={MonitorSmartphone} flush>
        <ul className="divide-y divide-line/60 pb-2">
          {(sessions.data ?? []).map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[13px] font-medium">{s.ip ?? 'IP desconocida'}{s.current && <Badge tone="ok">Esta sesión</Badge>}</p>
                <p className="truncate text-[11.5px] text-ink-soft">{s.user_agent}</p>
                <p className="text-[11.5px] text-ink-faint">Última actividad {relative(s.last_seen_at)} · caduca {dateTime(s.expires_at)}</p>
              </div>
              {!s.current && (
                <Button size="sm" variant="ghost" className="text-danger" onClick={async () => { await api.del(`/auth/sessions/${s.id}`); toast.success('Sesión cerrada'); sessions.reload(); }}>
                  Cerrar
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function DataTab({ settings }) {
  const toast = useToast();
  const { data, loading } = useApi('/backups');
  const [busy, setBusy] = useState(false);
  const [clear, setClear] = useState(false);
  const [loadDemo, setLoadDemo] = useState(false);
  const demo = settings.demo;
  return (
    <div className="space-y-6">
      <Section
        title="Copias de seguridad"
        subtitle="Copia diaria automática de la base de datos (VACUUM INTO) con retención configurable"
        icon={DatabaseBackup}
        flush
        actions={
          <Button
            size="sm"
            icon={Database}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const b = await api.post('/backups');
                toast.success('Copia creada', `${b.name} · ${bytes(b.size_bytes)}`);
                emitRefresh();
              } catch (err) {
                toast.error(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            Crear copia ahora
          </Button>
        }
      >
        <Notice tone="warn" className="mx-5 mb-4">Las credenciales y tokens siguen cifrados dentro de la copia. Para restaurarlos necesitarás la MASTER_KEY: guárdala fuera del servidor. Los archivos subidos (carpeta uploads) deben copiarse aparte; ver docs/RESTAURACION.md.</Notice>
        <DataTable
          rows={data?.backups}
          loading={loading}
          empty={<EmptyState compact icon={DatabaseBackup} title="Todavía no hay copias" description="La primera copia automática se crea a la hora configurada (BACKUP_HOUR)." />}
          columns={[
            { key: 'name', header: 'Archivo', render: (r) => <span className="mono text-[12.5px]">{r.name}</span> },
            { key: 'size', header: 'Tamaño', align: 'right', render: (r) => <span className="num">{bytes(r.size_bytes)}</span> },
            { key: 'date', header: 'Fecha', render: (r) => <span className="text-[12.5px] text-ink-soft">{dateTime(r.created_at)}</span> },
            { key: 'a', header: '', align: 'right', render: (r) => <IconButton icon={Download} label="Descargar" className="h-8 w-8" onClick={() => download(`/backups/${r.name}/download`, r.name).catch((e) => toast.error(e))} /> },
          ]}
        />
      </Section>
      <Section title="Datos DEMO" icon={FlaskConical}>
        <p className="text-[13px] text-ink-soft">
          Carga un conjunto de datos ficticios claramente marcados como <Badge tone="violet">DEMO</Badge> para explorar la aplicación: clientes, proyectos, facturas de una serie DEMO (no consume tu numeración), cobros, gastos e incidencias. No se generan métricas de infraestructura ni testimonios autorizados.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {demo?.loaded ? (
            <>
              <Badge tone="violet" dot>Cargados {relative(demo.loaded_at)}</Badge>
              <Button variant="danger" icon={Trash2} onClick={() => setClear(true)}>Eliminar datos DEMO</Button>
            </>
          ) : (
            <Button variant="secondary" icon={FlaskConical} onClick={() => setLoadDemo(true)}>Cargar datos DEMO</Button>
          )}
        </div>
      </Section>
      <Section title="Procesos programados" subtitle="Monitorización cada 30 s · automatizaciones cada 15 min · integraciones y mantenimiento cada hora" icon={Bell} flush>
        <DataTable
          rows={data?.last_jobs}
          loading={loading}
          dense
          empty={<EmptyState compact icon={Bell} title="Sin ejecuciones registradas todavía" />}
          columns={[
            { key: 'job', header: 'Proceso', render: (r) => ({ maintenance: 'Mantenimiento y copias', automations: 'Automatizaciones', integrations: 'Sincronización de integraciones' })[r.job] ?? r.job },
            { key: 'status', header: 'Resultado', render: (r) => <Badge tone={r.status === 'ok' ? 'ok' : r.status === 'error' ? 'danger' : 'warn'} dot>{r.status === 'ok' ? 'Correcto' : r.status === 'error' ? 'Error' : 'En curso'}</Badge> },
            { key: 'at', header: 'Inicio', render: (r) => <span className="text-[12px] text-ink-soft">{relative(r.started_at)}</span> },
            { key: 'details', header: 'Detalle', hideOnMobile: true, render: (r) => <span className="mono line-clamp-1 max-w-[360px] text-[11px] text-ink-faint">{r.details ?? '—'}</span> },
          ]}
        />
      </Section>
      <ConfirmDialog
        open={loadDemo}
        onClose={() => setLoadDemo(false)}
        title="Cargar datos DEMO"
        message="Se añadirán registros ficticios marcados como DEMO. Podrás eliminarlos todos con un clic."
        confirmLabel="Cargar"
        onConfirm={async () => {
          await api.post('/demo/load');
          toast.success('Datos DEMO cargados');
          emitRefresh();
        }}
      />
      <ConfirmDialog
        open={clear}
        onClose={() => setClear(false)}
        title="Eliminar datos DEMO"
        message="Se eliminarán todos los registros marcados como DEMO. Tus datos reales no se tocan."
        requirePassword
        tone="danger"
        confirmLabel="Eliminar"
        onConfirm={async ({ password }) => {
          await api.post('/demo/clear', { password });
          toast.success('Datos DEMO eliminados');
          emitRefresh();
        }}
      />
    </div>
  );
}

export default function SettingsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data: settings } = useApi('/settings');
  const tabs = [
    can('settings.manage') && { key: 'empresa', label: 'Empresa', icon: Building2 },
    can('settings.manage') && { key: 'facturacion', label: 'Facturación', icon: Receipt },
    can('users.manage') && { key: 'usuarios', label: 'Usuarios y roles', icon: Users },
    (can('integrations.manage') || can('infrastructure.read')) && { key: 'integraciones', label: 'Integraciones', icon: Plug },
    can('settings.manage') && { key: 'monitorizacion', label: 'Monitorización y avisos', icon: HeartPulse },
    { key: 'cuenta', label: 'Mi cuenta', icon: KeyRound },
    can('backups.manage') && { key: 'datos', label: 'Copias y datos', icon: DatabaseBackup },
  ].filter(Boolean);
  const requested = params.get('tab');
  const tab = tabs.some((t) => t.key === requested) ? requested : tabs[0].key;
  useEffect(() => {
    if (requested && requested !== tab) setParams({ tab }, { replace: true });
  }, [requested, tab, setParams]);

  return (
    <div>
      <PageHeader title="Configuración" subtitle="Empresa, facturación, usuarios, integraciones, umbrales de monitorización y seguridad" />
      <Tabs tabs={tabs} value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} className="mb-6" />
      {!settings ? (
        <Skeleton className="h-80 rounded-card" />
      ) : (
        <>
          {tab === 'empresa' && <SettingsForm settingKey="company" title="Datos de la empresa" icon={Building2} fields={companyFields} data={settings.company} notice={<Notice tone="brand">Estos datos aparecen en las facturas como emisor. Son obligatorios para emitir.</Notice>} />}
          {tab === 'facturacion' && <InvoicingTab settings={settings} />}
          {tab === 'usuarios' && <UsersTab />}
          {tab === 'integraciones' && <IntegrationsPanel />}
          {tab === 'monitorizacion' && (
            <div className="grid gap-6 xl:grid-cols-2">
              <SettingsForm settingKey="monitoring" title="Umbrales de monitorización" icon={HeartPulse} fields={monitoringFields} data={settings.monitoring} />
              <SettingsForm settingKey="automations" title="Automatizaciones y avisos" icon={Bell} fields={automationFields} data={settings.automations} notice={<Notice tone="brand">Los avisos aparecen como notificaciones dentro del CRM. El envío por email se activará con el correo saliente configurado.</Notice>} />
            </div>
          )}
          {tab === 'cuenta' && <AccountTab />}
          {tab === 'datos' && <DataTab settings={settings} />}
        </>
      )}
    </div>
  );
}
