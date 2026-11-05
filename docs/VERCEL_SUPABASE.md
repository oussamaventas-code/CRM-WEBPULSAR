# Despliegue en Vercel y Supabase

El proyecto de Vercel despliega tres servicios desde este repositorio: la API del CRM, su interfaz privada y la web pública. La web pública atiende `/`, el CRM `/crm` y la API `/api`. El CRM guarda sus datos en Supabase PostgreSQL y los documentos en un bucket privado de Supabase Storage. La SQLite local se conserva como origen de la importación.

## 1. Preparar Supabase e importar los datos locales

1. Crea un proyecto Supabase y copia su URL, la clave `service_role` y el connection string de PostgreSQL con el pooler en modo **Transaction**. Usa SSL.
2. En Supabase → SQL Editor, ejecuta una vez el archivo [supabase_setup.sql](../server/migrations/postgres/supabase_setup.sql). Crea el esquema, registra los checksums de las cinco migraciones para que el CRM reconozca que ya están aplicadas y prepara el bucket privado `crm-documents` con límite de 25 MB.
3. Antes de desplegar el CRM o abrir su URL por primera vez, importa los datos locales desde este ordenador. El importador detecta las migraciones del SQL anterior y no las repite.
4. En PowerShell, carga las variables y lanza el importador. Los valores entre comillas se obtienen del panel de Supabase y del `.env` local; no los publiques ni los añadas al repositorio:

```powershell
$env:DATABASE_URL = "<connection string del pooler>"
$env:SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service_role>"
npm run db:import-supabase -- --confirm
```

El importador aplica las migraciones PostgreSQL, comprueba que las tablas de destino estén vacías, importa filas y sube a Storage los documentos locales cuyo SHA-256 coincide. Si los archivos están en una carpeta distinta de `data/uploads`, define `UPLOADS_DIR` antes de ejecutar. La base SQLite original no se borra. La importación escribe un marcador para impedir que se ejecute dos veces accidentalmente.

### Reiniciar Supabase desde cero

Si quieres descartar la base de producción, vacía primero el bucket desde Supabase → Storage → `crm-documents` → **Empty bucket**. Luego ejecuta una vez [supabase_reset.sql](../server/migrations/postgres/supabase_reset.sql) y después vuelve a ejecutar [supabase_setup.sql](../server/migrations/postgres/supabase_setup.sql). Esto elimina las tablas del CRM en Supabase, pero conserva la SQLite local. No ejecutes el importador si quieres que el CRM arranque vacío.

## 2. Proyecto Vercel Services

Importa el repositorio correcto como un proyecto Vercel con **Root Directory `.`** y **Framework Preset `Services`**. El `vercel.json` raíz define tres servicios: `server` (Express, API), `web` (Vite, CRM bajo `/crm`) y `site` (Vite, web pública en `/`). Las rutas `/api/*` llegan a `server`, `/crm/*` a `web` y el resto a `site`. El servicio Express exporta la app desde `server/src/vercel.js` y no inicia el servidor local ni el planificador persistente. La web y el CRM llaman a `/api` desde el navegador en el mismo dominio; por eso `VITE_CRM_API_URL` debe quedar sin definir. No hay llamadas entre servicios de servidor que requieran bindings.

Configura estas variables en Vercel → Settings → Environment Variables para Production (y Preview solo si quieres una base de pruebas independiente):

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `APP_URL` | URL HTTPS final del proyecto, por ejemplo `https://webpulsar-crm.vercel.app` |
| `MASTER_KEY` | La clave maestra actual del `.env` local; debe ser la misma para descifrar las credenciales importadas |
| `DATABASE_URL` | Connection string del pooler Supabase, modo Transaction y SSL |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secreta `service_role`; solo en el backend |
| `SUPABASE_STORAGE_BUCKET` | `crm-documents` |
| `VITE_SUPABASE_ANON_KEY` | Clave pública/anon del mismo proyecto para la subida firmada del navegador |
| `CRON_SECRET` | Secreto aleatorio largo para autorizar las tareas programadas |
| `PUBLIC_FORM_ORIGINS` | Dominios públicos exactos, separados por coma, por ejemplo `https://webpulsar.es,https://www.webpulsar.es` |

También configura las integraciones que uses (`TURNSTILE_SECRET_KEY`, `SMTP_*`, `HOSTINGER_*`, `CLOUDFLARE_*`). No antepongas `VITE_` a secretos del backend. `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` y `MASTER_KEY` nunca deben ir en el proyecto de la web pública ni en el navegador.

La carga de documentos usa URLs de subida firmadas: la función de Vercel autoriza la carga y el navegador envía el archivo directamente al bucket privado usando solo la clave pública/anon, sin exponer `service_role`. Permite el dominio final del CRM en la configuración CORS de Supabase Storage si has restringido los orígenes del proyecto.

En Vercel → Settings → Domains añade el dominio final y configura sus registros DNS. Después despliega. Comprueba `https://<dominio>/api/healthz`, visita `/` para la web pública y `/crm` para el CRM.

### Tareas programadas

`vercel.json` registra monitorización cada minuto, automatizaciones cada 15 minutos, sincronizaciones cada hora y mantenimiento cada hora. Estos horarios requieren un plan Vercel que permita cron jobs con esa frecuencia (Pro); el plan Hobby no admite esas frecuencias. Vercel envía `CRON_SECRET` en el encabezado Bearer y el endpoint rechaza llamadas sin él.

## 3. Desplegar solo la web pública por separado (opcional)

Si se quiere mantener la web pública en otro proyecto, importa el mismo repositorio y pon **Root Directory `site`**. `site/vercel.json` construye esa aplicación estática de Vite. En este caso configura `VITE_CRM_API_URL` con el dominio del CRM. Para el proyecto combinado de Services, deja `VITE_CRM_API_URL` sin definir para que el navegador use `/api` en el mismo origen. Otras variables del proyecto separado:

| Variable | Valor |
|---|---|
| `VITE_CRM_API_URL` | Dominio HTTPS del CRM, por ejemplo `https://crm.webpulsar.es` |
| `VITE_SITE_URL` | Dominio canónico de la web pública |
| `VITE_TURNSTILE_SITE_KEY` | Site key pública, si Turnstile está habilitado |
| `VITE_CHECKOUT_ENABLED` | `false` mientras no estén implementados los endpoints de Stripe descritos en `site/README.md` |

Añade el dominio web a este proyecto. El dominio debe aparecer también en `PUBLIC_FORM_ORIGINS` del CRM para que el formulario público pueda enviar leads.

## Límites conocidos

- Las funciones Vercel tienen un límite de cuerpo de petición de 4.5 MB. El flujo normal de documentos evita ese límite con una URL firmada y permite archivos de hasta 25 MB, según el límite configurado para el bucket. El endpoint multipart de compatibilidad/local sí queda limitado por el tamaño de la función.
- Los backups SQLite locales (`VACUUM INTO`) no se ejecutan en Vercel, cuyo disco de función es efímero. La pantalla de datos indica que las copias de PostgreSQL se gestionan en **Supabase → Database → Backups**. Configura allí la retención adecuada para tu plan.
- El primer despliegue no puede sustituir la configuración de cuentas, dominios, DNS, claves de Supabase y plan de Vercel. No incluyas esas claves en este repositorio.
