import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../src/config.js';
import { db, closeConnection, tx } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { ensureStorageBucket, uploadObject } from '../src/storage/supabase.js';

if (!process.argv.includes('--confirm')) throw new Error('Confirma la importación con --confirm. No se borran datos de Supabase.');
if (!config.databaseUrl) throw new Error('Configura DATABASE_URL con el pooler de Supabase antes de migrar.');
if (!config.supabaseUrl || !config.supabaseServiceRoleKey) throw new Error('Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY antes de migrar los documentos.');
if (!fs.existsSync(config.databasePath)) throw new Error(`No existe la base SQLite local: ${config.databasePath}`);

await migrate({ log: () => {} });
await ensureStorageBucket();
await db.exec(`CREATE TABLE IF NOT EXISTS deployment_migrations (
  key TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL
)`);
if (await db.value("SELECT 1 FROM deployment_migrations WHERE key = 'sqlite_to_supabase_v1'")) {
  throw new Error('Esta base SQLite ya fue importada. La migración se detiene para evitar sobrescribir cambios de producción.');
}

const sqlite = new DatabaseSync(config.databasePath);
sqlite.exec('BEGIN IMMEDIATE');
try {
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations' ORDER BY rowid").all().map((row) => row.name);
  const seededTables = new Set(['providers', 'integrations', 'invoice_series']);
  for (const table of tables) {
    const exists = await db.value(`SELECT 1 FROM ${table} LIMIT 1`);
    if (exists && !seededTables.has(table)) throw new Error(`Supabase ya contiene datos en ${table}; la importación requiere tablas vacías para preservar las relaciones.`);
  }
  for (const [table, expected] of Object.entries({ providers: 3, integrations: 3, invoice_series: 2 })) {
    const count = Number(await db.value(`SELECT COUNT(*) FROM ${table}`));
    if (count !== 0 && count !== expected) {
      throw new Error(`Supabase contiene ${count} filas en ${table}; solo se permiten las ${expected} filas iniciales que crean las migraciones.`);
    }
  }

  await tx(async () => {
    for (const table of tables) {
      const source = sqlite.prepare(`SELECT * FROM ${table}`);
      const columns = source.columns().map((column) => column.name);
      const quotedTable = `"${table}"`;
      const quotedColumns = columns.map((column) => `"${column}"`).join(', ');
      const placeholders = columns.map(() => '?').join(', ');
      const updates = columns.filter((column) => column !== 'id').map((column) => `"${column}" = EXCLUDED."${column}"`).join(', ');
      let imported = 0;
      for (const row of source.iterate()) {
        const values = columns.map((column) => row[column]);
        const conflict = seededTables.has(table) ? ` ON CONFLICT (id) DO UPDATE SET ${updates}` : '';
        await db.run(`INSERT INTO ${quotedTable} (${quotedColumns}) VALUES (${placeholders})${conflict}`, values);
        imported += 1;
      }
      console.log(`${table}: ${imported} filas`);
    }

    const docs = await db.all('SELECT storage_key, mime_type, sha256 FROM documents WHERE deleted_at IS NULL');
    for (const document of docs) {
      const key = path.basename(document.storage_key);
      const file = path.join(config.uploadsDir, key);
      if (!fs.existsSync(file)) {
        console.warn(`Documento sin archivo local: ${key}`);
        continue;
      }
      const content = fs.readFileSync(file);
      const digest = crypto.createHash('sha256').update(content).digest('hex');
      if (digest !== document.sha256) throw new Error(`El archivo local ${key} no coincide con el SHA-256 guardado en el CRM.`);
      await uploadObject(key, content, document.mime_type || 'application/octet-stream', { upsert: true });
      console.log(`Archivo subido: ${key}`);
    }

    for (const table of tables) {
      const { seq } = await db.get("SELECT pg_get_serial_sequence($1, 'id') AS seq", [table]);
      if (!seq) continue;
      const maxId = await db.value(`SELECT MAX(id) FROM "${table}"`);
      await db.run('SELECT setval($1::regclass, $2, $3)', [seq, maxId ?? 1, maxId != null]);
    }

    await db.run("INSERT INTO deployment_migrations (key, completed_at) VALUES ('sqlite_to_supabase_v1', ?)", [new Date().toISOString()]);
  });
  sqlite.exec('COMMIT');
  console.log('✓ Datos locales importados en Supabase. La base SQLite original se conserva intacta.');
} catch (error) {
  sqlite.exec('ROLLBACK');
  throw error;
} finally {
  sqlite.close();
  await closeConnection();
}
