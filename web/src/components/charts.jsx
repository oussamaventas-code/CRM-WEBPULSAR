import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { cx } from './ui.jsx';
import { money, moneyCompact } from '../lib/format.js';
import { settle, skipMotion } from '../lib/motion.js';

// Paleta de series validada (CVD y contraste) — ver tailwind.config.js → colors.series
export const SERIES = {
  collected: { label: 'Cobrado', color: '#2563EB', mark: 'bar' },
  pending: { label: 'Pendiente', color: '#D97706', mark: 'bar' },
  expenses: { label: 'Gastos', color: '#8067E8', mark: 'line' },
  profit: { label: 'Beneficio estimado', color: '#0D9488', mark: 'line', dashed: true },
};

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Anima la entrada de un gráfico cuando entra en el viewport (una vez), con gsap.context y revert. */
function useRevealChart(scope, ready) {
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current || !scope.current) return undefined;
    if (skipMotion()) return undefined;
    let ctx;
    let cancelSettle = () => {};
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      done.current = true;
      ctx = gsap.context(() => {
        gsap.from('[data-bar]', { scaleY: 0, transformOrigin: '50% 100%', duration: 0.6, ease: 'power3.out', stagger: 0.012 });
        scope.current.querySelectorAll('[data-line]').forEach((path) => {
          const len = path.getTotalLength();
          if (path.getAttribute('stroke-dasharray')) {
            gsap.from(path, { opacity: 0, duration: 0.6, delay: 0.25 });
          } else {
            gsap.fromTo(path, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.out', delay: 0.15, clearProps: 'strokeDasharray,strokeDashoffset' });
          }
        });
      }, scope);
      cancelSettle = settle(() => ctx?.revert(), 1500);
    }, { threshold: 0.25 });
    io.observe(scope.current);
    return () => {
      io.disconnect();
      cancelSettle();
      ctx?.revert();
    };
  }, [scope, ready]);
}

function niceTicks(min, max, count = 4) {
  if (max === min) max = min + 1;
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

const roundedTop = (x, y, w, h, r = 4) => {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
};

const BUCKET_FMT = {
  day: new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }),
  week: new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }),
  month: new Intl.DateTimeFormat('es-ES', { month: 'short', year: '2-digit' }),
};
const bucketLabel = (b, bucket) => BUCKET_FMT[bucket].format(new Date(`${b.start}T12:00:00`)).replace('.', '');
const bucketLong = (b, bucket) =>
  bucket === 'day' ? new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'long' }).format(new Date(`${b.start}T12:00:00`)) : bucket === 'week' ? `Semana del ${bucketLabel(b, 'day')}` : new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date(`${b.start}T12:00:00`));

