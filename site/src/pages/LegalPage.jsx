import { Link } from 'react-router-dom';
import { ChevronRight, AlertTriangle } from 'lucide-react';
import { useSeo } from '../hooks/useSeo.js';
import { legalEntity } from '../data/content.js';

/** Dato legal: si falta, se marca como pendiente de forma muy visible. */
export function Field({ value, label }) {
  if (value) return <strong className="font-medium text-ink">{value}</strong>;
  return <mark className="rounded bg-warn-soft px-1.5 py-0.5 font-mono text-[12.5px] text-warn-ink">[PENDIENTE: {label}]</mark>;
}

export const hasPendingLegal = () => ['owner', 'taxId', 'address', 'email', 'updatedAt'].some((k) => !legalEntity[k]);

export default function LegalPage({ title, description, path, children }) {
  useSeo({ title: `${title} · Web Pulsar`, description, path, breadcrumb: title, noindex: hasPendingLegal() });
  return (
    <article className="section max-w-[820px] pb-24 pt-32">
      <nav aria-label="Ruta de navegación" className="mb-6 flex items-center gap-1.5 text-[12.5px] text-ink-soft">
        <Link to="/" className="hover:text-brand">Inicio</Link>
        <ChevronRight size={13} aria-hidden="true" />
        <span aria-current="page">{title}</span>
      </nav>
      <h1 className="text-[36px] leading-tight tracking-[-0.025em] sm:text-[44px]">{title}</h1>
      <p className="mt-2 text-[13px] text-ink-soft">Última actualización: <Field value={legalEntity.updatedAt} label="fecha de revisión" /></p>
      {hasPendingLegal() && (
        <p role="note" className="mt-6 flex gap-3 rounded-[16px] bg-warn-soft p-4 text-[13.5px] text-warn-ink">
          <AlertTriangle size={18} className="shrink-0" aria-hidden="true" />
          Borrador pendiente de completar con los datos del titular y de revisión legal antes de publicar la web.
        </p>
      )}
      <div className="glass sheen mt-8 rounded-panel p-6 sm:p-10">
        <div className="legal space-y-4 text-[15px] leading-relaxed text-ink/90 [&_h2]:mt-8 [&_h2]:text-[20px] [&_h2:first-child]:mt-0 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
      </div>
    </article>
  );
}
