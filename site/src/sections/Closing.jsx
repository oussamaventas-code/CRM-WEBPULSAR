import { useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import Button from '../components/Button.jsx';
import FAQ from '../components/FAQ.jsx';
import ContactForm from '../components/ContactForm.jsx';
import { PulseMark } from '../components/Logo.jsx';
import { faq } from '../data/content.js';
import { useReveal } from '../hooks/useReveal.js';

export function FaqSection() {
  const scope = useRef(null);
  useReveal(scope);
  return (
    <section id="preguntas" ref={scope} className="section grid gap-10 py-24 lg:grid-cols-[1fr_1.6fr] lg:py-28">
      <header className="lg:sticky lg:top-28 lg:self-start">
        <p data-reveal className="eyebrow">Preguntas frecuentes</p>
        <h2 data-reveal className="mt-4 text-[34px] leading-[1.08] tracking-[-0.025em] sm:text-[42px]">Lo que suelen preguntarnos.</h2>
        <p data-reveal className="mt-4 max-w-[360px] text-[15.5px] text-ink-soft">¿Tienes otra duda? Escríbenos y te respondemos personalmente.</p>
      </header>
      <FAQ items={faq} />
    </section>
  );
}

export function FinalCTA() {
  const scope = useRef(null);
  useReveal(scope);
  return (
    <section ref={scope} className="px-3 py-10 sm:px-4">
      <div className="noise relative mx-auto max-w-[1280px] overflow-hidden rounded-section bg-brand-deep px-6 py-20 text-center text-white sm:py-28">
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/45 blur-[120px]" />
        <div aria-hidden="true" className="glass-dark pointer-events-none absolute -left-10 top-10 hidden h-40 w-56 rotate-[-8deg] md:block" />
        <div aria-hidden="true" className="glass-dark pointer-events-none absolute -right-8 bottom-10 hidden h-48 w-64 rotate-[6deg] md:block" />
        <div className="relative mx-auto max-w-[760px]">
          <span data-reveal className="glass-dark mx-auto inline-flex h-16 w-16 items-center justify-center !rounded-[20px]"><PulseMark light className="h-8 w-8" /></span>
          <h2 data-reveal className="mt-8 text-[34px] leading-[1.08] tracking-[-0.025em] text-white sm:text-[52px]">Tu negocio es único. Construyamos algo a su altura.</h2>
          <p data-reveal className="mx-auto mt-5 max-w-[520px] text-[16.5px] text-white/70">Cuéntanos qué necesitas. Nosotros te ayudamos a convertirlo en una solución real.</p>
          <div data-reveal className="mt-9">
            <Button to="/#contacto" variant="light">Hablemos de tu proyecto <ArrowRight size={16} aria-hidden="true" /></Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ContactSection() {
  const scope = useRef(null);
  useReveal(scope);
  return (
    <section id="contacto" ref={scope} className="section grid gap-10 py-24 lg:grid-cols-[1fr_1.5fr] lg:py-28">
      <header>
        <p data-reveal className="eyebrow">Contacto</p>
        <h2 data-reveal className="mt-4 text-[34px] leading-[1.08] tracking-[-0.025em] sm:text-[42px]">Cuéntanos tu proyecto.</h2>
        <p data-reveal className="mt-4 max-w-[400px] text-[15.5px] text-ink-soft">
          Explícanos cómo funciona tu negocio y qué te gustaría mejorar. Te responderemos personalmente, sin compromiso y sin respuestas automáticas.
        </p>
        <ol data-reveal className="mt-8 space-y-3 text-[14px]">
          {['Leemos tu mensaje con calma.', 'Te contactamos para entender tu caso.', 'Te proponemos una solución y un presupuesto cerrado.'].map((t, i) => (
            <li key={t} className="flex items-center gap-3">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/70 font-mono text-[11.5px] text-brand shadow-glass">{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
      </header>
      <div data-reveal>
        <ContactForm />
      </div>
    </section>
  );
}
