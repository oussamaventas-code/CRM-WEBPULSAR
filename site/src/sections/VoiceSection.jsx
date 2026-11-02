import { useRef } from 'react';
import VoiceDemo from '../components/VoiceDemo.jsx';
import { voiceDemo } from '../data/content.js';
import { useReveal } from '../hooks/useReveal.js';

export default function VoiceSection() {
  const scope = useRef(null);
  useReveal(scope);
  return (
    <section id="demo-voz" ref={scope} className="section py-24 lg:py-28">
      <div className="relative mx-auto max-w-[880px]">
        <div aria-hidden="true" className="absolute -inset-x-10 -inset-y-16 -z-10 bg-[radial-gradient(closest-side,rgba(128,103,232,0.22),transparent)]" />
        <header className="text-center">
          <p data-reveal className="eyebrow">Demostración</p>
          <h2 data-reveal className="mt-4 text-[32px] leading-[1.1] tracking-[-0.025em] sm:text-[44px]">Escucha lo que puede hacer un asistente de voz.</h2>
          <p data-reveal className="mx-auto mt-4 max-w-[560px] text-[16px] text-ink-soft">Una experiencia conversacional diseñada para atender a tus clientes de forma natural.</p>
        </header>
        <div data-reveal className="mt-10">
          <VoiceDemo demo={voiceDemo} />
        </div>
      </div>
    </section>
  );
}
