import { useRef } from 'react';
import { useGsap } from '../hooks/useReveal.js';

const split = (text) =>
  text.split(' ').map((w, i) => (
    <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
      <span data-word className="inline-block">{w}&nbsp;</span>
    </span>
  ));

/** M1 · Contraste filosófico sobre azul noche. */
export default function Philosophy() {
  const scope = useRef(null);

  useGsap(scope, (g) => {
    g.from('[data-word]', {
      yPercent: 110,
      duration: 0.9,
      ease: 'power3.out',
      stagger: 0.04,
      scrollTrigger: { trigger: '[data-words]', start: 'top 80%', once: true },
    });
    g.from('[data-contrast]', {
      y: 40,
      opacity: 0,
      duration: 0.9,
      ease: 'power3.out',
      stagger: 0.15,
      scrollTrigger: { trigger: '[data-contrast-grid]', start: 'top 80%', once: true },
    });
    g.fromTo('[data-strike]', { backgroundSize: '0% 100%' }, {
      backgroundSize: '100% 100%',
      duration: 0.8,
      ease: 'power2.inOut',
      scrollTrigger: { trigger: '[data-contrast-grid]', start: 'top 60%', once: true },
    });
  });

  return (
    <section id="filosofia" ref={scope} className="px-3 py-10 sm:px-4">
      <div className="noise relative mx-auto max-w-[1280px] overflow-hidden rounded-section bg-brand-deep px-5 py-20 text-white sm:px-10 lg:px-16 lg:py-28">
        <div aria-hidden="true" className="pointer-events-none absolute -left-32 top-0 h-[420px] w-[420px] rounded-full bg-brand/50 blur-[100px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 right-0 h-[460px] w-[460px] rounded-full bg-violet/35 blur-[110px]" />

        <div className="relative mx-auto max-w-[920px]">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-brand-light">Nuestra filosofía</p>
          <h2 data-words className="mt-5 text-[34px] leading-[1.08] tracking-[-0.025em] text-white sm:text-[48px] lg:text-[58px]">
            {split('No trabajamos con negocios en serie.')}
          </h2>
          <p className="mt-6 max-w-[640px] text-[16.5px] leading-relaxed text-white/70">
            Un restaurante no funciona como una asesoría. Una tienda no tiene las mismas necesidades que una empresa de servicios. Por eso no creemos en vender tecnología enlatada.
          </p>

          <div data-contrast-grid className="mt-14 grid gap-4 md:grid-cols-2">
            <div data-contrast className="relative rounded-card border border-white/10 bg-white/[0.04] p-7">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">La mayoría</p>
              <p className="mt-4 text-[21px] leading-snug text-white/55 sm:text-[24px]">
                <span
                  data-strike
                  className="bg-no-repeat [box-decoration-break:clone]"
                  style={{ backgroundImage: 'linear-gradient(transparent 52%, rgba(229,72,77,.75) 52%, rgba(229,72,77,.75) 58%, transparent 58%)', backgroundSize: '100% 100%' }}
                >
                  Busca una herramienta y obliga al negocio a adaptarse.
                </span>
              </p>
            </div>
            <div data-contrast className="glass-dark sheen p-7">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-brand-light">Web Pulsar</p>
              <p className="mt-4 text-[21px] leading-snug text-white sm:text-[24px]">Entiende el negocio y construye la herramienta que necesita.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
