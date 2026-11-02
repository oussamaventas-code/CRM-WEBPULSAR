import { useSyncExternalStore } from 'react';

// Consentimiento de cookies (independiente del consentimiento RGPD del formulario).
// Hoy la web no carga ninguna cookie analítica ni de marketing; cuando se añadan,
// deben cargarse solo si consent.analytics / consent.marketing es true.
const KEY = 'wp-cookie-consent-v1';
const listeners = new Set();
let openRequested = false;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let current = typeof window === 'undefined' ? null : read();
const emit = () => listeners.forEach((l) => l());

export function saveConsent({ analytics, marketing }) {
  current = { necessary: true, analytics: !!analytics, marketing: !!marketing, savedAt: new Date().toISOString() };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* sin almacenamiento: el banner volverá a aparecer en la próxima visita */
  }
  openRequested = false;
  emit();
}

/** Reabre el panel de preferencias (enlace "Configurar cookies"). */
export function openCookieSettings() {
  openRequested = true;
  emit();
}

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useConsent() {
  const consent = useSyncExternalStore(subscribe, () => current, () => null);
  const open = useSyncExternalStore(subscribe, () => openRequested, () => false);
  return { consent, settingsOpen: open || !consent };
}
