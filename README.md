# WEB PULSAR · Business Control Center

CRM/ERP privado de Web Pulsar: clientes, proyectos, servicios, finanzas y facturación, infraestructura (Hostinger + Cloudflare) con monitorización real, incidencias, testimonios, documentación y auditoría, en una sola aplicación.

- **Frontend:** React 19 · Tailwind CSS 3.4.17 · Lucide React · GSAP 3 (`useGSAP` / `gsap.context()` con `revert()`)
- **Backend:** Node.js 22 · Express 5 · API REST modular · validación con Zod · permisos en servidor
- **Base de datos:** SQLite (motor integrado `node:sqlite`, SQL compatible con Cloudflare D1) · migraciones versionadas
- **Infraestructura objetivo:** Hostinger VPS + Nginx + Cloudflare (DNS, proxy y SSL)

> Todo empieza vacío: no hay cifras ni clientes inventados. Los datos de demostración son opcionales, van marcados como **DEMO** y se eliminan con un clic.

## Puesta en marcha (desarrollo)

Requisitos: Node.js **22.13 o superior**.

```bash
npm install
```

```bash
npm run setup
```

```bash
npm run user:create -- --email tu@email.com --name "Tu nombre"
```

```bash
npm run dev
```

Abre http://localhost:5173. La API escucha en `127.0.0.1:4000` y Vite la expone en `/api`.

- `npm run setup` crea `.env` con una `MASTER_KEY` aleatoria (cifrado de tokens y credenciales), aplica las migraciones y sincroniza roles. **Guarda una copia de la `MASTER_KEY` fuera del servidor.**
- El primer usuario creado es el **administrador principal**. Crea el segundo administrador (Ayub) desde *Configuración → Usuarios y roles* o con el mismo comando.
- Datos de prueba opcionales: *Configuración → Copias y datos → Cargar datos DEMO* (o `npm run seed:demo`).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | API (con recarga) + frontend Vite |
| `npm run build` | Compila el frontend en `web/dist` (la API lo sirve en producción) |
| `npm start` | Arranca la API en producción (sirve también el frontend compilado) |
| `npm run migrate` | Aplica migraciones pendientes |
| `npm run user:create` | Crea un usuario (`--role admin\|tecnico\|finanzas\|lectura`) |
| `npm run seed:demo` | Carga datos DEMO |
| `npm run backup` | Copia de seguridad manual de la base de datos |
| `npm test` | Tests del backend (cálculos, NIF, cifrado, permisos, inmutabilidad) |

## Módulos

| Módulo | Incluye |
|---|---|
| Overview | 8 KPIs reales con comparación cuando hay datos previos, gráfico financiero (7/30/90 días, 12 meses), INFRASTRUCTURE OVERVIEW, actividad reciente, acciones rápidas |
| Clientes | Tabla con filtros (activos, pendientes, deuda, proyectos abiertos, archivados), búsqueda en tiempo real, expediente con 8 pestañas, contactos, comunicaciones, archivado y eliminación protegida (nunca borra datos financieros) |
| Ventas | Pipeline Kanban de leads y oportunidades (6 etapas), previsión ponderada, tasa de cierre y ciclo medio *(nuevo)* |
| Trabajo | Punto de partida del día: accesos al CRM, cambios de código de GitHub, diff, preview en vivo y revisión de cada cambio *(nuevo)* |
| Proyectos | Tabla y Kanban (arrastrar y soltar), 10 tipos y 9 estados, tareas con prioridad, responsable, fecha y comentarios, progreso automático, archivos e historial |
| Infraestructura | Servidores, dominios y DNS, bases de datos, aplicaciones/Workers, buckets R2, mapa de relaciones interactivo, monitorización con alertas e integraciones |
| Finanzas | Facturas (series, numeración correlativa, IVA/IRPF, descuentos, PDF, envío por email, rectificativas), cobros, pagos recurrentes, gastos con justificante |
| Servicios | Catálogo con precio, modalidad, periodicidad y margen; asignación a clientes (con cobro recurrente opcional) |
| Incidencias | Bandeja e historial, prioridades, estados, responsable, cronología, creación automática desde alertas críticas |
| Testimonios | Registro privado de opiniones verbales, propuesta de texto y autorización obligatoria antes de publicar |
| Documentación | Repositorio por cliente/proyecto con categorías, etiquetas y búsqueda; almacén cifrado de credenciales |
| Actividad | Cronología inmutable, auditoría encadenada con verificación de integridad, registro de accesos |
| Configuración | Empresa, facturación y series, usuarios y roles, integraciones, umbrales y automatizaciones, cuenta y sesiones, copias y DEMO |

