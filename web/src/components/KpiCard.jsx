import { useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Glass, Skeleton, cx } from './ui.jsx';
import { settle, skipMotion } from '../lib/motion.js';

const ICON_TONES = {
  brand: 'from-brand-ice to-surface text-brand',
  ok: 'from-ok-soft to-surface text-ok',
  warn: 'from-warn-soft to-surface text-warn-ink',
  danger: 'from-danger-soft to-surface text-danger',
  violet: 'from-violet-soft to-surface text-violet',
  deep: 'from-brand-ice to-surface text-brand-deep',
};

/**
 * Indicador con cuenta animada. delta = { change } (porcentaje vs. periodo anterior) o null si no hay datos previos.
 * invert: una subida es negativa (p. ej. pagos pendientes).
 */
export function KpiCard({ icon: Icon, label, value, format = (v) => v.toLocaleString('es-ES'), description, delta, deltaLabel = 'vs. mes anterior', tone = 'brand', invert = false, loading, to, alert = false }) {
  const valueRef = useRef(null);
  const scope = useRef(null);

  useGSAP(
    () => {
      if (loading || value == null || !valueRef.current) return undefined;
      const final = () => valueRef.current && (valueRef.current.textContent = format(value));
      if (skipMotion()) return final();
      const counter = { v: 0 };
      const tween = gsap.to(counter, {
        v: value,
        duration: 0.9,
        ease: 'power2.out',
        onUpdate: () => {
          if (valueRef.current) valueRef.current.textContent = format(Number.isInteger(value) ? Math.round(counter.v) : counter.v);
        },
        onComplete: final,
      });
      return settle(() => {
        tween.kill();
        final();
      }, 1100);
    },
    { scope, dependencies: [value, loading] },
  );

  const change = delta?.change;
  const positive = change > 0;
  const good = change == null || change === 0 ? null : invert ? !positive : positive;
  const TrendIcon = change == null || change === 0 ? Minus : positive ? TrendingUp : TrendingDown;
  const Wrapper = to ? Link : 'div';

  return (
    <Glass ref={scope} className={cx('lift group relative overflow-hidden p-4 sm:p-5', alert && 'ring-1 ring-danger/30')} data-kpi>
      <Wrapper {...(to ? { to } : {})} className="block focus-visible:outline-none">
        <div className="flex items-start justify-between gap-3">
          <div className={cx('flex h-10 w-10 items-center justify-center rounded-2xl border border-surface bg-gradient-to-b shadow-[0_4px_12px_-6px_rgba(23,59,114,0.25)]', ICON_TONES[tone])}>
            <Icon className="h-[19px] w-[19px]" strokeWidth={1.9} />
          </div>
          {!loading && delta && change != null && (
            <span
              className={cx(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium num',
                good === null ? 'bg-mute-soft text-ink-soft' : good ? 'bg-ok-soft text-ok-ink' : 'bg-danger-soft text-danger-ink',
              )}
              title={change == null ? 'Sin datos del periodo anterior' : deltaLabel}
            >
              <TrendIcon className="h-3 w-3" />
              {change == null ? '—' : `${change > 0 ? '+' : ''}${change.toLocaleString('es-ES')} %`}
            </span>
          )}
        </div>
        <div className="mt-4">
          {loading ? (
            <Skeleton className="h-8 w-28" />
          ) : (
            <p ref={valueRef} className="num text-[26px] font-medium leading-none tracking-[-0.02em] text-ink sm:text-[28px]">
              {value == null ? '—' : format(value)}
            </p>
          )}
          <p className="mt-2 text-[13px] font-medium text-ink">{label}</p>
          <p className="mt-0.5 truncate text-[12px] text-ink-soft">{loading ? ' ' : description}</p>
        </div>
      </Wrapper>
    </Glass>
  );
}
