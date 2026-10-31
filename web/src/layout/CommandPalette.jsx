import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, CreditCard, FolderKanban, Globe, Receipt, Search, Server, TriangleAlert, UserPlus, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { useDebounced } from '../lib/hooks.js';
import { money } from '../lib/format.js';
import { Spinner, cx } from '../components/ui.jsx';
import { useQuickActions } from './QuickActions.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const TYPE = {
  client: { label: 'Clientes', icon: Users },
  project: { label: 'Proyectos', icon: FolderKanban },
  invoice: { label: 'Facturas', icon: Receipt },
  server: { label: 'Servidores', icon: Server },
  domain: { label: 'Dominios', icon: Globe },
  incident: { label: 'Incidencias', icon: TriangleAlert },
};

export function CommandPalette({ open, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const debounced = useDebounced(q, 200);
  const navigate = useNavigate();
  const input = useRef(null);
  const quick = useQuickActions();
  const { can } = useAuth();

  useEffect(() => {
    if (open) {
      setQ('');
      setResults([]);
      setIndex(0);
      setTimeout(() => input.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    if (debounced.trim().length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    setLoading(true);
    api
      .get('/search', { q: debounced })
      .then((r) => alive && (setResults(r.results), setIndex(0)))
      .catch(() => alive && setResults([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [debounced]);

  const actions = useMemo(
    () =>
      [
        can('clients.write') && { type: 'action', title: 'Nuevo cliente', icon: UserPlus, run: () => quick.open('client') },
        can('projects.write') && { type: 'action', title: 'Nuevo proyecto', icon: FolderKanban, run: () => quick.open('project') },
        can('finance.write') && { type: 'action', title: 'Crear factura', icon: Receipt, run: () => quick.open('invoice') },
        can('finance.write') && { type: 'action', title: 'Registrar pago', icon: CreditCard, run: () => quick.open('payment') },
        can('infrastructure.write') && { type: 'action', title: 'Añadir servidor', icon: Server, run: () => quick.open('server') },
        can('incidents.write') && { type: 'action', title: 'Crear incidencia', icon: TriangleAlert, run: () => quick.open('incident') },
      ].filter(Boolean),
    [can, quick],
  );

  const items = q.trim().length >= 2 ? results : actions;
  const select = (item) => {
    onClose();
    if (item.run) item.run();
    else navigate(item.link);
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && items[index]) {
      select(items[index]);
    } else if (e.key === 'Escape') onClose();
  };

  if (!open) return null;
  let lastType = null;
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-start justify-center px-3 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Búsqueda global">
      <div className="absolute inset-0 bg-[#172033]/20 backdrop-blur-[3px]" onClick={onClose} />
      <div className="glass-strong relative w-full max-w-[620px] overflow-hidden shadow-float">
        <div className="flex items-center gap-3 border-b border-line/70 px-4">
          <Search className="h-[18px] w-[18px] text-ink-soft" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Busca clientes, proyectos, facturas, servidores o dominios…"
            className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
            aria-label="Texto de búsqueda"
          />
          {loading && <Spinner className="h-4 w-4 text-ink-soft" />}
          <span className="kbd">Esc</span>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {q.trim().length < 2 && <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">Acciones rápidas</p>}
          {q.trim().length >= 2 && !loading && !results.length && <p className="px-4 py-10 text-center text-[13px] text-ink-soft">Sin resultados para «{q}»</p>}
          {items.map((item, i) => {
            const meta = TYPE[item.type];
            const Icon = item.icon ?? meta?.icon;
            const header = item.type !== 'action' && item.type !== lastType ? meta?.label : null;
            lastType = item.type;
            return (
              <div key={`${item.type}-${item.id ?? item.title}`}>
                {header && <p className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint">{header}</p>}
                <button
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => select(item)}
                  className={cx('flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left', i === index ? 'bg-brand-ice/80' : 'hover:bg-brand-ice/40')}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-surface text-brand shadow-[0_1px_2px_rgba(23,32,51,0.08)]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink">{item.title}</span>
                    {item.subtitle && <span className="block truncate text-[12px] text-ink-soft">{item.subtitle}</span>}
                  </span>
                  {item.amount_cents != null && <span className="num text-[12.5px] text-ink-soft">{money(item.amount_cents)}</span>}
                  {i === index && <CornerDownLeft className="h-3.5 w-3.5 text-ink-faint" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
