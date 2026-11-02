import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { HttpError } from '../lib/errors.js';

// Copias consistentes de SQLite con VACUUM INTO (en caliente, sin bloquear la app).
// Los secretos siguen cifrados dentro de la copia: guarda MASTER_KEY por separado.

const NAME = /^webpulsar-\d{8}-\d{6}\.db$/;

export async function createBackup() {
  if (config.databaseUrl) {
    throw new HttpError(501, 'En Vercel las copias de PostgreSQL se gestionan desde Supabase. Configura y revisa Backups en el panel del proyecto Supabase.');
  }
  fs.mkdirSync(config.backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const file = path.join(config.backupsDir, `webpulsar-${stamp}.db`);
  await (db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`));
  pruneBackups();
  return { name: path.basename(file), size_bytes: fs.statSync(file).size };
}

export function listBackups() {
  if (config.databaseUrl) return [];
  if (!fs.existsSync(config.backupsDir)) return [];
  return fs
    .readdirSync(config.backupsDir)
    .filter((f) => NAME.test(f))
    .map((name) => {
      const stat = fs.statSync(path.join(config.backupsDir, name));
      return { name, size_bytes: stat.size, created_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

export function pruneBackups() {
  for (const b of listBackups().slice(config.backups.keep)) fs.rmSync(path.join(config.backupsDir, b.name), { force: true });
}

export function backupPath(name) {
  if (config.databaseUrl) return null;
  if (!NAME.test(name)) return null;
  const file = path.join(config.backupsDir, name);
  return fs.existsSync(file) ? file : null;
}