## Integraciones

- **Hostinger** (API oficial, verificada contra su OpenAPI): VPS, recursos, estado, métricas (CPU, RAM, disco, tráfico, uptime), centros de datos, acciones de energía, dominios y caducidad, suscripciones.
- **Cloudflare** (API v4): cuentas, zonas, nameservers, registros DNS (crear/editar/eliminar con confirmación), modo SSL, Workers, D1 (incluida comprobación `SELECT 1`) y R2.
- **SMTP**: envío de facturas y recuperación de contraseña.

Sin token, cada integración aparece como **Pendiente de conexión** con instrucciones. Los tokens se cifran con AES-256-GCM y nunca llegan al navegador. Las limitaciones de cada API se indican en pantalla.

### Agente de monitorización

Para métricas en tiempo real y heartbeat propio, genera un token en la ficha del servidor y sigue las instrucciones (copia `agent/pulsar-agent.mjs` y `agent/webpulsar-agent.service`). El agente no tiene dependencias, no abre puertos y solo envía métricas por HTTPS.

## Novedades de la rama `ayoub/dark-mode-y-extras`

Cinco añadidos que **no modifican el esquema ni los datos existentes** (las migraciones `006` y `007` solo crean tablas nuevas y dos columnas opcionales). Todo sigue funcionando igual si no se usan.

### 1. Modo oscuro (claro · oscuro · sistema)

- **Qué hace:** botón sol/luna en la barra superior con tres opciones. Por defecto sigue el tema del sistema y recuerda la elección (`localStorage`, clave `wp-theme`). Mantiene el efecto cristal sobre un fondo oscuro con orbes de color.
- **Cómo:** los colores de Tailwind pasan a ser variables CSS con canales RGB (`rgb(var(--c-ink) / <alpha-value>)`), así que `bg-brand-ice/70` y el resto de modificadores de opacidad funcionan igual en ambos temas. El tema oscuro es la clase `dark` en `<html>`.
- **Dónde:**
  - `web/tailwind.config.js`: `darkMode: 'class'` y paleta basada en variables.
  - `web/src/styles.css`: bloque `:root` (claro) y `.dark` (oscuro) con todos los tokens, cristal, fondo, inputs, tablas y skeletons.
  - `web/src/context/ThemeContext.jsx` (nuevo) y `web/index.html` (script que evita el parpadeo al cargar).
  - `web/src/layout/Topbar.jsx`: componente `ThemeToggle`.
  - Resto de `.jsx`: `bg-white`/`border-white` → `bg-surface`/`border-surface`, y colores hexadecimales fijos → tokens (`text-ok-ink`, `text-danger-ink`, `bg-track`…). Gráficos y mapa de infraestructura usan `rgb(var(--c-…))` en sus trazos SVG.
- **Para añadir un color nuevo:** define `--c-nombre` en `:root` y en `.dark` (styles.css) y regístralo en `tailwind.config.js`.

### 2. Ventas: pipeline comercial

