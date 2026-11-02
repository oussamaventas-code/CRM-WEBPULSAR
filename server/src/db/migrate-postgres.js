import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, tx } from './index.js';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations', 'postgres');

export async function migratePostgres({ log = console.log } = {}) {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Map((await db.all('SELECT version, name, checksum FROM schema_migrations')).map((row) => [Number(row.version), row]));
  const files = fs.readdirSync(migrationsDir).filter((name) => /^\d{3}_[\w-]+\.sql$/.test(name)).sort();
  const done = [];
  for (const file of files) {
    const version = Number(file.slice(0, 3));
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const previous = applied.get(version);
    if (previous) {
      if (previous.checksum !== checksum) log(`⚠ La migración Postgres ${file} cambió después de aplicarse. Crea una migración nueva en lugar de editarla.`);
      continue;
    }
    await tx(async () => {
      await db.exec(sql);
      await db.run('INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)', [version, file, checksum, new Date().toISOString()]);
    });
    done.push(file);
    log(`✓ Migración Postgres aplicada: ${file}`);
  }
  return done;
}
