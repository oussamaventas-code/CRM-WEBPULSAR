import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppWindow, Building2, Cloud, Database, FolderKanban, Globe, Map as MapIcon, Server } from 'lucide-react';
import { useApi, useLookups } from '../../lib/hooks.js';
import { EmptyState, Glass, Select, Skeleton, cx } from '../../components/ui.jsx';

// Mapa de relaciones: CLIENTE → PROYECTO → DOMINIO → VPS → APLICACIÓN → CLOUDFLARE → BASE DE DATOS
const COLUMNS = [
  { type: 'client', label: 'Cliente', icon: Building2 },
  { type: 'project', label: 'Proyecto', icon: FolderKanban },
  { type: 'domain', label: 'Dominio', icon: Globe },
  { type: 'server', label: 'Hostinger VPS', icon: Server },
  { type: 'application', label: 'Aplicación', icon: AppWindow },
  { type: 'cloudflare', label: 'Cloudflare', icon: Cloud },
  { type: 'database', label: 'Base de datos', icon: Database },
];
const STATUS_RING = { operational: 'bg-ok', warning: 'bg-warn', down: 'bg-danger', unknown: 'bg-track' };
const STATUS_TEXT = { operational: 'Operativo', warning: 'Advertencia', down: 'Incidencia', unknown: 'Sin verificar' };

function linkFor(n) {
  switch (n.type) {
    case 'client': return `/clientes/${n.id}`;
    case 'project': return `/proyectos/${n.id}`;
    case 'domain': return `/infraestructura/dominios/${n.id}`;
    case 'server': return `/infraestructura/servidores/${n.id}`;
    case 'cloudflare': return `/infraestructura/dominios/${n.domain_id ?? n.id}`;
    case 'application': return '/infraestructura?tab=aplicaciones';
    case 'database': return '/infraestructura?tab=bases';
    default: return '/infraestructura';
  }
}

export function InfraMap() {
  const [clientId, setClientId] = useState('');
  const lk = useLookups(['clients']);
  const { data, loading } = useApi('/infrastructure/map', { client_id: clientId });
  const navigate = useNavigate();
  const container = useRef(null);
  const nodeRefs = useRef({});
  const [paths, setPaths] = useState([]);
  const [hover, setHover] = useState(null);

  const nodes = data?.nodes ?? [];
  const edges = data?.edges ?? [];

  const connected = useMemo(() => {
    if (!hover) return null;
    const set = new Set([hover]);
    const walk = (dir) => {
      const queue = [hover];
      while (queue.length) {
        const cur = queue.shift();
        for (const e of edges) {
          const [from, to] = dir === 'down' ? [e.from, e.to] : [e.to, e.from];
          if (from === cur && !set.has(to)) {
            set.add(to);
            queue.push(to);
          }
        }
      }
    };
    walk('down');
    walk('up');
    return set;
  }, [hover, edges]);

  const measure = useCallback(() => {
    const box = container.current?.getBoundingClientRect();
    if (!box) return;
    const out = [];
    for (const e of edges) {
      const a = nodeRefs.current[e.from]?.getBoundingClientRect();
      const b = nodeRefs.current[e.to]?.getBoundingClientRect();
      if (!a || !b) continue;
      const forward = b.left >= a.left;
      const x1 = (forward ? a.right : a.left) - box.left + container.current.scrollLeft;
      const y1 = a.top + a.height / 2 - box.top;
      const x2 = (forward ? b.left : b.right) - box.left + container.current.scrollLeft;
      const y2 = b.top + b.height / 2 - box.top;
      const dx = Math.max(30, Math.abs(x2 - x1) / 2);
      out.push({ key: `${e.from}>${e.to}`, from: e.from, to: e.to, kind: e.kind, d: `M${x1},${y1} C${x1 + (forward ? dx : -dx)},${y1} ${x2 - (forward ? dx : -dx)},${y2} ${x2},${y2}` });
    }
    setPaths(out);
  }, [edges]);

  useLayoutEffect(() => {
    measure();
  }, [measure, nodes.length]);

  useEffect(() => {
    if (!container.current) return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(container.current);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select className="sm:w-72" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Todos los clientes" options={(lk.clients ?? []).map((c) => ({ value: c.id, label: c.label }))} />
        <div className="flex flex-wrap gap-3 text-[11.5px] text-ink-soft">
          {Object.entries(STATUS_TEXT).map(([k, label]) => (
            <span key={k} className="inline-flex items-center gap-1.5"><span className={cx('h-2 w-2 rounded-full', STATUS_RING[k])} />{label}</span>
          ))}
          <span>· Pasa el cursor para resaltar la cadena de dependencias; pulsa para abrir la ficha.</span>
        </div>
      </div>
      <Glass className="overflow-hidden">
        {loading && !data ? (
          <Skeleton className="m-5 h-80 rounded-2xl" />
        ) : nodes.length === 0 ? (
          <EmptyState icon={MapIcon} title="Nada que dibujar todavía" description="Vincula proyectos, dominios, servidores, aplicaciones y bases de datos a tus clientes para ver sus relaciones." />
        ) : (
          <div ref={container} className="relative overflow-x-auto p-5" onScroll={measure}>
            <svg className="pointer-events-none absolute left-0 top-0 h-full" style={{ width: container.current?.scrollWidth ?? '100%' }} aria-hidden>
              {paths.map((p) => {
                const lit = connected && connected.has(p.from) && connected.has(p.to);
                return (
                  <path
                    key={p.key}
                    d={p.d}
                    fill="none"
                    stroke={lit ? 'rgb(var(--c-brand))' : 'rgb(var(--c-mute) / 0.6)'}
                    strokeWidth={lit ? 2 : 1.4}
                    strokeDasharray={p.kind !== 'fk' ? '4 4' : undefined}
                    opacity={connected && !lit ? 0.25 : 1}
                    className="transition-[stroke,opacity] duration-200"
                  />
                );
              })}
            </svg>
            <div className="relative grid min-w-[1180px] grid-cols-7 gap-6">
              {COLUMNS.map((col) => (
                <div key={col.type}>
                  <p className="mb-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-soft">
                    <col.icon className="h-3.5 w-3.5" /> {col.label}
                  </p>
                  <div className="flex flex-col gap-2.5">
                    {nodes.filter((n) => n.type === col.type).map((n) => (
                      <button
                        key={n.key}
                        ref={(el) => (nodeRefs.current[n.key] = el)}
                        onMouseEnter={() => setHover(n.key)}
                        onMouseLeave={() => setHover(null)}
                        onFocus={() => setHover(n.key)}
                        onBlur={() => setHover(null)}
                        onClick={() => navigate(linkFor(n))}
                        title={n.label}
                        className={cx(
                          'relative z-[1] rounded-[14px] border bg-surface/90 px-3 py-2 text-left shadow-[0_1px_2px_rgba(23,32,51,0.06)] transition-all duration-200',
                          connected?.has(n.key) ? 'border-brand/40 shadow-[0_6px_16px_-8px_rgba(37,99,235,0.5)]' : 'border-surface',
                          connected && !connected.has(n.key) && 'opacity-40',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          {col.type !== 'client' && <span className={cx('h-2 w-2 shrink-0 rounded-full', STATUS_RING[n.status] ?? STATUS_RING.unknown)} title={STATUS_TEXT[n.status] ?? ''} />}
                          <span className="truncate text-[12.5px] font-medium">{n.label}</span>
                        </span>
                        {n.detail && <span className="mono mt-0.5 block truncate text-[10.5px] text-ink-soft">{n.detail}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Glass>
    </div>
  );
}