- **Qué hace:** leads y oportunidades con etapa (Lead → Contactado → Propuesta → Negociación → Ganado/Perdido), valor, cuota mensual recurrente, probabilidad, cierre previsto, responsable y próxima acción. Vista Kanban con arrastrar y soltar, y vista **Previsión** (embudo ponderado y cierres por mes). KPIs: pipeline abierto, previsión ponderada, tasa de cierre y ciclo medio. Al ganar una oportunidad se notifica al otro socio.
- **Cómo:** al mover de etapa la probabilidad se ajusta sola (10/25/50/75/100/0 %) salvo que la fijes a mano. Los cambios quedan en actividad y auditoría. Borrado lógico.
- **Dónde:**
  - Base de datos: `server/migrations/006_sales.sql` (tabla `deals`).
  - API: `server/src/routes/deals.js` montado en `/api/deals` (`GET /`, `GET /summary`, `POST`, `PATCH /:id`, `DELETE /:id`).
  - Permisos nuevos `sales.read` / `sales.write` en `server/src/auth/rbac.js` (administrador: ambos; finanzas: ambos; técnico y lectura: solo lectura).
  - Interfaz: `web/src/pages/sales/SalesPage.jsx`, `dealFields` en `web/src/forms.js`, etiquetas en `web/src/lib/labels.js`, entrada «Ventas» en `web/src/layout/nav.js` y ruta `/ventas` en `web/src/App.jsx`.
  - Datos DEMO: `server/src/seed/demo.js` carga 6 oportunidades y las elimina con el resto de datos DEMO.

### 3. Trabajo: cambios de GitHub, preview en vivo y revisión

- **Qué hace:** la página **Trabajo** (menú lateral) es el punto de partida del día. Arriba tiene accesos directos a Ventas, Proyectos, Clientes, Finanzas e Incidencias; debajo, los últimos cambios de cada repositorio vinculado, con autor y estado. Al pulsar un cambio se abre una ventana con tres pestañas:
  - **Cambios:** archivos modificados y diff con líneas añadidas y quitadas, sin salir del CRM.
  - **Preview en vivo:** el sitio del cliente dentro del CRM, con tamaños móvil, tablet y escritorio, recarga y botón «Abrir en pestaña» (algunos sitios no permiten mostrarse dentro de otra web).
  - **Revisión:** estado (Nuevo, En revisión, Aceptado, Cambios solicitados) y una nota. Al aceptar o pedir cambios, el otro socio recibe un aviso que abre directamente esa pestaña.
  - Desde cada cambio hay enlaces al proyecto y al cliente, y los filtros «Por revisar» / «Aceptados» y por autor ayudan a ver qué falta por probar.
- **Cómo:** en cada proyecto se rellena «Repositorio de GitHub» (`owner/repo` o URL) y «URL de preview». El servidor consulta la API de GitHub (el navegador nunca la llama), valida `owner/repo` y el sha con listas estrictas, recorta los diffs (40 archivos, 20.000 caracteres por archivo) y cachea (60 s la lista, 10 min cada commit). Sin `GITHUB_TOKEN` solo lee repos públicos (60 consultas/hora). `/desarrollo` redirige a `/trabajo`.
- **Dónde:**
  - Base de datos: `006_sales.sql` (`projects.github_repo`, `projects.preview_url`) y `008_work.sql` (`change_reviews`).
  - API: `server/src/routes/github.js` → `GET /api/github/activity`, `GET /api/github/commit`, `PUT /api/github/reviews`.
  - Seguridad: `server/src/middleware/security.js` permite iframes solo a `https:` (`frameSrc`); el CRM sigue sin poder ser incrustado por otros (`frameAncestors 'none'`).
  - Interfaz: `web/src/pages/work/WorkPage.jsx`, `web/src/components/CommitModal.jsx`, `DiffView.jsx`, `PreviewFrame.jsx`, `GithubActivity.jsx`; pestaña «Desarrollo» en la ficha del proyecto.

### 4. Avisos de cobros en el móvil (PWA + push) y por email

- **Qué hace:** la web se puede instalar en el móvil como app («Web Pulsar») y avisa con una notificación del sistema cuando hay un cobro vencido, una factura o mensualidad próxima a vencer, una oportunidad ganada, etc. Al tocar el aviso se abre la pantalla correspondiente.
- **Cómo se activa (cada socio, en cada dispositivo):** abre la web desde el móvil → campana → **«Activar avisos en el móvil»** → aceptar el permiso. El botón **Probar** envía una notificación de prueba.
  - **Android/Chrome:** funciona desde el navegador; mejor instalarla («Añadir a pantalla de inicio»).
  - **iPhone/iPad (iOS 16.4+):** hay que instalarla primero (Compartir → «Añadir a pantalla de inicio») y abrirla desde el icono.
  - **Requisito:** HTTPS en producción (el dominio de Cloudflare/Nginx ya lo cumple). En local solo funciona en `localhost`.
