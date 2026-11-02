import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';
import { saveConsent, useConsent } from '../hooks/useConsent.js';

const CATEGORIES = [
  { id: 'necessary', title: 'Necesarias', text: 'Imprescindibles para que la web funcione y para recordar esta elección. No se pueden desactivar.', locked: true },
  { id: 'analytics', title: 'Analíticas', text: 'Nos ayudarían a entender cómo se usa la web. Ahora mismo no utilizamos ninguna.' },
  { id: 'marketing', title: 'Marketing', text: 'Permitirían mostrar publicidad relevante. Ahora mismo no utilizamos ninguna.' },
];

export default function CookieConsent() {
  const { consent, settingsOpen } = useConsent();
  const [details, setDetails] = useState(false);
  const [prefs, setPrefs] = useState({ analytics: false, marketing: false });
  const titleId = useId();

  useEffect(() => {
    if (settingsOpen && consent) {
      setPrefs({ analytics: consent.analytics, marketing: consent.marketing });
      setDetails(true);
    }
  }, [settingsOpen, consent]);

  if (!settingsOpen) return null;

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="glass-strong sheen fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-[560px] rounded-panel p-5 shadow-float sm:bottom-5"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-brand-ice text-brand"><Cookie size={18} aria-hidden="true" /></span>
        <div>
          <h2 id={titleId} className="text-[15px]">Tu privacidad, tus reglas</h2>
          <p className="mt-1 text-[13px] text-ink-soft">
            Usamos solo lo imprescindible para que la web funcione. Si algún día añadimos cookies analíticas o de marketing, no se activarán sin tu permiso.{' '}
            <Link to="/cookies" className="text-brand underline-offset-4 hover:underline">Política de cookies</Link>
          </p>
        </div>
      </div>

      {details && (
        <ul className="mt-4 space-y-2">
          {CATEGORIES.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-4 rounded-[14px] bg-white/60 p-3">
              <div>
                <p className="text-[13.5px] font-medium">{c.title}</p>
                <p className="text-[12.5px] text-ink-soft">{c.text}</p>
              </div>
              <label className="relative mt-0.5 inline-flex shrink-0 cursor-pointer items-center">
                <span className="sr-only">{c.title}</span>
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={c.locked ? true : prefs[c.id]}
                  disabled={c.locked}
                  onChange={(e) => setPrefs((p) => ({ ...p, [c.id]: e.target.checked }))}
                />
                <span className="h-6 w-10 rounded-full bg-ink/15 transition-colors peer-checked:bg-brand peer-disabled:opacity-60 peer-focus-visible:ring-4 peer-focus-visible:ring-brand/20" />
                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {details ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => saveConsent(prefs)}>Guardar preferencias</button>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDetails(true)}>Configurar</button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => saveConsent({ analytics: false, marketing: false })}>Solo necesarias</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => saveConsent({ analytics: true, marketing: true })}>Aceptar todas</button>
      </div>
    </section>
  );
}
