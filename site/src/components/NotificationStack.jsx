import { useEffect, useRef, useState } from 'react';
import { UserPlus, FileText, PhoneCall, ListChecks } from 'lucide-react';
import { prefersReducedMotion } from '../hooks/useReveal.js';

const items = [
  { icon: UserPlus, title: 'Nuevo contacto recibido', meta: 'Formulario web', color: 'text-brand bg-brand-ice' },
  { icon: FileText, title: 'Solicitud de presupuesto', meta: 'Página de servicios', color: 'text-violet bg-violet-soft' },
  { icon: PhoneCall, title: 'Llamada atendida', meta: 'Asistente de voz', color: 'text-ok bg-ok-soft' },
  { icon: ListChecks, title: 'Tarea registrada', meta: 'Seguimiento comercial', color: 'text-warn-ink bg-warn-soft' },
];

/** F6 · Pila de notificaciones que aparecen al entrar en pantalla (ejemplos ilustrativos). */
export default function NotificationStack() {
  const ref = useRef(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return setShown(items.length);
    let timer;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      let n = 0;
      timer = setInterval(() => {
        n += 1;
        setShown(n);
        if (n >= items.length) clearInterval(timer);
      }, 650);
    }, { threshold: 0.4 });
    io.observe(ref.current);
    return () => {
      io.disconnect();
      clearInterval(timer);
    };
  }, []);

  return (
    <figure ref={ref}>
      <ol className="grid gap-2.5" aria-label="Ejemplos de notificaciones">
        {items.map(({ icon: Icon, title, meta, color }, i) => (
          <li
            key={title}
            className="glass-strong flex items-center gap-3 rounded-[18px] p-3 pr-4 transition-all duration-700"
            style={{
              transitionTimingFunction: 'var(--ease)',
              opacity: i < shown ? 1 : 0,
              transform: i < shown ? 'none' : 'translateY(18px) scale(.97)',
            }}
          >
            <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${color}`}><Icon size={17} aria-hidden="true" /></span>
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-medium">{title}</span>
              <span className="block font-mono text-[10.5px] text-ink-soft">{meta}</span>
            </span>
            <span className="ml-auto font-mono text-[10.5px] text-ink-faint">ahora</span>
          </li>
        ))}
      </ol>
      <figcaption className="mt-3 text-[12.5px] text-ink-soft">Ejemplos ilustrativos de avisos de un sistema de gestión.</figcaption>
    </figure>
  );
}
