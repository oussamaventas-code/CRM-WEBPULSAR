import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, CreditCard, FolderKanban, Menu as MenuIcon, Monitor, Moon, Plug, Plus, Receipt, Search, Server, Sun, TriangleAlert, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useQuickActions } from './QuickActions.jsx';
import { Avatar, Dot, Menu, cx } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useApi, useInterval } from '../lib/hooks.js';
import { INTEGRATION_STATUS } from '../lib/labels.js';
import { longDate, relative } from '../lib/format.js';

const SEVERITY_DOT = { info: 'brand', success: 'ok', warning: 'warn', critical: 'danger' };

function Notifications() {
  const [open, setOpen] = useState(false);
  const { data, reload } = useApi('/notifications');
  const navigate = useNavigate();
  const ref = useRef(null);
  useInterval(reload, 60_000);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.read_at) await api.post(`/notifications/${n.id}/read`).catch(() => {});
    reload();
    if (n.link) navigate(n.link);
  };
  const unread = data?.unread ?? 0;

  return (
    <div className="relative" ref={ref}>
      <button className="icon-btn relative" onClick={() => setOpen((o) => !o)} aria-label={`Notificaciones${unread ? ` (${unread} sin leer)` : ''}`}>
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.9} />
        {unread > 0 && <span className="num absolute -right-0.5 -top-0.5 min-w-[17px] rounded-full bg-danger px-1 text-center text-[10px] font-medium leading-[17px] text-white ring-2 ring-surface">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="glass-strong absolute right-0 z-50 mt-2 w-[min(380px,calc(100vw-24px))] overflow-hidden shadow-float">
          <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
            <p className="text-[13.5px] font-medium">Notificaciones</p>
            {unread > 0 && (
              <button
                className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"
                onClick={async () => {
                  await api.post('/notifications/read-all');
                  reload();
                }}
              >
                <CheckCheck className="h-3.5 w-3.5" /> Marcar todo como leído
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto p-1.5">
            {!data?.items?.length ? (
              <p className="px-4 py-10 text-center text-[12.5px] text-ink-soft">No hay notificaciones. Aquí aparecerán vencimientos, alertas y cambios importantes.</p>
            ) : (
              data.items.map((n) => (
                <button key={n.id} onClick={() => openItem(n)} className={cx('flex w-full gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors hover:bg-brand-ice/60', !n.read_at && 'bg-brand-ice/35')}>
                  <Dot tone={SEVERITY_DOT[n.severity]} className="mt-1.5" pulse={!n.read_at && n.severity === 'critical'} />
                  <span className="min-w-0 flex-1">
                    <span className={cx('block text-[13px] leading-snug', n.read_at ? 'text-ink-soft' : 'font-medium text-ink')}>{n.title}</span>
                    {n.body && <span className="mt-0.5 block truncate text-[12px] text-ink-soft">{n.body}</span>}
                    <span className="mt-0.5 block text-[11px] text-ink-faint">{relative(n.created_at)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IntegrationIndicator() {
  const navigate = useNavigate();
  const { data, reload } = useApi('/integrations/status');
  useInterval(reload, 120_000);
  const tone = !data ? 'mute' : data.failing ? 'danger' : data.connected ? (data.pending ? 'warn' : 'ok') : 'mute';
  const label = !data ? 'Integraciones' : data.failing ? `${data.failing} integración con errores` : `${data.connected} de ${data.items.length} integraciones conectadas`;
  return (
    <Menu
      trigger={({ toggle }) => (
        <button onClick={toggle} className="icon-btn relative" aria-label={label} title={label}>
          <Plug className="h-[18px] w-[18px]" strokeWidth={1.9} />
          <span className="absolute bottom-1.5 right-1.5 rounded-full bg-surface p-[1.5px]">
            <Dot tone={tone} pulse={tone === 'danger'} />
          </span>
        </button>
      )}
      items={[
        ...(data?.items ?? []).map((i) => ({
          label: `${i.name} · ${INTEGRATION_STATUS.label(i.status)}`,
          icon: Plug,
          onClick: () => navigate('/configuracion?tab=integraciones'),
        })),
        { divider: true },
        { label: 'Configurar integraciones', onClick: () => navigate('/configuracion?tab=integraciones') },
      ]}
    />
  );
}

function ThemeToggle() {
  const { mode, resolved, setMode } = useTheme();
  const Icon = resolved === 'dark' ? Moon : Sun;
  const pick = (value, label, icon) => ({ label, icon, hint: mode === value ? '✓' : undefined, onClick: () => setMode(value) });
  return (
    <Menu
      trigger={({ toggle }) => (
        <button onClick={toggle} className="icon-btn" aria-label="Cambiar tema" title="Tema">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
        </button>
      )}
      items={[pick('light', 'Claro', Sun), pick('dark', 'Oscuro', Moon), pick('system', 'Sistema', Monitor)]}
    />
  );
}

export function Topbar({ onMenu, onSearch }) {
  const { user, logout, can } = useAuth();
  const quick = useQuickActions();
  const navigate = useNavigate();
  const createItems = [
    can('clients.write') && { label: 'Nuevo cliente', icon: UserPlus, onClick: () => quick.open('client') },
    can('projects.write') && { label: 'Nuevo proyecto', icon: FolderKanban, onClick: () => quick.open('project') },
    can('finance.write') && { label: 'Crear factura', icon: Receipt, onClick: () => quick.open('invoice') },
    can('finance.write') && { label: 'Registrar pago', icon: CreditCard, onClick: () => quick.open('payment') },
    can('infrastructure.write') && { label: 'Añadir servidor', icon: Server, onClick: () => quick.open('server') },
    can('incidents.write') && { label: 'Crear incidencia', icon: TriangleAlert, onClick: () => quick.open('incident') },
  ].filter(Boolean);

  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5 lg:px-6">
      <div className="glass flex items-center gap-2 rounded-[20px] px-2.5 py-2 sm:gap-3 sm:px-3">
        <button className="icon-btn lg:hidden" onClick={onMenu} aria-label="Abrir menú">
          <MenuIcon className="h-5 w-5" />
        </button>
        <button onClick={onSearch} className="group flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-[14px] border border-line/80 bg-surface/70 px-3 text-left text-[13px] text-ink-faint transition-all hover:border-brand/30 hover:bg-surface md:max-w-[440px]" aria-label="Búsqueda global">
          <Search className="h-4 w-4 shrink-0 text-ink-soft" />
          <span className="truncate">Buscar clientes, proyectos, facturas, servidores…</span>
          <span className="kbd ml-auto hidden sm:inline">Ctrl K</span>
        </button>
        <p className="hidden whitespace-nowrap text-[12.5px] font-medium text-ink-soft xl:block">{longDate()}</p>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          {can('infrastructure.read') && <IntegrationIndicator />}
          <Notifications />
          {createItems.length > 0 && (
            <Menu
              trigger={({ toggle }) => (
                <button className="btn-primary ml-1 px-3 sm:px-3.5" onClick={toggle} aria-label="Crear nuevo">
                  <Plus className="h-4 w-4" strokeWidth={2.2} />
                  <span className="hidden sm:inline">Nuevo</span>
                </button>
              )}
              items={createItems}
            />
          )}
          <Menu
            trigger={({ toggle }) => (
              <button onClick={toggle} className="ml-1 rounded-full ring-offset-2 transition hover:ring-2 hover:ring-brand/30" aria-label="Menú de usuario">
                <Avatar name={user?.name} size={34} />
              </button>
            )}
            items={[
              { label: user?.email ?? '', disabled: true, onClick: () => {} },
              { divider: true },
              { label: 'Mi cuenta y seguridad', onClick: () => navigate('/configuracion?tab=cuenta') },
              { label: 'Cerrar sesión', danger: true, onClick: logout },
            ]}
          />
        </div>
      </div>
      <Link to="/" className="sr-only">
        Ir al inicio
      </Link>
    </header>
  );
}
