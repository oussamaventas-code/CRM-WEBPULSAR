// Variables públicas (VITE_*): nunca guardar aquí secretos; acaban en el JavaScript del navegador.
const env = import.meta.env;

export const config = {
  // Vacío para usar /api en el mismo dominio (Vercel Services y desarrollo local).
  // Solo se define en despliegues separados del CRM.
  crmApiUrl: (env.VITE_CRM_API_URL ?? '').replace(/\/$/, ''),
  turnstileSiteKey: env.VITE_TURNSTILE_SITE_KEY || '',
  siteUrl: (env.VITE_SITE_URL || 'https://webpulsar.es').replace(/\/$/, ''),
  // Activar solo cuando el CRM tenga /api/public/services y /api/public/checkout (ver README).
  checkoutEnabled: env.VITE_CHECKOUT_ENABLED === 'true',
};