- **Cómo funciona:** cada aviso interno nuevo (`notify()`) se envía además por Web Push a los dispositivos suscritos de sus destinatarios. Los avisos repetidos (misma `dedupe_key`) no vuelven a sonar. Los recordatorios de cobros ya existían y los genera el planificador; se controlan con el interruptor «Recordatorio de cobros» en Configuración → Monitorización y avisos. Los dispositivos dados de baja se limpian solos.
- **También por email:** cada aviso nuevo se envía además por correo a los usuarios activos (asunto «Web Pulsar · …» y enlace directo). Requiere configurar el correo saliente en Configuración → Integraciones → Correo saliente (SMTP) y se apaga con el interruptor «Correo» en Configuración → Monitorización y avisos. Si el SMTP no está configurado, simplemente no se envía. Código: `server/src/services/notifyEmail.js`, enganchado en `server/src/lib/notify.js`.
- **Dónde:**
  - Claves: `npm run setup` genera `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` en `.env` (cambia `VAPID_SUBJECT` por tu email). Si ya tenías `.env`, vuelve a ejecutar `npm run setup`.
  - Base de datos: `server/migrations/007_push.sql` (`push_subscriptions`).
  - API: `server/src/routes/push.js` (`/api/push/status|subscribe|unsubscribe|test`), envío en `server/src/services/push.js`, enganche en `server/src/lib/notify.js`.
  - Interfaz: `web/public/sw.js` (service worker, no cachea nada), `web/public/manifest.webmanifest`, iconos, `web/src/lib/push.js`, `web/src/layout/PushToggle.jsx` (dentro de la campana de `Topbar.jsx`).

### 5. Facturas en PDF con logo

- **Qué hace:** en Configuración → Empresa hay una tarjeta **«Logo de las facturas»** para subir (PNG o JPG, máx. 2 MB), cambiar o quitar el logo. Aparece en la cabecera del PDF, encima del nombre comercial (se cambia en «Nombre comercial») y de los datos fiscales. Sin logo, la factura sale como antes. El PDF ya existía (Facturación → factura → PDF); solo se ha añadido el logo.
- **Cómo:** el servidor comprueba la cabecera real del archivo (no se acepta SVG ni otros formatos, pdfkit solo admite PNG/JPG), lo guarda en `data/uploads/branding/` y `renderInvoicePdf` lo dibuja. El logo se aplica al descargar o enviar cualquier factura, también las ya emitidas.
- **Dónde:** `server/src/routes/branding.js` (`/api/branding/logo`), cabecera del PDF en `server/src/services/invoices.js`, interfaz en `web/src/pages/settings/LogoCard.jsx` (usada desde `SettingsPage.jsx`).

### Tests

`server/test/sales.test.js`, `push-branding.test.js` y `work.test.js` (revisiones y email): validación del repo de GitHub, restricciones de `deals`, permisos, DEMO, detección de imágenes, PDF con y sin logo y push desactivado sin claves. `npm test` → 21 pruebas.

## Documentación

- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) — decisiones técnicas, modelo de datos, elección de base de datos (SQLite vs D1)
- [docs/SEGURIDAD.md](docs/SEGURIDAD.md) — medidas implementadas
- [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) — Hostinger VPS + Nginx + Cloudflare paso a paso
- [docs/RESTAURACION.md](docs/RESTAURACION.md) — copias de seguridad y recuperación

## Estado y siguientes pasos

Implementado y probado de extremo a extremo en local: las 6 fases funcionales (arquitectura, CRM, finanzas, infraestructura, operaciones y seguridad/backups). Pendiente de validar con credenciales reales: las llamadas a Hostinger y Cloudflare (los endpoints siguen la documentación oficial, pero no se han ejecutado contra cuentas reales) y el envío SMTP.

Antes de usar la facturación como sistema oficial, revisa con tu asesoría los requisitos vigentes de VeriFactu y de la factura electrónica: la aplicación prepara el registro encadenado pero **no lo envía a la AEAT**.
