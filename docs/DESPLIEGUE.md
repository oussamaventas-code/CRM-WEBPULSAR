# Despliegue en Hostinger VPS + Cloudflare

Probado con Ubuntu 24.04 LTS. Sustituye `crm.webpulsar.es` por tu subdominio.

## 1. Preparar el VPS

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx git ufw
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo adduser --system --group --home /opt/web-pulsar webpulsar
```

Firewall (abre 443 solo a Cloudflare si quieres máxima protección):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 443/tcp
sudo ufw enable
```

## 2. Instalar la aplicación

```bash
sudo -u webpulsar git clone <tu-repositorio> /opt/web-pulsar/app
cd /opt/web-pulsar/app
sudo -u webpulsar npm ci
sudo -u webpulsar npm run build
sudo -u webpulsar npm run setup
```

Edita `/opt/web-pulsar/app/.env`:

```
NODE_ENV=production
HOST=127.0.0.1
API_PORT=4000
APP_URL=https://crm.webpulsar.es
TRUST_PROXY=1
```

Guarda una copia de `MASTER_KEY` en tu gestor de contraseñas. Después:

```bash
sudo chmod 600 /opt/web-pulsar/app/.env
sudo -u webpulsar npm run user:create -- --email tu@email.com --name "Tu nombre"
```

## 3. Servicio systemd

```bash
sudo cp deploy/web-pulsar.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now web-pulsar
```

Logs: `journalctl -u web-pulsar -f`.

## 4. Nginx

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/web-pulsar
sudo ln -s /etc/nginx/sites-available/web-pulsar /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Certificado de origen: en Cloudflare → SSL/TLS → Origin Server → *Create certificate* y guarda los archivos en `/etc/ssl/cloudflare/` (rutas usadas en `deploy/nginx.conf`).

## 5. Cloudflare

1. Registro DNS `A crm → IP del VPS` con **proxy activado** (nube naranja).
2. SSL/TLS → modo **Full (strict)**; *Always Use HTTPS* activado; HSTS opcional.
3. Security → WAF con reglas gestionadas; *Bot Fight Mode*.
4. Opcional, muy recomendable: **Cloudflare Access** (Zero Trust) con los emails de los administradores delante de `crm.webpulsar.es`, excluyendo `/api/agent/*` para que los agentes puedan enviar métricas y `/api/public/*` para que la web pública pueda enviar formularios.

## Formulario de la web pública

`POST /api/public/leads` recibe solicitudes de contacto sin sesión. Cada una crea un cliente en estado **pendiente** con origen `web` y etiqueta `web` (o, si el email ya existe, se añade al cliente existente), guarda el mensaje en sus comunicaciones y avisa a los usuarios activos.

En `.env`:

```
PUBLIC_FORM_ORIGINS=https://webpulsar.es,https://www.webpulsar.es
TURNSTILE_SECRET_KEY=   # opcional, Cloudflare Turnstile
```

Cuerpo JSON: `name`, `email`, `message` y `consent: true` obligatorios; `phone`, `company`, `service`, `source` opcionales; `website` es un campo trampa oculto que debe ir vacío; `turnstileToken` es obligatorio si hay `TURNSTILE_SECRET_KEY`. Respuestas: `201 { ok: true }`, `400 { error, fields }`, `403` (origen no permitido) y `429` (más de 5 envíos en 15 minutos desde la misma IP).

## 6. Integraciones

En la app: *Configuración → Integraciones*.

- **Hostinger:** hPanel → Perfil → API → token con caducidad.
- **Cloudflare:** API Token personalizado con Zone:Read, DNS:Edit, Zone Settings:Read, Account Settings:Read, Workers Scripts:Read, D1:Read, Workers R2 Storage:Read.
- **SMTP:** por ejemplo `smtp.hostinger.com`, puerto 465, SSL activado.

## 7. Copias externas

La app crea una copia diaria en `data/backups` (retención `BACKUP_KEEP`). Copia además `data/backups` y `data/uploads` fuera del VPS, por ejemplo a R2 con `rclone` y cifrado:

```bash
sudo crontab -u webpulsar -e
```

```
30 4 * * * rclone sync /opt/web-pulsar/app/data/backups r2-cifrado:web-pulsar/backups && rclone sync /opt/web-pulsar/app/data/uploads r2-cifrado:web-pulsar/uploads
```

## 8. Actualizar

```bash
cd /opt/web-pulsar/app
sudo -u webpulsar npm run backup
sudo -u webpulsar git pull
sudo -u webpulsar npm ci
sudo -u webpulsar npm run build
sudo systemctl restart web-pulsar
```

Las migraciones pendientes se aplican automáticamente al arrancar.
