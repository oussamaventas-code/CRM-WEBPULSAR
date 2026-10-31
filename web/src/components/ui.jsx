import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, CircleAlert, LoaderCircle, RefreshCw, Search } from 'lucide-react';
import { initials } from '../lib/format.js';

export const cx = (...c) => c.filter(Boolean).join(' ');

export function Glass({ as: Tag = 'div', strong = false, className, children, ...rest }) {
  return (
    <Tag className={cx(strong ? 'glass-strong' : 'glass', 'sheen', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function Spinner({ className = 'h-4 w-4' }) {
  return <LoaderCircle className={cx('animate-spin', className)} aria-hidden />;
}

export const Button = forwardRef(function Button({ variant = 'primary', size, icon: Icon, loading = false, className, children, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={cx(`btn-${variant}`, size === 'sm' && 'btn-sm', className)} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Spinner className="h-[15px] w-[15px]" /> : Icon && <Icon className="h-[15px] w-[15px]" strokeWidth={2} />}
      {children}
    </button>
  );
});

export function IconButton({ icon: Icon, label, className, ...rest }) {
  return (
    <button type="button" className={cx('icon-btn', className)} aria-label={label} title={label} {...rest}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
    </button>
  );
}

const TONES = {
  ok: 'bg-ok-soft text-ok-ink',
  warn: 'bg-warn-soft text-warn-ink',
  danger: 'bg-danger-soft text-danger-ink',
  mute: 'bg-mute-soft text-ink-soft',
  brand: 'bg-brand-ice text-brand-deep',
  violet: 'bg-violet-soft text-violet-ink',
};
const DOTS = { ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', mute: 'bg-mute', brand: 'bg-brand', violet: 'bg-violet' };

export function Dot({ tone = 'mute', pulse = false, className }) {
  return (
    <span className={cx('relative inline-flex h-2 w-2 shrink-0', className)} aria-hidden>
      {pulse && <span className={cx('absolute inset-0 rounded-full animate-pulsering', DOTS[tone])} />}
      <span className={cx('relative inline-flex h-2 w-2 rounded-full', DOTS[tone])} />
    </span>
  );
}

export function Badge({ tone = 'mute', dot = false, className, children }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium', TONES[tone], className)}>
      {dot && <Dot tone={tone} />}
      {children}
    </span>
  );
}

/** Badge a partir de un conjunto de etiquetas (lib/labels.js). */
export function LabelBadge({ set, value, dot = true, className }) {
  if (value == null) return <span className="text-ink-faint">—</span>;
  return (
    <Badge tone={set.tone(value)} dot={dot} className={className}>
      {set.label(value)}
    </Badge>
  );
}

export function DemoTag() {
  return <span className="rounded-md bg-violet-soft px-1.5 py-[1px] font-mono text-[10px] font-medium uppercase tracking-wider text-violet-ink">Demo</span>;
}

export function Skeleton({ className }) {
  return <div className={cx('skeleton', className)} />;
}

export function EmptyState({ icon: Icon, title, description, action, className, compact = false }) {
  return (
    <div className={cx('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      {Icon && (
        <div className="relative mb-4">
          <div className="absolute inset-0 -m-3 rounded-full bg-brand-ice/70 blur-xl" />
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-surface bg-gradient-to-b from-surface to-brand-ice text-brand shadow-glass">
            <Icon className="h-[22px] w-[22px]" strokeWidth={1.7} />
          </div>
        </div>
      )}
      <p className="text-[14.5px] font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-ink-soft">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <CircleAlert className="mb-3 h-6 w-6 text-danger" />
      <p className="text-[13.5px] font-medium">No se pudieron cargar los datos</p>
      <p className="mt-1 text-[12.5px] text-ink-soft">{error?.status === 403 ? 'No tienes permiso para ver esta información.' : error?.message}</p>
      {onRetry && error?.status !== 403 && (
        <Button variant="secondary" size="sm" icon={RefreshCw} className="mt-4" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

const AVATAR_BG = ['from-[#60A5FA] to-[#2563EB]', 'from-[#A78BFA] to-[#8067E8]', 'from-[#34D399] to-[#16A36A]', 'from-[#7DD3FC] to-[#173B72]'];
export function Avatar({ name, size = 32, className }) {
  const idx = [...(name ?? '')].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_BG.length;
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35)]', AVATAR_BG[idx], className)}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Progress({ value = 0, tone = 'brand', className }) {
  const color = { brand: 'from-brand-light to-brand', ok: 'from-[#4ADE80] to-ok', warn: 'from-[#FCD34D] to-warn', danger: 'from-[#FB7185] to-danger' }[tone];
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-track', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full bg-gradient-to-r transition-[width] duration-500', color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  const refs = useRef({});
  const [indicator, setIndicator] = useState(null);
  useLayoutEffect(() => {
    const el = refs.current[value];
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, tabs.length]);
  return (
    <div className={cx('no-scrollbar relative -mx-1 overflow-x-auto px-1 py-1', className)}>
      <div className="glass relative inline-flex min-w-max gap-1 !rounded-[16px] p-1" role="tablist">
        {indicator && <span className="absolute bottom-1 top-1 rounded-[11px] bg-surface shadow-[0_1px_3px_rgba(23,32,51,0.10),0_4px_12px_-6px_rgba(23,59,114,0.18)] transition-all duration-300 ease-out" style={indicator} />}
        {tabs.map((t) => (
          <button
            key={t.key}
            ref={(el) => (refs.current[t.key] = el)}
            role="tab"
            aria-selected={value === t.key}
            onClick={() => onChange(t.key)}
            className={cx('relative z-[1] inline-flex items-center gap-1.5 rounded-[11px] px-3 py-1.5 text-[12.5px] font-medium transition-colors duration-200', value === t.key ? 'text-ink' : 'text-ink-soft hover:text-ink')}
          >
            {t.icon && <t.icon className="h-[15px] w-[15px]" strokeWidth={1.9} />}
            {t.label}
            {t.count != null && t.count > 0 && <span className={cx('rounded-full px-1.5 text-[10.5px] num', t.alert ? 'bg-danger text-white' : 'bg-brand-ice text-brand-deep')}>{t.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, eyebrow, actions, back, meta }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link to={back.to} className="mb-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-soft hover:text-brand">
            <ArrowLeft className="h-3.5 w-3.5" /> {back.label}
          </Link>
        )}
        {eyebrow && <p className="mb-1 text-[11.5px] font-medium uppercase tracking-[0.12em] text-brand">{eyebrow}</p>}
        <h1 className="truncate text-[26px] font-medium leading-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[13.5px] text-ink-soft">{subtitle}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, subtitle, icon: Icon, actions, children, className, bodyClassName, flush = false }) {
  return (
    <Glass className={cx('flex flex-col', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && <Icon className="h-[17px] w-[17px] text-brand" strokeWidth={1.9} />}
            <div className="min-w-0">
              <h2 className="truncate text-[14.5px] font-medium">{title}</h2>
              {subtitle && <p className="truncate text-[12px] text-ink-soft">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={cx(flush ? '' : 'px-5 pb-5 pt-3', 'flex-1', bodyClassName)}>{children}</div>
    </Glass>
  );
}

export function Field({ label, error, hint, children, className, htmlFor }) {
  return (
    <div className={className}>
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {error ? <p className="mt-1 text-[11.5px] text-danger">{error}</p> : hint ? <p className="mt-1 text-[11.5px] text-ink-faint">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} className={cx('input', className)} aria-invalid={invalid ? 'true' : undefined} {...rest} />;
});

export const Textarea = forwardRef(function Textarea({ className, invalid, rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cx('input resize-y', className)} aria-invalid={invalid ? 'true' : undefined} {...rest} />;
});

export const Select = forwardRef(function Select({ className, invalid, options = [], placeholder, ...rest }, ref) {
  return (
    <select ref={ref} className={cx('input', className)} aria-invalid={invalid ? 'true' : undefined} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
});

export function Switch({ checked, onChange, label, description, disabled }) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-3', disabled && 'cursor-not-allowed opacity-60')}>
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200', checked ? 'bg-brand' : 'bg-track')}
      >
        <span className={cx('absolute top-[3px] h-4 w-4 rounded-full bg-surface shadow transition-transform duration-200', checked ? 'translate-x-[19px]' : 'translate-x-[3px]')} />
      </button>
      {(label || description) && (
        <span>
          <span className="block text-[13px] font-medium text-ink">{label}</span>
          {description && <span className="block text-[12px] text-ink-soft">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…', className }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
      <input className="input pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} type="search" />
    </div>
  );
}

export function Stat({ label, value, mono = false, className, children }) {
  return (
    <div className={className}>
      <dt className="text-[11.5px] font-medium uppercase tracking-[0.04em] text-ink-soft">{label}</dt>
      <dd className={cx('mt-1 text-[13.5px] text-ink', mono && 'mono')}>{children ?? (value === null || value === undefined || value === '' ? <span className="text-ink-faint">—</span> : value)}</dd>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between border-t border-line/70 px-4 py-2.5 text-[12px] text-ink-soft">
      <span className="num">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
      </span>
      <div className="flex items-center gap-1">
        <IconButton icon={ChevronLeft} label="Página anterior" disabled={page <= 1} onClick={() => onPage(page - 1)} className="h-8 w-8 disabled:opacity-40" />
        <span className="num px-1">
          {page} / {pages}
        </span>
        <IconButton icon={ChevronRight} label="Página siguiente" disabled={page >= pages} onClick={() => onPage(page + 1)} className="h-8 w-8 disabled:opacity-40" />
      </div>
    </div>
  );
}

/** Menú desplegable simple: cierra al hacer clic fuera o pulsar Escape. */
export function Menu({ trigger, items, align = 'right', className }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className={cx('relative', className)} ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div className={cx('glass-strong absolute z-50 mt-2 min-w-[220px] p-1.5 shadow-float', align === 'right' ? 'right-0' : 'left-0')} role="menu">
          {items.filter(Boolean).map((item, i) =>
            item.divider ? (
              <div key={i} className="my-1 h-px bg-line" />
            ) : (
              <button
                key={item.label}
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={cx('flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] transition-colors disabled:opacity-40', item.danger ? 'text-danger hover:bg-danger-soft' : 'text-ink hover:bg-brand-ice/70')}
              >
                {item.icon && <item.icon className={cx('h-4 w-4', item.danger ? '' : 'text-ink-soft')} strokeWidth={1.9} />}
                <span className="flex-1">{item.label}</span>
                {item.hint && <span className="text-[11px] text-ink-faint">{item.hint}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.value} type="button" className="chip" aria-pressed={value === o.value} onClick={() => onChange(value === o.value && o.value !== '' ? '' : o.value)}>
          {o.icon && <o.icon className="h-3.5 w-3.5" />}
          {o.label}
          {o.count != null && <span className="num text-[11px] opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Notice({ tone = 'brand', icon: Icon = CircleAlert, title, children, className }) {
  const styles = { brand: 'border-brand/15 bg-brand-ice/60 text-brand-deep', warn: 'border-warn/25 bg-warn-soft text-warn-ink', danger: 'border-danger/20 bg-danger-soft text-danger-ink', ok: 'border-ok/20 bg-ok-soft text-ok-ink' }[tone];
  return (
    <div className={cx('flex gap-3 rounded-[16px] border px-4 py-3 text-[12.5px]', styles, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>
      </div>
    </div>
  );
}
