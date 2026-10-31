import { NavLink } from 'react-router-dom';
import { LogOut, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Avatar, Dot, cx } from '../components/ui.jsx';
import { NAV } from './nav.js';
import { Wordmark } from './Logo.jsx';

function NavItems({ collapsed, counts, onNavigate }) {
  const { can } = useAuth();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Navegación principal">
      {NAV.filter((n) => !n.perm || can(n.perm)).map((item) => {
        const count = item.badge ? counts?.[item.badge] : null;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cx(
                'group relative flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-[13.5px] font-medium transition-all duration-200',
                collapsed && 'justify-center px-0',
                isActive ? 'bg-surface text-brand-deep shadow-[0_1px_2px_rgba(23,32,51,0.06),0_6px_16px_-8px_rgba(23,59,114,0.25)]' : 'text-ink-soft hover:bg-surface/60 hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand" aria-hidden />}
                <item.icon className={cx('h-[18px] w-[18px] shrink-0', isActive ? 'text-brand' : 'text-ink-soft group-hover:text-ink')} strokeWidth={1.9} />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                {count > 0 &&
                  (collapsed ? (
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger ring-2 ring-surface" />
                  ) : (
                    <span className="num rounded-full bg-danger px-1.5 text-[10.5px] font-medium text-white">{count}</span>
                  ))}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

function ProfileCard({ collapsed }) {
  const { user, logout, expiresAt } = useAuth();
  const expires = expiresAt ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(expiresAt)) : null;
  return (
    <div className={cx('rounded-[18px] border border-surface/80 bg-surface/55 p-2.5', collapsed && 'flex flex-col items-center gap-2 px-1.5')}>
      <div className={cx('flex items-center gap-2.5', collapsed && 'flex-col')}>
        <div className="relative">
          <Avatar name={user?.name} size={34} />
          <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-surface p-[2px]">
            <Dot tone="ok" />
          </span>
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink">{user?.name}</p>
            <p className="truncate text-[11px] text-ink-soft">
              {user?.is_owner ? 'Administrador principal' : user?.role_name}
              {expires && ` · hasta ${expires}`}
            </p>
          </div>
        )}
        <button onClick={logout} className="icon-btn h-8 w-8" title="Cerrar sesión" aria-label="Cerrar sesión">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function Sidebar({ collapsed, onToggle, counts }) {
  return (
    <aside className={cx('fixed inset-y-0 left-0 z-40 hidden p-3 transition-[width] duration-300 ease-out lg:block', collapsed ? 'w-[92px]' : 'w-[272px]')}>
      <div className="glass flex h-full flex-col rounded-panel px-3 pb-3 pt-5">
        <div className={cx('mb-6 flex items-center px-2', collapsed ? 'justify-center' : 'justify-between')}>
          <Wordmark collapsed={collapsed} />
        </div>
        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          <NavItems collapsed={collapsed} counts={counts} />
        </div>
        <button onClick={onToggle} className={cx('btn-ghost mb-2 mt-3 w-full justify-start text-[12.5px]', collapsed && 'justify-center')} aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}>
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && 'Contraer menú'}
        </button>
        <ProfileCard collapsed={collapsed} />
      </div>
    </aside>
  );
}

export function MobileDrawer({ open, onClose, counts }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] lg:hidden">
      <div className="absolute inset-0 bg-[#172033]/25 backdrop-blur-[2px]" onClick={onClose} />
      <div className="glass-strong absolute inset-y-2 left-2 flex w-[min(300px,85vw)] flex-col rounded-panel px-3 pb-3 pt-5">
        <div className="mb-5 flex items-center justify-between px-2">
          <Wordmark />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar menú">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavItems counts={counts} onNavigate={onClose} />
        </div>
        <ProfileCard />
      </div>
    </div>
  );
}
