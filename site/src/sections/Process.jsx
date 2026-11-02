import { useRef } from 'react';
import { Ear, PenTool, Code2, TrendingUp } from 'lucide-react';
import { process } from '../data/content.js';
import { useGsap } from '../hooks/useReveal.js';

const icons = [Ear, PenTool, Code2, TrendingUp];

/** P2 · Timeline horizontal (vertical en móvil) con línea SVG que se dibuja con el scroll. */
export default function Process() {
  const scope = useRef(null);

  useGsap(scope, (g) => {
    const st = { trigger: '[data-steps]', start: 'top 75%', end: 'bottom 55%', scrub: 0.6 };
    g.fromTo('[data-line]', { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: 'none', scrollTrigger: st });
    g.from('[data-step]', {
      y: 30,
      opacity: 0,
      duration: 0.8,
      ease: 'power3.out',
      stagger: 0.15,
      scrollTrigger: { trigger: '[data-steps]', start: 'top 78%', once: true },
    });
  });

  return (
    <section id="proceso" ref={scope} className="section py-24 lg:py-32">
      <header className="max-w-[640px]">
        <p className="eyebrow">Cómo trabajamos</p>
        <h2 className="mt-4 text-[34px] leading-[1.08] tracking-[-0.025em] sm:text-[46px]">Escuchamos primero. Diseñamos después. Desarrollamos a medida.</h2>
      </header>

      <div data-steps className="relative mt-16">
        {/* Línea horizontal (desktop) */}
        <svg className="absolute left-0 top-7 hidden h-2 w-full lg:block" viewBox="0 0 100 2" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" y1="1" x2="100" y2="1" stroke="#E4EAF2" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <line data-line x1="0" y1="1" x2="100" y2="1" stroke="url(#proc-g)" strokeWidth="2" vectorEffect="non-scaling-stroke" pathLength="1" strokeDasharray="1" />
          <defs>
            <linearGradient id="proc-g" x1="0" x2="1">
              <stop offset="0" stopColor="#60A5FA" />
              <stop offset="1" stopColor="#2563EB" />
            </linearGradient>
          </defs>
        </svg>
        {/* Línea vertical (móvil) */}
        <svg className="absolute bottom-6 left-7 top-6 w-2 lg:hidden" viewBox="0 0 2 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1="1" y1="0" x2="1" y2="100" stroke="#E4EAF2" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <line data-line x1="1" y1="0" x2="1" y2="100" stroke="#2563EB" strokeWidth="2" vectorEffect="non-scaling-stroke" pathLength="1" strokeDasharray="1" />
        </svg>

        <ol className="relative grid gap-8 lg:grid-cols-4 lg:gap-6">
          {process.map((s, i) => {
            const Icon = icons[i];
            return (
              <li key={s.n} data-step className="flex gap-5 lg:block">
                <span className="glass-strong relative z-10 inline-flex h-14 w-14 shrink-0 items-center justify-center !rounded-[18px] text-brand">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <div className="lg:mt-6">
                  <p className="font-mono text-[12px] text-brand">{s.n}</p>
                  <h3 className="mt-1 text-[22px] tracking-[-0.015em]">{s.title}</h3>
                  <p className="mt-2 max-w-[300px] text-[14.5px] text-ink-soft">{s.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
