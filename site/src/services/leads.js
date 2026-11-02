import { request } from './api.js';

/**
 * Envía una solicitud de contacto al CRM (endpoint existente: POST /api/public/leads).
 * El CRM crea un cliente pendiente con origen "web" y verifica Turnstile con su clave secreta.
 */
export function sendLead({ name, email, phone, company, service, message, consent, website, turnstileToken }) {
  return request('/api/public/leads', {
    method: 'POST',
    body: { name, email, phone, company, service, message, consent, website, turnstileToken, source: 'web' },
  });
}
