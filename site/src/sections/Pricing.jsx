import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Briefcase, Globe, Mic, CreditCard, Loader2, Info } from 'lucide-react';
import Button from '../components/Button.jsx';
import { SELECT_SERVICE_EVENT } from '../components/ContactForm.jsx';
import { hiringModes } from '../data/content.js';
import { getServices, createCheckout } from '../services/checkout.js';
import { useReveal } from '../hooks/useReveal.js';
import { config } from '../config.js';

const icons = { custom: Briefcase, web: Globe, voice: Mic };
const BILLING = { one_time: 'pago único', monthly: 'al mes', yearly: 'al año' };
const money = (cents, currency = 'EUR') => new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(cents / 100);
const pick = (service) => () => window.dispatchEvent(new CustomEvent(SELECT_SERVICE_EVENT, { detail: service }));

/** Plan configurado en el CRM. El precio que se muestra es informativo: el CRM decide el importe real en Checkout. */
function Plan({ s }) {
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState({ name: '', email: '' });

  const start = async (e) => {
    e.preventDefault();
    setState('loading');
    setError('');
    try {
      window.location.assign(await createCheckout({ serviceId: s.id, customer }));
    } catch (err) {
      setState('idle');
      setError(err.kind === 'unavailable' ? 'La contratación online todavía no está disponible. Pídenos presupuesto y te ayudamos.' : err.message);
    }
  };

  return (
    <li className="rounded-[16px] bg-white/70 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[14.5px] font-medium">{s.name}</p>
        {Number.isFinite(s.price) && (
          <p className="font-mono text-[14px] text-ink">
            {money(s.price, s.currency)} <span className="text-[11px] text-ink-soft">{BILLING[s.billingType] ?? ''}</span>
          </p>
        )}
      </div>
      {s.description && <p className="mt-1 text-[13px] text-ink-soft">{s.description}</p>}
      {open ? (
        <form onSubmit={start} className="mt-3 grid gap-2">
          <input className="input" required placeholder="Tu nombre" autoComplete="name" aria-label="Nombre" value={customer.name} onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))} />
          <input className="input" required type="email" placeholder="Tu email" autoComplete="email" aria-label="Email" value={customer.email} onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))} />
          <button type="submit" className="btn btn-primary btn-sm" disabled={state === 'loading'}>
            {state === 'loading' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <CreditCard size={15} aria-hidden="true" />}
            Ir al pago seguro
          </button>
          <p className="text-[11.5px] text-ink-faint">Te llevaremos a Stripe para completar el pago.</p>
        </form>
      ) : (
        <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => setOpen(true)}>Contratar</button>
      )}
      {error && <p role="alert" className="mt-2 text-[12.5px] text-danger">{error}</p>}
    </li>
  );
}

export default function Pricing() {
  const scope = useRef(null);
  useReveal(scope, { stagger: 0.15 });
  const [catalog, setCatalog] = useState({ status: 'loading', services: [] });

  useEffect(() => {
    if (!config.checkoutEnabled) return setCatalog({ status: 'unavailable', services: [] });
    const ctrl = new AbortController();
    getServices({ signal: ctrl.signal })
      .then((services) => setCatalog({ status: 'ready', services }))
      .catch((err) => !ctrl.signal.aborted && setCatalog({ status: err.kind === 'unavailable' ? 'unavailable' : 'error', services: [] }));
    return () => ctrl.abort();
  }, []);

  const byCategory = (cat) => catalog.services.filter((s) => s.category === cat);

  return (
    <section id="contratar" ref={scope} className="section py-24 lg:py-28">
      <header className="mx-auto max-w-[720px] text-center">
        <p data-reveal className="eyebrow">Contratación</p>
        <h2 data-reveal className="mt-4 text-[34px] leading-[1.08] tracking-[-0.025em] sm:text-[46px]">Cada proyecto empieza con una conversación.</h2>
        <p data-reveal className="mx-auto mt-4 max-w-[560px] text-[16px] text-ink-soft">
          Los proyectos a medida se presupuestan tras conocer tu negocio. Algunos servicios tienen tarifas cerradas que podrás contratar online.
        </p>
      </header>

      <ul className="mt-12 grid gap-4 lg:grid-cols-3">
        {hiringModes.map((m, i) => {
          const Icon = icons[m.id];
          const plans = m.category ? byCategory(m.category) : [];
          const featured = i === 0;
          return (
            <li
              key={m.id}
              data-reveal
              className={`flex flex-col rounded-panel p-6 sm:p-7 ${featured ? 'noise relative overflow-hidden bg-gradient-to-br from-brand to-brand-deep text-white shadow-float' : 'glass sheen'}`}
            >
              <span className={`inline-flex h-11 w-11 items-center justify-center rounded-[14px] ${featured ? 'bg-white/15 text-white' : 'bg-brand-ice text-brand'}`}>
                <Icon size={20} aria-hidden="true" />
              </span>
              <h3 className={`mt-5 text-[22px] tracking-[-0.015em] ${featured ? 'text-white' : ''}`}>{m.title}</h3>
              <p className={`mt-2 text-[14.5px] ${featured ? 'text-white/75' : 'text-ink-soft'}`}>{m.text}</p>

              {featured ? (
                <p className="mt-6 font-mono text-[12px] uppercase tracking-[0.14em] text-white/60">Presupuesto personalizado</p>
              ) : plans.length > 0 ? (
                <ul className="mt-6 grid gap-2">{plans.map((s) => <Plan key={s.id} s={s} />)}</ul>
              ) : (
                <p className="mt-6 flex items-start gap-2 text-[12.5px] text-ink-soft">
                  <Info size={14} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
                  {catalog.status === 'loading' ? 'Consultando planes disponibles…' : 'Planes con contratación online muy pronto. De momento, te preparamos una propuesta a medida.'}
                </p>
              )}

              <div className="mt-auto pt-7">
                <Button to="/#contacto" onClick={pick(m.service)} variant={featured ? 'light' : 'primary'} className="w-full">
                  Solicitar presupuesto <ArrowRight size={16} aria-hidden="true" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 text-center text-[12.5px] text-ink-faint">Los pagos online se procesan con Stripe. Nunca almacenamos los datos de tu tarjeta.</p>
    </section>
  );
}
