import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, CircleAlert, XCircle } from 'lucide-react';
import Button from '../components/Button.jsx';
import { useSeo } from '../hooks/useSeo.js';
import { getCheckoutSession } from '../services/checkout.js';

function Shell({ icon: Icon, tone, title, children }) {
  const tones = { brand: 'bg-brand-ice text-brand', ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn-ink', danger: 'bg-danger-soft text-danger' };
  return (
    <section className="section flex min-h-[80dvh] items-center justify-center pb-16 pt-32">
      <div role="status" aria-live="polite" className="glass-strong sheen w-full max-w-[520px] rounded-panel p-8 text-center sm:p-10">
        <span className={`mx-auto inline-flex h-14 w-14 items-center justify-center rounded-[18px] ${tones[tone]}`}><Icon size={26} aria-hidden="true" className={tone === 'brand' ? 'animate-spin' : ''} /></span>
        <h1 className="mt-6 text-[26px] tracking-[-0.02em]">{title}</h1>
        <div className="mt-3 text-[15px] text-ink-soft">{children}</div>
      </div>
    </section>
  );
}

/**
 * Nunca se da un pago por bueno por estar en esta URL: se pregunta al CRM, que lo sabe por los webhooks de Stripe.
 * Se consulta varias veces porque el webhook puede llegar unos segundos después de volver de Stripe.
 */
export function PaymentSuccess() {
  useSeo({ title: 'Verificando tu pago · Web Pulsar', description: 'Estamos verificando tu pago.', path: '/pago/exito', noindex: true });
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');
  const [state, setState] = useState(sessionId ? 'checking' : 'unknown');

  useEffect(() => {
    if (!sessionId) return undefined;
    const ctrl = new AbortController();
    let tries = 0;
    let timer;
    const check = async () => {
      tries += 1;
      try {
        const { status } = await getCheckoutSession(sessionId, { signal: ctrl.signal });
        if (status === 'paid' || status === 'complete') return setState('paid');
        if (status === 'expired' || status === 'canceled') return setState('failed');
      } catch (err) {
        if (ctrl.signal.aborted) return undefined;
        if (err.kind === 'unavailable') return setState('unknown');
      }
      if (tries < 8) timer = setTimeout(check, 2500);
      else setState('pending');
      return undefined;
    };
    check();
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [sessionId]);

  if (state === 'paid') {
    return (
      <Shell icon={CheckCircle2} tone="ok" title="Pago confirmado">
        <p>Gracias por confiar en Web Pulsar. Te escribiremos en breve con los siguientes pasos.</p>
        <Button to="/" variant="secondary" className="mt-6">Volver al inicio</Button>
      </Shell>
    );
  }
  if (state === 'failed') {
    return (
      <Shell icon={XCircle} tone="danger" title="El pago no se ha completado">
        <p>No se ha realizado ningún cargo. Puedes intentarlo de nuevo o escribirnos.</p>
        <Button to="/#contratar" className="mt-6">Volver a intentarlo</Button>
      </Shell>
    );
  }
  if (state === 'checking') {
    return (
      <Shell icon={Loader2} tone="brand" title="Estamos verificando tu pago">
        <p>Esto puede tardar unos segundos. No cierres esta página.</p>
      </Shell>
    );
  }
  return (
    <Shell icon={CircleAlert} tone="warn" title="Estamos verificando tu pago">
      <p>Todavía no podemos confirmarlo desde aquí. Si has completado el pago, recibirás la confirmación por email en cuanto se procese.</p>
      <Button to="/#contacto" variant="secondary" className="mt-6">Contactar con nosotros</Button>
    </Shell>
  );
}

export function PaymentCancelled() {
  useSeo({ title: 'Pago cancelado · Web Pulsar', description: 'El pago se ha cancelado.', path: '/pago/cancelado', noindex: true });
  return (
    <Shell icon={XCircle} tone="warn" title="Pago cancelado">
      <p>Has cancelado el pago y no se ha realizado ningún cargo. Si tienes dudas sobre el servicio, cuéntanoslo y te ayudamos.</p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Button to="/#contratar" variant="secondary">Ver servicios</Button>
        <Button to="/#contacto">Solicitar presupuesto</Button>
      </div>
    </Shell>
  );
}

export function NotFound() {
  useSeo({ title: 'Página no encontrada · Web Pulsar', description: 'La página que buscas no existe.', path: '/404', noindex: true });
  return (
    <Shell icon={CircleAlert} tone="warn" title="Esta página no existe">
      <p>Puede que el enlace esté mal escrito o que la página se haya movido.</p>
      <Button to="/" className="mt-6">Ir al inicio</Button>
    </Shell>
  );
}
