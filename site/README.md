# Web pública de Web Pulsar (webpulsar.es)

Web estática (React 19 + Vite + Tailwind 3.4.17 + GSAP). **No tiene backend propio**: el backend del CRM (`server/`) atiende sus peticiones por `/api`. Tiene su propio `package.json` y no forma parte de los workspaces de npm del CRM.

## Desarrollo

```bash
cd site
npm install
npm run dev          # http://localhost:5174 — /api va al CRM local (127.0.0.1:4000)
```

Arranca también el CRM (`npm run dev` en la raíz) para probar el formulario.

## Dónde se edita cada cosa

| Qué | Archivo |
|---|---|
| Proyectos del portfolio (fotos, capturas, vídeo) | `src/data/projects.js` + imágenes en `public/img/portfolio/` |
| Demo del asistente de voz (audio/vídeo, transcripción) | `src/data/content.js` → `voiceDemo` |
| FAQ, proceso, servicios del formulario | `src/data/content.js` |
| **Datos legales del titular** (obligatorio antes de publicar) | `src/data/content.js` → `legalEntity` |
| Email, teléfono y redes del footer | `src/data/content.js` → `contact` (solo se muestran si tienen valor) |
| Colores, radios, sombras (mismos que el CRM) | `tailwind.config.js` y `src/styles/index.css` |
| Llamadas al CRM | `src/services/` (`api.js` centraliza timeouts y errores) |

Mientras falte algún dato legal, las páginas legales lo marcan como **[PENDIENTE]** y se sirven con `noindex`.

## Variables de entorno

Copia `.env.example` a `.env.production.local` antes de compilar:

| Variable | Valor |
|---|---|
| `VITE_CRM_API_URL` | Vacío en el despliegue combinado; usa `/api` en el mismo dominio. Solo define una URL absoluta si se despliega por separado. |
| `VITE_TURNSTILE_SITE_KEY` | clave **pública** de Cloudflare Turnstile |
| `VITE_SITE_URL` | `https://webpulsar.es` |
| `VITE_CHECKOUT_ENABLED` | `false` hasta que el CRM tenga los endpoints de pago |

Todo lo que empieza por `VITE_` acaba en el navegador: **nunca** pongas secretos aquí.

## Integración con el CRM

### Ya funciona

`POST /api/public/leads`: el formulario de contacto. El CRM crea un cliente **pendiente** con origen y etiqueta `web` y avisa en el CRM. En el `.env` del CRM:

```
PUBLIC_FORM_ORIGINS=https://webpulsar.es,https://www.webpulsar.es
TURNSTILE_SECRET_KEY=<clave secreta de Turnstile>
```

### Pendiente de implementar en el CRM (contratos propuestos)

Estos endpoints **no existen todavía**. La web está preparada y, mientras `VITE_CHECKOUT_ENABLED=false`, solo ofrece "Solicitar presupuesto" y no los llama.

Flujo: web → CRM → Stripe Checkout (alojado por Stripe) → webhook de Stripe al CRM → web consulta el estado al CRM.

**`GET /api/public/services`**: catálogo de servicios con contratación online.

```json
{ "services": [{ "id": "web-mantenimiento", "name": "Mantenimiento web", "description": "…",
  "price": 4900, "currency": "EUR", "billingType": "monthly", "category": "web", "available": true }] }
```

- `price` en **céntimos** (como el resto del CRM). Es solo informativo.
- `billingType`: `one_time` | `monthly` | `yearly`.
- `category`: `web` | `voice`, la columna de la sección de contratación donde aparece.

**`POST /api/public/checkout`**: `{ serviceId, customer: { name, email }, successUrl, cancelUrl }` → `{ url }`.

- El CRM obtiene el precio **a partir de `serviceId`**; nunca se fía de un importe enviado por el navegador.
- Crea la sesión de Stripe Checkout con `success_url = successUrl + '?session_id={CHECKOUT_SESSION_ID}'`.
- Debe aceptar solo `successUrl` y `cancelUrl` de `https://webpulsar.es`.
- La web solo redirige si `url` es `https://checkout.stripe.com/…`.

