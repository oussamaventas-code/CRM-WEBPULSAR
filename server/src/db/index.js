import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;
pg.types.setTypeParser(20, (value) => Number(value));
const transactionContext = new AsyncLocalStorage();
let pool = null;

function postgresPool() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL no está configurada.');
  // Supabase's shared pooler uses SSL mode "require" by default. Keep TLS on
  // even when the pooler's CA is not in the machine trust store; honor an
  // explicit verify-ca/verify-full request and keep strict verification elsewhere.
  if (!pool) {
    const url = new URL(config.databaseUrl);
    const sslmode = url.searchParams.get('sslmode')?.toLowerCase();
    const supabasePooler = url.hostname.endsWith('.pooler.supabase.com');
    const ssl = supabasePooler && !['verify-ca', 'verify-full'].includes(sslmode)
      ? { rejectUnauthorized: false }
      : true;
    pool = new Pool({ connectionString: config.databaseUrl, max: 1, ssl });
  }
  return pool;
}

function postgresSql(sql) {
  const ignoreDuplicates = /^\s*INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql);
  let out = '';
  let parameter = 0;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      out += sql.slice(i, end < 0 ? sql.length : end);
      i = end < 0 ? sql.length : end - 1;
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end < 0 ? sql.length : end + 2;
      out += sql.slice(i, stop);
      i = stop - 1;
      continue;
    }
    if (ch === '$') {
      const delimiter = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i))?.[0];
      if (delimiter) {
        const end = sql.indexOf(delimiter, i + delimiter.length);
        const stop = end < 0 ? sql.length : end + delimiter.length;
        out += sql.slice(i, stop);
        i = stop - 1;
        continue;
      }
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      const start = i++;
      while (i < sql.length) {
        if (sql[i] === quote && sql[i + 1] === quote) { i += 2; continue; }
        if (sql[i++] === quote) break;
      }
      out += sql.slice(start, i);
      i -= 1;
      continue;
    }
    const rest = sql.slice(i);
    const ignoredInsert = /^INSERT\s+OR\s+IGNORE\s+INTO\b/i.exec(rest);
    if (ignoredInsert) { out += 'INSERT INTO'; i += ignoredInsert[0].length - 1; continue; }
    const nocase = /^COLLATE\s+NOCASE\b/i.exec(rest);
    if (nocase) { i += nocase[0].length - 1; continue; }
    const like = /^LIKE\b/i.exec(rest);
    if (like) { out += 'ILIKE'; i += like[0].length - 1; continue; }
    if (ch === '?') { out += `$${++parameter}`; continue; }
    out += ch;
  }
  if (ignoreDuplicates) {
    const trimmed = out.trimEnd();
    const semicolon = trimmed.endsWith(';');
    const statement = semicolon ? trimmed.slice(0, -1).trimEnd() : trimmed;
    out = `${statement} ON CONFLICT DO NOTHING${semicolon ? ';' : ''}`;
  }
  return out;
}

async function postgresQuery(sql, params = [], { returningId = false } = {}) {
  let statement = postgresSql(sql);
  if (returningId && /^\s*INSERT\b/i.test(statement) && !/\bRETURNING\b/i.test(statement)) {
    const table = /^\s*INSERT\s+INTO\s+(\w+)/i.exec(statement)?.[1]?.toLowerCase();
    if (table && !['role_permissions', 'invoice_series_counters', 'schema_migrations', 'deployment_migrations', 'sessions', 'settings'].includes(table)) statement += ' RETURNING id';
  }
  const tx = transactionContext.getStore();
  const args = params?.length ? [statement, params] : [statement];
  const result = tx ? await tx.client.query(...args) : await postgresPool().query(...args);
  return { rows: result.rows, changes: result.rowCount ?? 0, lastInsertRowid: result.rows?.[0]?.id == null ? undefined : Number(result.rows[0].id) };
}

// node:sqlite es síncrono: las transacciones no pueden contener await.

export function openDatabase(file = config.databasePath) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new DatabaseSync(file);
  conn.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  return conn;
}

let conn = null;
const statements = new Map();
const MAX_CACHED = 400;

export function getConnection() {
  if (config.databaseUrl) throw new Error('El motor Postgres es asíncrono; usa los métodos db.* con await.');
  if (!conn) conn = openDatabase();
  return conn;
}

/** Sustituye la conexión activa (tests). */
export function useConnection(next) {
  conn = next;
  statements.clear();
}

export function closeConnection() {
  if (conn) conn.close();
  conn = null;
  statements.clear();
  if (pool) { const closing = pool; pool = null; return closing.end(); }
}

function prepare(sql) {
  let stmt = statements.get(sql);
  if (!stmt) {
    stmt = getConnection().prepare(sql);
    if (statements.size >= MAX_CACHED) statements.delete(statements.keys().next().value);
    statements.set(sql, stmt);
  }
  return stmt;
}

function normalize(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === 'object' && !(value instanceof Uint8Array)) return JSON.stringify(value);
  return value;
}

const bind = (params = []) => params.map(normalize);
const plain = (row) => (row ? { ...row } : null);

export const db = {
  all: (sql, params) => config.databaseUrl ? postgresQuery(sql, params).then((r) => r.rows) : prepare(sql).all(...bind(params)).map(plain),
  get: (sql, params) => config.databaseUrl ? postgresQuery(sql, params).then((r) => r.rows[0] ?? null) : plain(prepare(sql).get(...bind(params))),
  run: (sql, params) => config.databaseUrl ? postgresQuery(sql, params, { returningId: true }).then(({ changes, lastInsertRowid }) => ({ changes, lastInsertRowid })) : prepare(sql).run(...bind(params)),
  value: (sql, params) => {
    if (config.databaseUrl) return postgresQuery(sql, params).then((r) => r.rows[0] ? Object.values(r.rows[0])[0] : null);
    const row = prepare(sql).get(...bind(params));
    return row ? Object.values(row)[0] : null;
  },
  exec: (sql) => config.databaseUrl ? postgresQuery(sql).then(() => undefined) : getConnection().exec(sql),
};

let depth = 0;

/** Ejecuta fn dentro de una transacción (anidable mediante SAVEPOINT). */
export async function tx(fn) {
  if (config.databaseUrl) {
    const parent = transactionContext.getStore();
    if (parent) {
      const savepoint = `sp_${++parent.depth}`;
      return parent.client.query(`SAVEPOINT ${savepoint}`).then(async () => {
        try { const result = await fn(); await parent.client.query(`RELEASE ${savepoint}`); return result; }
        catch (err) { await parent.client.query(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`); throw err; }
      });
    }
    const clientPromise = postgresPool().connect();
    return clientPromise.then(async (client) => {
      try {
        await client.query('BEGIN');
        const result = await transactionContext.run({ client, depth: 0 }, fn);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally { client.release(); }
    });
  }
  const c = getConnection();
  const savepoint = `sp_${depth}`;
  c.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
  depth += 1;
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then((value) => {
        depth -= 1;
        c.exec(depth === 0 ? 'COMMIT' : `RELEASE ${savepoint}`);
        return value;
      }).catch((err) => {
        depth -= 1;
        c.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
        throw err;
      });
    }
    depth -= 1;
    c.exec(depth === 0 ? 'COMMIT' : `RELEASE ${savepoint}`);
    return result;
  } catch (err) {
    depth -= 1;
    c.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
    throw err;
  }
}

export const nowIso = () => new Date().toISOString();
