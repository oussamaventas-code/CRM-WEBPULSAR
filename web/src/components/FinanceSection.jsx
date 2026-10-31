import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Receipt, Table2, Wallet } from 'lucide-react';
import { useApi } from '../lib/hooks.js';
import { money } from '../lib/format.js';
import { Button, EmptyState, Section, Segmented, Skeleton, cx } from './ui.jsx';
import { FinanceChart, Legend } from './charts.jsx';

export const RANGES = [
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: '90d', label: '90 días' },
  { value: '12m', label: '12 meses' },
];

/** Gráfico de ingresos cobrados, pendientes, gastos y beneficio con selector de periodo y vista de tabla. */
export function FinanceSection({ defaultRange = '30d', title = 'Finanzas' }) {
  const [range, setRange] = useState(defaultRange);
  const [table, setTable] = useState(false);
  const { data, loading } = useApi('/finance/series', { range });
  const empty = data && Object.values(data.totals).every((v) => v === 0);
  return (
    <Section
      title={title}
      subtitle="Ingresos cobrados y pendientes, gastos registrados y beneficio estimado"
      icon={Wallet}
      actions={
        <>
          <Segmented options={RANGES} value={range} onChange={setRange} label="Periodo" />
          <Button variant="ghost" size="sm" icon={Table2} onClick={() => setTable((t) => !t)} aria-pressed={table}>
            <span className="hidden sm:inline">{table ? 'Gráfico' : 'Tabla'}</span>
          </Button>
        </>
      }
    >
      {!data && loading ? (
        <Skeleton className="h-[300px] w-full rounded-2xl" />
      ) : empty ? (
        <EmptyState compact icon={Receipt} title="Sin movimientos en este periodo" description="Cuando emitas facturas, registres cobros o gastos, aquí verás su evolución." action={<Link to="/finanzas" className="btn-secondary">Ir a Finanzas</Link>} />
      ) : (
        <div className={cx('transition-opacity', loading && 'opacity-60')}>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['collected', 'Cobrado'],
              ['pending', 'Pendiente'],
              ['expenses', 'Gastos'],
              ['profit', 'Beneficio estimado'],
            ].map(([k, label]) => (
              <div key={k} className="rounded-2xl border border-surface/80 bg-surface/50 px-3.5 py-2.5">
                <p className="text-[11.5px] text-ink-soft">{label}</p>
                <p className={cx('num mt-0.5 text-[17px] font-medium', k === 'profit' && data.totals.profit < 0 ? 'text-danger' : 'text-ink')}>{money(data.totals[k])}</p>
              </div>
            ))}
          </div>
          <div className="mb-3">
            <Legend keys={['collected', 'pending', 'expenses', 'profit']} />
          </div>
          <FinanceChart data={data} showTable={table} />
          <p className="mt-3 text-[11.5px] text-ink-faint">Beneficio estimado = cobrado − gastos registrados en el periodo. Pendiente = facturas y cargos del periodo aún sin cobrar.</p>
        </div>
      )}
    </Section>
  );
}
