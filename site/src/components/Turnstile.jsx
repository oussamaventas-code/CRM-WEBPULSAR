import { useEffect, useRef } from 'react';
import { config } from '../config.js';

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading;

function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => {
      loading = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Cloudflare Turnstile (anti-spam). Solo se carga si hay VITE_TURNSTILE_SITE_KEY.
 * Devuelve el token por onToken; el CRM lo verifica con su clave secreta.
 * `resetKey` cambia para pedir un token nuevo (los tokens son de un solo uso).
 */
export default function Turnstile({ onToken, onError, resetKey }) {
  const box = useRef(null);
  const widget = useRef(null);

  useEffect(() => {
    if (!config.turnstileSiteKey) return undefined;
    let cancelled = false;
    loadScript()
      .then((ts) => {
        if (cancelled || !box.current) return;
        widget.current = ts.render(box.current, {
          sitekey: config.turnstileSiteKey,
          language: 'es',
          theme: 'light',
          callback: (token) => onToken(token),
          'expired-callback': () => onToken(''),
          'error-callback': () => {
            onToken('');
            onError?.();
          },
        });
      })
      .catch(() => onError?.());
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resetKey && widget.current && window.turnstile) {
      onToken('');
      window.turnstile.reset(widget.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (!config.turnstileSiteKey) return null;
  return <div ref={box} className="min-h-[65px]" />;
}
