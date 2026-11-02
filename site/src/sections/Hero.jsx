import { useRef } from 'react';
import { ArrowRight, ArrowDown } from 'lucide-react';
import Button from '../components/Button.jsx';
import { CrmMockup, VoiceMockup, WebMockup } from '../components/Mockups.jsx';
import { useGsap } from '../hooks/useReveal.js';

export default function Hero() {
  const scope = useRef(null);

  useGsap(scope, (g) => {
    const tl = g.timeline({ defaults: { ease: 'power3.out' } });
    tl.from('[data-hero-text]', { y: 26, opacity: 0, duration: 0.9, stagger: 0.08 })
      .from('[data-hero-visual]', { x: 80, opacity: 0, duration: 1.1 }, 0.15)
      .from('[data-hero-panel]', { scale: 0.9, opacity: 0, duration: 1, stagger: 0.15 }, 0.35);
    // Parallax ligero de los paneles al salir del hero
    g.to('[data-hero-panel]', {
      yPercent: (i) => [-6, 10, -14][i],
      ease: 'none',
      scrollTrigger: { trigger: scope.current, start: 'top top', end: 'bottom top', scrub: true },
    });
  });

  return (
    <section id="inicio" ref={scope} className="section relative grid min-h-[100dvh] items-center gap-12 pb-16 pt-28 lg:grid-cols-2 lg:gap-8 lg:pb-10 lg:pt-24">
      <div className="max-w-[560px]">
        <p data-hero-text className="eyebrow inline-flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-pulsering rounded-full bg-brand" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
          </span>
          Tecnología a medida · Web Pulsar
        </p>
        <h1 data-hero-text className="mt-5 text-[40px] leading-[1.04] tracking-[-0.03em] sm:text-[54px] lg:text-[60px]">
          No hay dos negocios iguales.{' '}
          <span className="bg-gradient-to-r from-brand via-[#4F7BF2] to-violet bg-clip-text text-transparent">Tu tecnología tampoco debería serlo.</span>
        </h1>
        <p data-hero-text className="mt-6 text-[16.5px] leading-relaxed text-ink-soft sm:text-[17.5px]">
          Creamos CRM personalizados, páginas web y asistentes inteligentes diseñados alrededor de cómo funciona realmente tu negocio. Sin soluciones prefabricadas. Sin complicaciones innecesarias.
        </p>
        <div data-hero-text className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button to="/#contacto">Cuéntanos tu proyecto <ArrowRight size={16} aria-hidden="true" /></Button>
          <Button to="/#soluciones" variant="secondary">Descubre lo que hacemos <ArrowDown size={16} aria-hidden="true" /></Button>
        </div>
        <p data-hero-text className="mt-8 flex items-center gap-3 font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink-soft">
          <span className="h-px w-8 bg-ink/25" aria-hidden="true" />
          Tecnología, desarrollo y personas. Todo conectado.
        </p>
      </div>

      <div data-hero-visual className="relative mx-auto w-full max-w-[560px] lg:max-w-none" aria-label="Ejemplos ilustrativos de un CRM, un asistente de voz y una página web" role="img">
        <div className="relative aspect-[1/0.95] w-full">
          <div data-hero-panel className="absolute left-0 top-[4%] w-[86%] -rotate-3">
            <CrmMockup />
          </div>
          <div data-hero-panel className="absolute bottom-[2%] right-0 w-[58%] rotate-2">
            <WebMockup />
          </div>
          <div data-hero-panel className="absolute bottom-[18%] left-[4%] w-[52%] sm:bottom-[22%]">
            <VoiceMockup />
          </div>
        </div>
        <p className="mt-2 text-center font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">Interfaces ilustrativas</p>
      </div>
    </section>
  );
}
