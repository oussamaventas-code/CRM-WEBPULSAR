import { useId, useState } from 'react';
import { Plus } from 'lucide-react';

/** Acordeón accesible: un botón por pregunta con aria-expanded y región asociada. */
export default function FAQ({ items }) {
  const [open, setOpen] = useState(0);
  const base = useId();

  return (
    <ul className="grid gap-3">
      {items.map((item, i) => {
        const expanded = open === i;
        return (
          <li key={item.q} data-reveal className={`glass rounded-[20px] transition-shadow ${expanded ? 'shadow-glass-lg' : ''}`}>
            <h3>
              <button
                type="button"
                id={`${base}-q${i}`}
                aria-expanded={expanded}
                aria-controls={`${base}-a${i}`}
                onClick={() => setOpen(expanded ? -1 : i)}
                className="flex w-full items-center justify-between gap-4 rounded-[20px] px-5 py-4 text-left text-[15.5px] font-medium sm:px-6"
              >
                {item.q}
                <Plus size={18} aria-hidden="true" className={`shrink-0 text-brand transition-transform duration-300 ${expanded ? 'rotate-45' : ''}`} />
              </button>
            </h3>
            <div
              id={`${base}-a${i}`}
              role="region"
              aria-labelledby={`${base}-q${i}`}
              className="grid transition-[grid-template-rows] duration-300"
              style={{ gridTemplateRows: expanded ? '1fr' : '0fr', transitionTimingFunction: 'var(--ease)' }}
            >
              <div className="overflow-hidden" inert={!expanded}>
                <p className="px-5 pb-5 text-[14.5px] text-ink-soft sm:px-6">{item.a}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
