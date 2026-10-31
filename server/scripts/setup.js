// Primera configuración: crea .env con claves aleatorias, aplica migraciones y sincroniza roles.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const envPath = path.join(root, '.env');

if (!fs.existsSync(envPath)) {
  const template = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  fs.writeFileSync(envPath, template.replace(/^MASTER_KEY=.*$/m, `MASTER_KEY=${crypto.randomBytes(32).toString('base64')}`), { mode: 0o600 });
  console.log('✓ Creado .env con una MASTER_KEY aleatoria. Guarda una copia de esa clave en un lugar seguro fuera del servidor.');
} else {
  const content = fs.readFileSync(envPath, 'utf8');
  if (/^MASTER_KEY=\s*$/m.test(content)) {
    fs.writeFileSync(envPath, content.replace(/^MASTER_KEY=\s*$/m, `MASTER_KEY=${crypto.randomBytes(32).toString('base64')}`));
    console.log('✓ MASTER_KEY generada en .env');
  } else {
    console.log('• .env ya existe; no se modifica.');
  }
}

// Claves VAPID para notificaciones push (se generan una sola vez).
{
  const content = fs.readFileSync(envPath, 'utf8');
  if (/^VAPID_PUBLIC_KEY=\s*$/m.test(content) || !/^VAPID_PUBLIC_KEY=/m.test(content)) {
    const webpush = (await import('web-push')).default;
    const keys = webpush.generateVAPIDKeys();
    let next = content.replace(/^VAPID_PUBLIC_KEY=.*$/m, '').replace(/^VAPID_PRIVATE_KEY=.*$/m, '').trimEnd();
    next += `\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`;
    if (!/^VAPID_SUBJECT=/m.test(next)) next += 'VAPID_SUBJECT=mailto:admin@localhost.invalid\n';
    fs.writeFileSync(envPath, next);
    console.log('✓ Claves VAPID generadas en .env (notificaciones push). Cambia VAPID_SUBJECT por tu email.');
  }
}

const { migrate } = await import('../src/db/migrate.js');
const { syncRbac } = await import('../src/auth/rbac.js');
const { db } = await import('../src/db/index.js');
migrate();
syncRbac();
console.log('✓ Base de datos preparada y roles sincronizados.');
if (!db.value('SELECT COUNT(*) FROM users')) {
  console.log('\nSiguiente paso: crea el administrador principal\n  npm run user:create -- --email tu@email.com --name "Tu nombre"\n');
}