**`GET /api/public/checkout/session?session_id=…`** → `{ status: 'paid' | 'open' | 'expired' }`. El estado sale de lo que el CRM ha registrado por **webhooks firmados** de Stripe (`checkout.session.completed`, `invoice.paid`, `customer.subscription.*`, `charge.refunded`), no de la URL.

**Webhook** `POST /api/public/stripe/webhook`: verifica la firma con `STRIPE_WEBHOOK_SECRET` sobre el cuerpo **sin parsear** y actualiza cliente, suscripción y pago en el CRM.

Claves en el `.env` del CRM, nunca en la web: `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`. Al terminar, pon `VITE_CHECKOUT_ENABLED=true`, recompila y añade `connect-src` si cambia algún dominio.

## Despliegue en Vercel

El despliegue combinado usa el `vercel.json` raíz: la web pública se sirve en `/`, el CRM en `/crm` y la API en `/api`. Deja `VITE_CRM_API_URL` sin definir para que los formularios llamen al mismo origen. Para desplegar la web de forma independiente, selecciona esta carpeta como **Root Directory: `site`**, configura `VITE_CRM_API_URL`, `VITE_SITE_URL` y, si se usa, `VITE_TURNSTILE_SITE_KEY`. La configuración SPA independiente está en `site/vercel.json`. Sigue [la guía completa de Vercel y Supabase](../docs/VERCEL_SUPABASE.md).

## Despliegue en el VPS

No toca nada del CRM (ni su servicio, ni su base de datos, ni `crm.webpulsar.es`).

**1. Compilar** (en tu ordenador o en el VPS):

```bash
cd site
npm ci
npm run build        # genera site/dist
```

**2. Copiar al VPS** (sustituye usuario e IP):

```bash
rsync -avz --delete site/dist/ <usuario>@<IP_DEL_VPS>:/tmp/webpulsar-dist/
```

```bash
sudo mkdir -p /var/www/webpulsar
sudo rsync -a --delete /tmp/webpulsar-dist/ /var/www/webpulsar/
sudo chown -R www-data:www-data /var/www/webpulsar
sudo find /var/www/webpulsar -type d -exec chmod 755 {} \; && sudo find /var/www/webpulsar -type f -exec chmod 644 {} \;
```

**3. Certificado de origen**: en Cloudflare → SSL/TLS → Origin Server → *Create certificate* para `webpulsar.es` y `*.webpulsar.es`. Guárdalo en el VPS y anota sus rutas.

**4. Nginx**: edita `site/deploy/nginx.conf`, sustituye `<RUTA_CERTIFICADO>` y `<RUTA_CLAVE>` y:

```bash
sudo cp site/deploy/nginx.conf /etc/nginx/sites-available/webpulsar-site
sudo ln -s /etc/nginx/sites-available/webpulsar-site /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**5. Cloudflare DNS**:

| Tipo | Nombre | Contenido | Proxy |
|---|---|---|---|
| A | `@` | IP real del VPS | Activado (nube naranja) |
| CNAME | `www` | `webpulsar.es` | Activado |

SSL/TLS en **Full (strict)**.

**6. CRM**: añade `PUBLIC_FORM_ORIGINS` (y `TURNSTILE_SECRET_KEY`) al `.env` del CRM y reinicia: `sudo systemctl restart web-pulsar`.

## Antes de publicar

- [ ] Rellenar `legalEntity` en `src/data/content.js` y revisar los textos legales con un profesional.
- [ ] Crear el widget de Turnstile y poner la clave pública y la secreta.
- [ ] Añadir email y teléfono reales en `contact` si quieres mostrarlos.
- [ ] Opcional: capturas reales del CRM (`CrmMockup screenshot`), capturas de los proyectos, vídeo de Nonno y audio de la demo de voz.
- [ ] Comprobar que las fotos de los proyectos se pueden usar públicamente.