export function Legend({ keys, totals }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {keys.map((k) => {
        const s = SERIES[k];
        return (
          <div key={k} className="flex items-center gap-2">
            {s.mark === 'bar' ? (
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
            ) : (
              <svg width="16" height="4" aria-hidden>
                <line x1="0" y1="2" x2="16" y2="2" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '4 3' : undefined} strokeLinecap="round" />
              </svg>
            )}
            <span className="text-[12px] text-ink-soft">{s.label}</span>
            {totals && <span className="num text-[12.5px] font-medium text-ink">{money(totals[k], { short: true })}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Ingresos cobrados y pendientes (barras), gastos y beneficio (líneas). Un único eje en euros. */
export function FinanceChart({ data, height = 260, showTable = false }) {
  const [wrapRef, width] = useWidth();
  const svgRef = useRef(null);
  const [active, setActive] = useState(null);
  const series = data?.series ?? [];
  const bucket = data?.bucket ?? 'day';

  const geo = useMemo(() => {
    if (!width || !series.length) return null;
    const pad = { l: 58, r: 12, t: 12, b: 26 };
    const iw = width - pad.l - pad.r;
    const ih = height - pad.t - pad.b;
    const values = series.flatMap((b) => [b.collected, b.pending, b.expenses, b.profit]);
    const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 4);
    const y0 = ticks[0];
    const y1 = ticks[ticks.length - 1];
    const y = (v) => pad.t + ih - ((v - y0) / (y1 - y0)) * ih;
    const band = iw / series.length;
    const group = Math.min(band * 0.62, 34);
    const barW = Math.max(2, (group - 2) / 2);
    const cx0 = (i) => pad.l + band * i + band / 2;
    const line = (key) => series.map((b, i) => `${i ? 'L' : 'M'}${cx0(i).toFixed(1)},${y(b[key]).toFixed(1)}`).join('');
    const every = Math.ceil(series.length / Math.max(2, Math.floor(iw / 64)));
    return { pad, iw, ih, ticks, y, band, barW, cx0, line, every };
  }, [width, height, series]);

  useRevealChart(svgRef, !!geo);

  if (!series.length) return null;
  const tip = active != null && geo ? series[active] : null;

  return (
    <div>
      {showTable ? (
        <div className="table-wrap max-h-[300px]">
          <table className="table">
            <thead>
              <tr>
                <th>Periodo</th>
                {Object.keys(SERIES).map((k) => (
                  <th key={k} className="text-right">
                    {SERIES[k].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((b) => (
                <tr key={b.start}>
                  <td className="capitalize">{bucketLong(b, bucket)}</td>
                  {Object.keys(SERIES).map((k) => (
                    <td key={k} className="num text-right">
                      {money(b[k])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrapRef} className="relative w-full" style={{ height }}>
          {geo && (
            <svg ref={svgRef} width={width} height={height} className="block overflow-visible" role="img" aria-label="Evolución de ingresos, gastos y beneficio">
              {geo.ticks.map((t) => (
                <g key={t}>
                  <line x1={geo.pad.l} x2={width - geo.pad.r} y1={geo.y(t)} y2={geo.y(t)} stroke={t === 0 ? 'rgb(var(--c-mute) / 0.55)' : 'rgb(var(--c-line))'} strokeDasharray={t === 0 ? undefined : '2 4'} />
                  <text x={geo.pad.l - 10} y={geo.y(t)} dy="0.32em" textAnchor="end" className="fill-ink-soft text-[11px] num">
                    {moneyCompact(t)}
                  </text>
                </g>
              ))}
              {active != null && <rect x={geo.pad.l + geo.band * active + 1} y={geo.pad.t} width={geo.band - 2} height={geo.ih} rx="8" fill="rgb(var(--c-brand-ice))" opacity="0.7" />}
              {series.map((b, i) => {
                const x = geo.cx0(i) - geo.barW - 1;
                return (
                  <g key={b.start}>
                    <path data-bar d={roundedTop(x, geo.y(Math.max(0, b.collected)), geo.barW, geo.y(0) - geo.y(Math.max(0, b.collected)))} fill={SERIES.collected.color} />
                    <path data-bar d={roundedTop(x + geo.barW + 2, geo.y(Math.max(0, b.pending)), geo.barW, geo.y(0) - geo.y(Math.max(0, b.pending)))} fill={SERIES.pending.color} opacity="0.9" />
                  </g>
                );
              })}
              <path data-line d={geo.line('expenses')} fill="none" stroke={SERIES.expenses.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <path data-line d={geo.line('profit')} fill="none" stroke={SERIES.profit.color} strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
              {tip && (
                <>
                  {['expenses', 'profit'].map((k) => (
                    <circle key={k} cx={geo.cx0(active)} cy={geo.y(tip[k])} r="4.5" fill={SERIES[k].color} stroke="rgb(var(--c-surface))" strokeWidth="2" />
                  ))}
                </>
              )}
              {series.map((b, i) =>
                i % geo.every === 0 ? (
                  <text key={b.start} x={geo.cx0(i)} y={height - 6} textAnchor="middle" className="fill-ink-soft text-[11px]">
                    {bucketLabel(b, bucket)}
                  </text>
                ) : null,
              )}
              {series.map((b, i) => (
                <rect
                  key={`hit-${b.start}`}
                  x={geo.pad.l + geo.band * i}
                  y={geo.pad.t}
                  width={geo.band}
                  height={geo.ih}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${bucketLong(b, bucket)}: cobrado ${money(b.collected)}, pendiente ${money(b.pending)}, gastos ${money(b.expenses)}, beneficio ${money(b.profit)}`}
                  onPointerEnter={() => setActive(i)}
                  onPointerMove={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                  onBlur={() => setActive(null)}
                />
              ))}
            </svg>
          )}
          {tip && (
            <div
              className="glass-strong pointer-events-none absolute z-10 w-[210px] px-3.5 py-3 text-[12px] shadow-float"
              style={{ left: Math.min(Math.max(geo.cx0(active) - 105, 0), width - 210), top: 0 }}
            >
              <p className="mb-2 font-medium capitalize text-ink">{bucketLong(tip, bucket)}</p>
              {Object.keys(SERIES).map((k) => (
                <div key={k} className="flex items-center justify-between gap-3 py-0.5">
                  <span className="flex items-center gap-2 text-ink-soft">
                    <svg width="12" height="4" aria-hidden>
                      <line x1="0" y1="2" x2="12" y2="2" stroke={SERIES[k].color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={SERIES[k].dashed ? '3 2' : undefined} />
                    </svg>
                    {SERIES[k].label}
                  </span>
                  <span className="num font-medium text-ink">{money(tip[k])}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Serie temporal de métricas (CPU, RAM, disco…) con cruceta y tooltip. Un eje, mismas unidades. */
export function MetricChart({ points, lines, height = 180, max, format = (v) => `${Math.round(v)} %`, timeFormat }) {
  const [wrapRef, width] = useWidth();
  const svgRef = useRef(null);
  const [active, setActive] = useState(null);
  const fmtTime = timeFormat ?? ((iso) => new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso)));

  const geo = useMemo(() => {
    if (!width || points.length < 2) return null;
    const pad = { l: 44, r: 10, t: 10, b: 22 };
    const iw = width - pad.l - pad.r;
    const ih = height - pad.t - pad.b;
    const values = points.flatMap((p) => lines.map((l) => l.value(p))).filter((v) => v != null);
    const top = max ?? Math.max(1, ...values) * 1.1;
    const ticks = niceTicks(0, top, 3);
    const yMax = ticks[ticks.length - 1];
    const t0 = Date.parse(points[0].collected_at);
    const t1 = Date.parse(points[points.length - 1].collected_at);
    const x = (p) => pad.l + ((Date.parse(p.collected_at) - t0) / Math.max(1, t1 - t0)) * iw;
    const y = (v) => pad.t + ih - (v / yMax) * ih;
    const path = (l) => {
      let d = '';
      let pen = false;
      for (const p of points) {
        const v = l.value(p);
        if (v == null) {
          pen = false;
          continue;
        }
        d += `${pen ? 'L' : 'M'}${x(p).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      }
      return d;
    };
    return { pad, iw, ih, ticks, x, y, path };
  }, [width, height, points, lines, max]);

  useRevealChart(svgRef, !!geo);

  const onMove = (e) => {
    if (!geo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    let dist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(geo.x(p) - px);
      if (d < dist) [best, dist] = [i, d];
    });
    setActive(best);
  };

  if (points.length < 2) return <div className="flex h-[120px] items-center justify-center text-[12.5px] text-ink-soft">Aún no hay suficientes datos para dibujar la serie.</div>;
  const tip = active != null ? points[active] : null;

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height }}>
      {geo && (
        <svg ref={svgRef} width={width} height={height} className="block" onPointerMove={onMove} onPointerLeave={() => setActive(null)} role="img" aria-label={lines.map((l) => l.label).join(', ')}>
          {geo.ticks.map((t) => (
            <g key={t}>
              <line x1={geo.pad.l} x2={width - geo.pad.r} y1={geo.y(t)} y2={geo.y(t)} stroke="rgb(var(--c-line))" strokeDasharray={t ? '2 4' : undefined} />
              <text x={geo.pad.l - 8} y={geo.y(t)} dy="0.32em" textAnchor="end" className="fill-ink-soft text-[10.5px] num">
                {format(t)}
              </text>
            </g>
          ))}
          {lines.map((l) => (
            <path key={l.label} data-line d={geo.path(l)} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {[0, Math.floor(points.length / 2), points.length - 1].map((i) => (
            <text key={i} x={geo.x(points[i])} y={height - 5} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="fill-ink-soft text-[10.5px]">
              {fmtTime(points[i].collected_at)}
            </text>
          ))}
          {tip && (
            <>
              <line x1={geo.x(tip)} x2={geo.x(tip)} y1={geo.pad.t} y2={geo.pad.t + geo.ih} stroke="rgb(var(--c-mute))" strokeDasharray="3 3" />
              {lines.map((l) => (l.value(tip) == null ? null : <circle key={l.label} cx={geo.x(tip)} cy={geo.y(l.value(tip))} r="4" fill={l.color} stroke="rgb(var(--c-surface))" strokeWidth="2" />))}
            </>
          )}
        </svg>
      )}
      {tip && geo && (
        <div className="glass-strong pointer-events-none absolute top-0 z-10 w-[180px] px-3 py-2.5 text-[12px] shadow-float" style={{ left: Math.min(Math.max(geo.x(tip) - 90, 0), width - 180) }}>
          <p className="mb-1.5 font-medium text-ink">{new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(tip.collected_at))}</p>
          {lines.map((l) => (
            <div key={l.label} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-ink-soft">
                <span className="h-0.5 w-3 rounded" style={{ background: l.color }} />
                {l.label}
              </span>
              <span className="num font-medium text-ink">{l.value(tip) == null ? '—' : format(l.value(tip))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const BAR_COLOR = { up: 'bg-ok', degraded: 'bg-warn', partial: 'bg-warn', down: 'bg-danger', none: 'bg-track' };
const BAR_LABEL = { up: 'correcto', degraded: 'degradado', partial: 'fallos parciales', down: 'caído', none: 'sin datos' };

export function UptimeBars({ bars, className }) {
  return (
    <div className={cx('flex h-6 items-end gap-[2px]', className)} role="img" aria-label="Disponibilidad por hora en las últimas 48 horas">
      {bars.map((b) => (
        <span
          key={b.hour}
          title={`${new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit' }).format(new Date(`${b.hour}:00:00Z`))} h · ${BAR_LABEL[b.status]}`}
          className={cx('w-full min-w-[2px] flex-1 rounded-[2px] transition-opacity hover:opacity-70', BAR_COLOR[b.status], b.status === 'none' ? 'h-2' : 'h-full')}
        />
      ))}
    </div>
  );
}

export function Ring({ value, size = 56, stroke = 6, label, sub }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.min(100, Math.max(0, value));
  const color = value == null ? 'rgb(var(--c-line))' : v >= 90 ? '#E5484D' : v >= 80 ? '#F59E0B' : 'rgb(var(--c-brand))';
  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--c-track))" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (v / 100) * c} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <div>
        <p className="text-[12px] text-ink-soft">{label}</p>
        <p className="mono text-[15px] font-medium text-ink">{value == null ? '—' : `${Math.round(v)} %`}</p>
        {sub && <p className="mono text-[11px] text-ink-faint">{sub}</p>}
      </div>
    </div>
  );
}
