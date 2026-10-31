import { CircleAlert, CircleCheck, CircleHelp, TriangleAlert } from 'lucide-react';
import { cx } from './ui.jsx';
import { HEALTH } from '../lib/labels.js';

// Estado de recursos: siempre icono + texto, nunca solo color.
const META = {
  operational: { icon: CircleCheck, cls: 'bg-ok-soft text-ok-ink', bar: 'bg-ok' },
  warning: { icon: TriangleAlert, cls: 'bg-warn-soft text-warn-ink', bar: 'bg-warn' },
  down: { icon: CircleAlert, cls: 'bg-danger-soft text-danger-ink', bar: 'bg-danger' },
  unknown: { icon: CircleHelp, cls: 'bg-mute-soft text-ink-soft', bar: 'bg-track' },
};

export function HealthPill({ status = 'unknown', reason, className }) {
  const m = META[status] ?? META.unknown;
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium', m.cls, className)} title={reason ?? undefined}>
      <m.icon className="h-3.5 w-3.5" strokeWidth={2.2} />
      {HEALTH.label(status)}
    </span>
  );
}

/** Barra segmentada con el reparto de estados de un tipo de recurso. */
export function HealthBar({ counts }) {
  const total = counts?.total ?? 0;
  const order = ['operational', 'warning', 'down', 'unknown'];
  return (
    <div>
      <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-track">
        {total > 0 && order.map((k) => (counts[k] ? <span key={k} className={cx('h-full', META[k].bar)} style={{ width: `${(counts[k] / total) * 100}%` }} /> : null))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {order.map((k) => {
          const m = META[k];
          return (
            <span key={k} className="inline-flex items-center gap-1 text-[11.5px] text-ink-soft">
              <m.icon className={cx('h-3 w-3', k === 'operational' ? 'text-ok' : k === 'warning' ? 'text-warn' : k === 'down' ? 'text-danger' : 'text-ink-faint')} strokeWidth={2.2} />
              <span className="num font-medium text-ink">{counts?.[k] ?? 0}</span> {HEALTH.label(k).toLowerCase()}
            </span>
          );
        })}
      </div>
    </div>
  );
}
