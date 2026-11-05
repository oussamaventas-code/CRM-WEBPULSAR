# WEB PULSAR · Business Control Center

CRM/ERP privado de Web Pulsar: clientes, proyectos, servicios, finanzas y facturación, infraestructura (Hostinger + Cloudflare) con monitorización real, incidencias, testimonios, documentación y auditoría, en una sola aplicación.

- **Frontend:** React 19 · Tailwind CSS 3.4.17 · Lucide React · GSAP 3 (`useGSAP` / `gsap.context()` con `revert()`)
- **Backend:** Node.js 22 · Express 5 · API REST modular · validación con Zod · permisos en servidor
- **Base de datos:** SQLite en local o Supabase PostgreSQL en Vercel · migraciones versionadas
- **Despliegue:** Hostinger VPS + Nginx o un proyecto de Vercel Services con API, CRM y web pública

## Despliegue en Vercel y Supabase

Consulta [docs/VERCEL_SUPABASE.md](docs/VERCEL_SUPABASE.md) para configurar Vercel Services, Supabase PostgreSQL y Storage e importar la base SQLite local conservando sus datos.

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

## Documentación

- [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) — decisiones técnicas, modelo de datos, elección de base de datos (SQLite vs D1)
- [docs/SEGURIDAD.md](docs/SEGURIDAD.md) — medidas implementadas
- [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) — Hostinger VPS + Nginx + Cloudflare paso a paso
- [docs/RESTAURACION.md](docs/RESTAURACION.md) — copias de seguridad y recuperación

## Estado y siguientes pasos

Implementado y probado de extremo a extremo en local: las 6 fases funcionales (arquitectura, CRM, finanzas, infraestructura, operaciones y seguridad/backups). Pendiente de validar con credenciales reales: las llamadas a Hostinger y Cloudflare (los endpoints siguen la documentación oficial, pero no se han ejecutado contra cuentas reales) y el envío SMTP.

Antes de usar la facturación como sistema oficial, revisa con tu asesoría los requisitos vigentes de VeriFactu y de la factura electrónica: la aplicación prepara el registro encadenado pero **no lo envía a la AEAT**.
