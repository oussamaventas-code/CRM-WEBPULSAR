import { useEffect, useRef, useState } from 'react';
import { Database, Globe, Sparkles, Mic, Workflow, Plug } from 'lucide-react';
import { PulseMark } from './Logo.jsx';
import { prefersReducedMotion } from '../hooks/useReveal.js';

const nodes = [
  { icon: Database, label: 'CRM', tip: 'Tus clientes, proyectos y tareas en un solo sitio.' },
  { icon: Globe, label: 'Web', tip: 'Formularios que llegan directamente a tu CRM.' },
  { icon: Sparkles, label: 'IA', tip: 'Inteligencia artificial aplicada donde aporta valor real.' },
  { icon: Mic, label: 'Voz', tip: 'Asistentes que atienden llamadas y registran lo hablado.' },
  { icon: Workflow, label: 'Automatización', tip: 'Tareas repetitivas que se hacen solas.' },
  { icon: Plug, label: 'APIs', tip: 'Conexión con las herramientas que ya usas.' },
];
const RADIUS = 42; // % del contenedor
const SPEED = (Math.PI * 2) / 70; // una vuelta cada 70 s

const place = (el, angle) => {
  el.style.left = `${50 + RADIUS * Math.cos(angle)}%`;
  el.style.top = `${50 + RADIUS * Math.sin(angle)}%`;
};

/** F8 · Órbita de integraciones: capacidades de Web Pulsar, no marcas de terceros. Las etiquetas siempre quedan derechas. */
export default function IntegrationOrbit() {
  const [active, setActive] = useState(null);
  const items = useRef([]);
  const box = useRef(null);
  const paused = useRef(false);
  paused.current = active !== null;

  useEffect(() => {
    let offset = -Math.PI / 2;
    const draw = () => items.current.forEach((el, i) => el && place(el, offset + (i / nodes.length) * Math.PI * 2));
    draw();
    if (prefersReducedMotion()) return undefined;

    let raf;
    let last;
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(box.current);
    const tick = (t) => {
      if (last !== undefined && visible && !paused.current) {
        offset += SPEED * Math.min(0.1, (t - last) / 1000);
        draw();
      }
      last = t;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  return (
    <div ref={box} className="relative mx-auto aspect-square w-full max-w-[420px]">
      <div aria-hidden="true" className="absolute inset-[8%] rounded-full border border-dashed border-brand/25" />
      <div aria-hidden="true" className="absolute inset-[26%] rounded-full border border-white/70 bg-white/20" />
      <div className="glass-strong sheen absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center !rounded-full">
        <PulseMark className="h-9 w-9" />
        <span className="mt-1 font-mono text-[9.5px] font-semibold tracking-[0.16em]">WEB PULSAR</span>
      </div>
      <ul className="absolute inset-0">
        {nodes.map(({ icon: Icon, label, tip }, i) => (
          <li key={label} ref={(el) => (items.current[i] = el)} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ zIndex: active === i ? 20 : 1 }}>
            <button
              type="button"
              className="glass-strong flex flex-col items-center gap-1 !rounded-[16px] px-3 py-2 text-[11.5px] font-medium text-ink transition-transform hover:scale-105"
              aria-describedby={`orbit-tip-${i}`}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            >
              <Icon size={17} className="text-brand" aria-hidden="true" />
              {label}
            </button>
            <span
              id={`orbit-tip-${i}`}
              role="tooltip"
              className={`pointer-events-none absolute left-1/2 top-full mt-2 w-44 -translate-x-1/2 rounded-[12px] bg-ink px-3 py-2 text-center text-[11.5px] leading-snug text-white shadow-float transition-opacity ${active === i ? 'opacity-100' : 'opacity-0'}`}
            >
              {tip}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
