import { useCallback, useRef, useState } from 'react';
import { ChevronsLeftRight, FileWarning, StickyNote, Repeat, EyeOff, LayoutGrid, BellRing, Workflow, Gauge } from 'lucide-react';

const before = [
  { icon: FileWarning, text: 'Información dispersa' },
  { icon: StickyNote, text: 'Seguimientos manuales' },
  { icon: Repeat, text: 'Procesos repetitivos' },
  { icon: EyeOff, text: 'Falta de visibilidad' },
];
const after = [
  { icon: LayoutGrid, text: 'Información organizada' },
  { icon: BellRing, text: 'Seguimientos centralizados' },
  { icon: Workflow, text: 'Procesos automatizados' },
  { icon: Gauge, text: 'Mayor control' },
];

function Panel({ items, tone }) {
  const dark = tone === 'after';
  return (
    <div className={`absolute inset-0 flex flex-col justify-center gap-3 p-5 sm:p-10 ${dark ? 'items-end bg-gradient-to-br from-brand to-brand-deep text-white' : 'items-start bg-[#EEF1F5] text-ink'}`}>
      <p className={`font-mono text-[11px] uppercase tracking-[0.16em] ${dark ? 'text-white/70' : 'text-ink-soft'}`}>{dark ? 'Después' : 'Antes'}</p>
      <ul className={`grid w-[46%] min-w-[150px] gap-2.5 ${dark ? 'justify-items-end' : ''}`}>
        {items.map(({ icon: Icon, text }, i) => (
          <li
            key={text}
            className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-[13.5px] sm:px-4 sm:text-[14.5px] ${dark ? 'flex-row-reverse bg-white/10 text-right ring-1 ring-white/20' : 'bg-white/70 ring-1 ring-ink/5'}`}
            style={dark ? undefined : { transform: `rotate(${[-1.2, 0.8, -0.6, 1.1][i]}deg) translateX(${[0, 10, -4, 6][i]}px)` }}
          >
            <Icon size={17} className={dark ? 'text-brand-light' : 'text-ink-faint'} aria-hidden="true" />
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** F5 · Comparador antes/después con divisor arrastrable (ratón, táctil y teclado). */
export default function BeforeAfter() {
  const [pos, setPos] = useState(50);
  const box = useRef(null);

  const moveTo = useCallback((clientX) => {
    const r = box.current.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  }, []);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    moveTo(e.clientX);
  };

  return (
    <figure className="glass sheen rounded-panel p-2">
      <div
        ref={box}
        className="relative h-[340px] touch-pan-y select-none overflow-hidden rounded-[20px] sm:h-[320px]"
        onPointerDown={onPointerDown}
        onPointerMove={(e) => e.buttons === 1 && moveTo(e.clientX)}
      >
        <Panel items={after} tone="after" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <Panel items={before} tone="before" />
        </div>
        <div className="absolute inset-y-0 w-px bg-white shadow-[0_0_0_1px_rgba(23,59,114,0.15)]" style={{ left: `${pos}%` }} aria-hidden="true" />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Comparar antes y después"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos)}
          aria-valuetext={`${Math.round(pos)} % antes`}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 5));
            if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 5));
            if (e.key === 'Home') setPos(0);
            if (e.key === 'End') setPos(100);
          }}
          className="glass-strong absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center !rounded-full text-brand"
          style={{ left: `${pos}%` }}
        >
          <ChevronsLeftRight size={18} aria-hidden="true" />
        </div>
      </div>
      <figcaption className="px-3 pb-1 pt-3 text-[12.5px] text-ink-soft">Arrastra el divisor para comparar. Ilustración conceptual, sin datos de ningún cliente.</figcaption>
    </figure>
  );
}
