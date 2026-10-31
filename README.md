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
| Desarrollo | Últimos commits de GitHub por proyecto, autor y preview en vivo *(nuevo)* |
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

Tres añadidos que **no modifican el esquema ni los datos existentes** (la migración `006` solo crea una tabla y dos columnas opcionales). Todo sigue funcionando igual si no se usan.

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

### 3. Desarrollo: actividad de GitHub

- **Qué hace:** en cada proyecto se puede indicar el repositorio y la URL de preview. La página **Desarrollo** muestra los últimos commits de todos los proyectos con repo, filtrables por autor, con enlace al commit, al repositorio y al preview. En la ficha del proyecto aparece una pestaña «Desarrollo».
- **Cómo:** el servidor consulta la API de GitHub (los navegadores nunca la llaman), valida `owner/repo` con una lista estricta y cachea 60 s. Sin token solo lee repos públicos (60 consultas/hora); con `GITHUB_TOKEN` en `.env` lee también privados. Si GitHub falla, la tarjeta muestra el motivo en lugar de romper la página.
- **Dónde:**
  - Base de datos: `006_sales.sql` añade `projects.github_repo` y `projects.preview_url`.
  - API: `server/src/routes/github.js` en `/api/github/activity` (`?project_id=` o `?client_id=`); campos validados en `server/src/routes/projects.js`; `GITHUB_TOKEN` en `server/src/config.js` y `.env.example`.
  - Interfaz: `web/src/pages/development/DevelopmentPage.jsx`, `web/src/components/GithubActivity.jsx`, pestaña en `web/src/pages/projects/ProjectDetail.jsx`, y los dos campos en `projectFields` de `web/src/forms.js`.

### Tests

`server/test/sales.test.js` cubre la validación del repo de GitHub, las restricciones de `deals`, los permisos por rol y la carga/borrado de DEMO. `npm test` → 15 pruebas.

## Documentación

- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) — decisiones técnicas, modelo de datos, elección de base de datos (SQLite vs D1)
- [docs/SEGURIDAD.md](docs/SEGURIDAD.md) — medidas implementadas
- [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) — Hostinger VPS + Nginx + Cloudflare paso a paso
- [docs/RESTAURACION.md](docs/RESTAURACION.md) — copias de seguridad y recuperación

## Estado y siguientes pasos

Implementado y probado de extremo a extremo en local: las 6 fases funcionales (arquitectura, CRM, finanzas, infraestructura, operaciones y seguridad/backups). Pendiente de validar con credenciales reales: las llamadas a Hostinger y Cloudflare (los endpoints siguen la documentación oficial, pero no se han ejecutado contra cuentas reales) y el envío SMTP.

Antes de usar la facturación como sistema oficial, revisa con tu asesoría los requisitos vigentes de VeriFactu y de la factura electrónica: la aplicación prepara el registro encadenado pero **no lo envía a la AEAT**.
