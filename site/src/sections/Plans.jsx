import { useRef } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import Button from '../components/Button.jsx';
import { SELECT_SERVICE_EVENT } from '../components/ContactForm.jsx';
import { plans } from '../data/content.js';
import { useReveal } from '../hooks/useReveal.js';

const pick = (service) => () => window.dispatchEvent(new CustomEvent(SELECT_SERVICE_EVENT, { detail: service }));

/** Planes Básico / Pro / Ultra. Datos en src/data/content.js → plans. */
export default function Plans() {
  const scope = useRef(null);
  useReveal(scope, { stagger: 0.15 });

  return (
    <section id="precios" ref={scope} className="section py-24 lg:py-28">
      <header className="mx-auto max-w-[720px] text-center">
        <p data-reveal className="eyebrow">Precios</p>
        <h2 data-reveal className="mt-4 text-[34px] leading-[1.08] tracking-[-0.025em] sm:text-[46px]">Empieza por donde tu negocio lo necesite.</h2>
        <p data-reveal className="mx-auto mt-4 max-w-[560px] text-[16px] text-ink-soft">
          Tres niveles para que sepas desde el principio por dónde van los tiros. El presupuesto final lo cerramos contigo tras conocer tu caso.
        </p>
      </header>

      <ul className="mt-12 grid items-stretch gap-4 lg:grid-cols-3">
        {plans.map((p) => (
          <li
            key={p.id}
            data-reveal
            className={`relative flex flex-col rounded-panel p-6 sm:p-8 ${
              p.featured ? 'noise overflow-hidden bg-gradient-to-br from-brand to-brand-deep text-white shadow-float lg:-my-3 lg:py-11' : 'glass sheen'
            }`}
          >
            {p.featured && (
              <span className="mb-4 inline-flex w-fit rounded-full bg-white/15 px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-white">Más elegido</span>
            )}
            <h3 className={`text-[24px] tracking-[-0.015em] ${p.featured ? 'text-white' : ''}`}>{p.name}</h3>
            <p className={`mt-1 text-[14.5px] ${p.featured ? 'text-white/75' : 'text-ink-soft'}`}>{p.text}</p>

            <p className="mt-6 flex items-baseline gap-2">
              {p.from && <span className={`text-[14px] ${p.featured ? 'text-white/70' : 'text-ink-soft'}`}>Desde</span>}
              <span className={`font-mono text-[38px] font-medium leading-none tracking-tight sm:text-[42px] ${p.featured ? 'text-white' : 'text-ink'}`}>{p.price}</span>
            </p>
            {p.note && <p className={`mt-2 text-[12.5px] ${p.featured ? 'text-white/65' : 'text-ink-soft'}`}>{p.note}</p>}

            <ul className="mt-7 grid gap-3">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[14.5px]">
                  <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${p.featured ? 'bg-white/15 text-white' : 'bg-brand-ice text-brand'}`}>
                    <Check size={12} strokeWidth={3} aria-hidden="true" />
                  </span>
                  <span className={p.featured ? 'text-white/90' : ''}>{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-auto pt-8">
              <Button to="/#contacto" onClick={pick(p.service)} variant={p.featured ? 'light' : 'primary'} className="w-full">
                Quiero el plan {p.name} <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-center text-[12.5px] text-ink-faint">Precios orientativos. Cada proyecto se ajusta a lo que necesites y se confirma con un presupuesto cerrado.</p>
    </section>
  );
}
