import { useRef } from 'react';
import { ArrowRight, Check, Database, Globe, Mic } from 'lucide-react';
import Button from '../components/Button.jsx';
import BeforeAfter from '../components/BeforeAfter.jsx';
import NotificationStack from '../components/NotificationStack.jsx';
import IntegrationOrbit from '../components/IntegrationOrbit.jsx';
import { CrmMockup, VoiceMockup, WebMockup } from '../components/Mockups.jsx';
import { SELECT_SERVICE_EVENT } from '../components/ContactForm.jsx';
import { useReveal } from '../hooks/useReveal.js';

const pick = (service) => () => window.dispatchEvent(new CustomEvent(SELECT_SERVICE_EVENT, { detail: service }));

function Features({ items, dark = false }) {
  return (
    <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
      {items.map((f) => (
        <li key={f} className={`flex items-center gap-2.5 text-[14.5px] ${dark ? 'text-white/85' : 'text-ink'}`}>
          <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${dark ? 'bg-white/15 text-white' : 'bg-brand-ice text-brand'}`}>
            <Check size={12} strokeWidth={3} aria-hidden="true" />
          </span>
          {f}
        </li>
      ))}
    </ul>
  );
}

function Tag({ icon: Icon, children, dark }) {
  return (
    <p className={`inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] ${dark ? 'text-brand-light' : 'text-brand'}`}>
      <Icon size={14} aria-hidden="true" /> {children}
    </p>
  );
}

function CrmBlock() {
  const scope = useRef(null);
  useReveal(scope, { stagger: 0.15 });
  return (
    <article id="crm" ref={scope} className="grid items-center gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-14">
      <div data-reveal>
        <Tag icon={Database}>01 · CRM personalizados</Tag>
        <h3 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.02em] sm:text-[40px]">Tu negocio bajo control.</h3>
        <p className="mt-4 max-w-[520px] text-[16px] text-ink-soft">Desarrollamos sistemas de gestión que se adaptan a tus procesos, clientes y forma de trabajar.</p>
        <Features items={['Gestión de clientes', 'Seguimiento comercial', 'Automatización de procesos', 'Paneles de control', 'Adaptación a cada empresa', 'Integraciones personalizadas']} />
        <Button to="/#contacto" onClick={pick('CRM personalizado')} className="mt-8">Diseñar mi CRM <ArrowRight size={16} aria-hidden="true" /></Button>
      </div>
      <div data-reveal className="relative">
        <div aria-hidden="true" className="absolute -inset-6 -z-10 rounded-full bg-brand-light/30 blur-3xl" />
        <CrmMockup />
      </div>
      <div data-reveal className="lg:col-span-2">
        <BeforeAfter />
      </div>
    </article>
  );
}

function WebBlock() {
  const scope = useRef(null);
  useReveal(scope, { stagger: 0.15 });
  return (
    <article id="web" ref={scope} className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
      <div data-reveal className="relative order-2 lg:order-1">
        <WebMockup className="w-[88%]" />
        <div className="relative -mt-16 ml-auto w-[78%] sm:-mt-24 sm:w-[62%]">
          <NotificationStack />
        </div>
      </div>
      <div data-reveal className="order-1 lg:order-2">
        <Tag icon={Globe}>02 · Páginas web profesionales</Tag>
        <h3 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.02em] sm:text-[40px]">Tu negocio merece una presencia digital a su altura.</h3>
        <p className="mt-4 max-w-[520px] text-[16px] text-ink-soft">Diseñamos y desarrollamos páginas web rápidas, modernas y preparadas para convertir visitantes en oportunidades.</p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {['Diseño personalizado', 'Responsive', 'SEO técnico', 'Optimización de rendimiento', 'Formularios conectados', 'Integraciones'].map((f) => (
            <li key={f} className="chip">{f}</li>
          ))}
        </ul>
        <Button to="/#contacto" onClick={pick('Página web profesional')} className="mt-8">Crear mi página web <ArrowRight size={16} aria-hidden="true" /></Button>
      </div>
    </article>
  );
}

function VoiceBlock() {
  const scope = useRef(null);
  useReveal(scope, { stagger: 0.15 });
  return (
    <article id="voz" ref={scope} className="noise relative overflow-hidden rounded-section bg-gradient-to-br from-[#1E3A8A] via-brand-deep to-[#2E1F6B] p-6 text-white sm:p-10 lg:p-14">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-[360px] w-[360px] rounded-full bg-violet/40 blur-[90px]" />
      <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div data-reveal>
          <Tag icon={Mic} dark>03 · Asistentes de voz inteligentes</Tag>
          <h3 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.02em] text-white sm:text-[40px]">Tu negocio también puede hablar.</h3>
          <p className="mt-4 max-w-[520px] text-[16px] text-white/70">Creamos asistentes de voz inteligentes que ayudan a atender llamadas, responder preguntas y automatizar conversaciones.</p>
          <Features dark items={['Atención telefónica automatizada', 'Conversaciones naturales', 'Personalización', 'Integración con sistemas', 'Automatización de tareas']} />
          <Button to="/#demo-voz" variant="light" className="mt-8">Ver una demostración <ArrowRight size={16} aria-hidden="true" /></Button>
        </div>
        <div data-reveal className="relative mx-auto w-full max-w-[380px]">
          <VoiceMockup className="rotate-[-2deg]" />
          <div className="glass-dark mt-4 ml-10 p-4 text-[13.5px] text-white/85">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-brand-light">Ejemplo</p>
            <p className="mt-1">“Hola, ¿a qué hora cerráis hoy?”</p>
          </div>
        </div>
      </div>
    </article>
  );
}

function IntegrationsBlock() {
  const scope = useRef(null);
  useReveal(scope);
  return (
    <article id="integraciones" ref={scope} className="grid items-center gap-10 lg:grid-cols-2">
      <div data-reveal>
        <p className="eyebrow">Automatización e integraciones</p>
        <h3 className="mt-4 text-[30px] leading-[1.1] tracking-[-0.02em] sm:text-[36px]">Cada pieza habla con las demás.</h3>
        <p className="mt-4 max-w-[480px] text-[16px] text-ink-soft">
          Tu web, tu CRM y tu asistente de voz no deberían ser islas. Los conectamos para que la información fluya sola y tú dediques el tiempo a lo que importa.
        </p>
        <p className="mt-3 text-[13px] text-ink-faint">Pasa el ratón o navega con el teclado por cada punto para ver qué hace.</p>
      </div>
      <div data-reveal>
        <IntegrationOrbit />
      </div>
    </article>
  );
}

export default function Services() {
  const head = useRef(null);
  useReveal(head);
  return (
    <section id="soluciones" className="section space-y-24 py-24 lg:space-y-32 lg:py-32">
      <header ref={head} className="mx-auto max-w-[760px] text-center">
        <p data-reveal className="eyebrow">Soluciones tecnológicas</p>
        <h2 data-reveal className="mt-4 text-[34px] leading-[1.08] tracking-[-0.025em] sm:text-[46px]">No adaptamos tu negocio a una herramienta. Adaptamos la tecnología a ti.</h2>
      </header>
      <CrmBlock />
      <WebBlock />
      <VoiceBlock />
      <IntegrationsBlock />
    </section>
  );
}
