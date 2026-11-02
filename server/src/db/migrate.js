import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { getConnection } from './index.js';
import { migratePostgres } from './migrate-postgres.js';

/**
 * Aplica en orden las migraciones versionadas (NNN_nombre.sql) que no estén registradas.
 * Cada migración se ejecuta en su propia transacción y se guarda su checksum para detectar
 * modificaciones posteriores de archivos ya aplicados.
 */
export function migrate({ log = console.log } = {}) {
  if (config.databaseUrl) return migratePostgres({ log });
  const c = getConnection();
  c.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Map(c.prepare('SELECT version, name, checksum FROM schema_migrations').all().map((r) => [r.version, r]));
  const files = fs
    .readdirSync(config.migrationsDir)
    .filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f))
    .sort();

  const done = [];
  for (const file of files) {
    const version = Number(file.slice(0, 3));
    const sql = fs.readFileSync(path.join(config.migrationsDir, file), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const previous = applied.get(version);
    if (previous) {
      if (previous.checksum !== checksum) log(`⚠ La migración ${file} cambió después de aplicarse. Crea una migración nueva en lugar de editarla.`);
      continue;
    }
    c.exec('BEGIN IMMEDIATE');
    try {
      c.exec(sql);
      c.prepare('INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)').run(version, file, checksum, new Date().toISOString());
      c.exec('COMMIT');
      done.push(file);
      log(`✓ Migración aplicada: ${file}`);
    } catch (err) {
      c.exec('ROLLBACK');
      throw new Error(`Fallo en la migración ${file}: ${err.message}`);
    }
  }
  return done;
}
