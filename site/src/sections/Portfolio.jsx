import { useRef } from 'react';
import { MapPin, Check, ImagePlus } from 'lucide-react';
import VideoSlot from '../components/VideoSlot.jsx';
import { projects } from '../data/projects.js';
import { useReveal } from '../hooks/useReveal.js';

const Img = ({ img, className = '' }) => (
  <img src={img.src} alt={img.alt} width={img.width} height={img.height} loading="lazy" decoding="async" className={`h-full w-full object-cover ${className}`} />
);

function Project({ p, reverse }) {
  const scope = useRef(null);
  useReveal(scope, { stagger: 0.15 });
  const [main, second] = p.images;

  return (
    <article ref={scope} className="grid gap-4 lg:grid-cols-12">
      {/* Bloque de identidad */}
      <div data-reveal className={`glass sheen flex flex-col justify-between rounded-panel p-6 sm:p-8 lg:col-span-5 ${reverse ? 'lg:order-2' : ''}`}>
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-mono text-[44px] font-medium leading-none tracking-tight text-brand/20 sm:text-[56px]">{p.number}</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: p.accent }}>{p.category}</span>
          </div>
          <h3 className="mt-5 text-[28px] leading-tight tracking-[-0.02em] sm:text-[32px]">{p.name}</h3>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] text-ink-soft"><MapPin size={13} aria-hidden="true" /> {p.location}</p>
          <p className="mt-5 text-[15.5px] text-ink-soft">{p.intro}</p>
        </div>
        <div className="mt-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">Lo que hemos desarrollado</p>
          <ul className="mt-3 space-y-2">
            {p.work.map((w) => (
              <li key={w} className="flex gap-2.5 text-[14px]">
                <Check size={15} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" /> {w}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Galería: fotografía real + vídeo o espacio para capturas */}
      <div className={`grid gap-4 sm:grid-cols-2 lg:col-span-7 ${reverse ? 'lg:order-1' : ''}`}>
        <figure data-reveal className="overflow-hidden rounded-panel bg-white/40 shadow-glass sm:row-span-2">
          <div className="aspect-[4/5] h-full min-h-[280px]"><Img img={main} className="transition-transform duration-700 hover:scale-[1.03]" /></div>
          <figcaption className="sr-only">{main.alt}</figcaption>
        </figure>
        {p.video ? (
          <div data-reveal className="sm:row-span-1">
            <VideoSlot video={p.video} className="h-full" />
          </div>
        ) : (
          <figure data-reveal className="overflow-hidden rounded-panel bg-white/40 shadow-glass">
            <div className="aspect-[5/4] h-full"><Img img={second} /></div>
            <figcaption className="sr-only">{second.alt}</figcaption>
          </figure>
        )}
        {p.screenshots.length > 0 ? (
          p.screenshots.map((s) => (
            <figure key={s.src} data-reveal className="overflow-hidden rounded-panel shadow-glass">
              <Img img={s} className="object-top" />
            </figure>
          ))
        ) : p.video ? (
          <figure data-reveal className="overflow-hidden rounded-panel bg-white/40 shadow-glass">
            <div className="aspect-[5/4] h-full"><Img img={second} /></div>
            <figcaption className="sr-only">{second.alt}</figcaption>
          </figure>
        ) : (
          <div data-reveal className="glass flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-panel border-dashed p-6 text-center">
            <ImagePlus size={20} className="text-brand" aria-hidden="true" />
            <p className="text-[13.5px] font-medium">Capturas del proyecto</p>
            <p className="text-[12.5px] text-ink-soft">Próximamente</p>
          </div>
        )}
      </div>
    </article>
  );
}

/** SP5 · Showcase grid con los dos proyectos reales. Datos en src/data/projects.js. */
export default function Portfolio() {
  const head = useRef(null);
  useReveal(head);
  return (
    <section id="proyectos" className="section py-24 lg:py-32">
      <header ref={head} className="mb-12 grid gap-6 lg:grid-cols-2 lg:items-end">
        <div>
          <p data-reveal className="eyebrow">Proyectos</p>
          <h2 data-reveal className="mt-4 text-[34px] leading-[1.08] tracking-[-0.025em] sm:text-[46px]">Tecnología real, negocios reales.</h2>
        </div>
        <p data-reveal className="max-w-[460px] text-[16px] text-ink-soft lg:justify-self-end">
          Dos negocios de hostelería de Murcia con su propia forma de trabajar, y un sistema hecho para cada uno.
        </p>
      </header>
      <div className="space-y-6">
        {projects.map((p, i) => <Project key={p.id} p={p} reverse={i % 2 === 1} />)}
      </div>
    </section>
  );
}
