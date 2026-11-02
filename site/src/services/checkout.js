import { config } from '../config.js';
import { request } from './api.js';

// CONTRATOS PROPUESTOS — todavía NO existen en el CRM (ver site/README.md · "Integraciones pendientes").
// Mientras no existan, request() lanza ApiError kind 'unavailable' y la web ofrece pedir presupuesto.
// El navegador nunca envía importes ni decide si un pago está completado: eso lo hace el CRM con Stripe.

/** GET /api/public/services → { services: [{ id, name, description, price, currency, billingType, available }] } */
export async function getServices({ signal } = {}) {
  const data = await request('/api/public/services', { signal, timeout: 8000 });
  return Array.isArray(data?.services) ? data.services.filter((s) => s && s.id && s.available !== false) : [];
}

/** POST /api/public/checkout → { url } (Stripe Checkout alojado). El CRM resuelve el precio a partir de serviceId. */
export async function createCheckout({ serviceId, customer }) {
  const data = await request('/api/public/checkout', {
    method: 'POST',
    body: {
      serviceId,
      customer,
      successUrl: `${config.siteUrl}/pago/exito`,
      cancelUrl: `${config.siteUrl}/pago/cancelado`,
    },
  });
  const url = new URL(data?.url ?? '', window.location.href);
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Respuesta de pago no válida');
  return url.toString();
}

/** GET /api/public/checkout/session?session_id=… → { status: 'paid' | 'open' | 'expired' | … } según el CRM (webhooks de Stripe). */
export function getCheckoutSession(sessionId, { signal } = {}) {
  return request(`/api/public/checkout/session?session_id=${encodeURIComponent(sessionId)}`, { signal });
}
