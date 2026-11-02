import { db, nowIso } from '../db/index.js';
import { notFound } from './errors.js';

// Los nombres de tabla/columna llegan siempre desde código, nunca desde la petición.

const defined = (data) => Object.keys(data).filter((k) => data[k] !== undefined);

export async function insert(table, data) {
  const keys = defined(data);
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
  return Number(await (await (db.run(sql, keys.map((k) => data[k])))).lastInsertRowid);
}

export async function update(table, id, data, { touch = true } = {}) {
  const keys = defined(data);
  if (!keys.length) return 0;
  const sets = keys.map((k) => `${k} = ?`);
  const values = keys.map((k) => data[k]);
  if (touch) {
    sets.push('updated_at = ?');
    values.push(nowIso());
  }
  return Number(await (await (db.run(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`, [...values, id]))).changes);
}

export async function findOr404(table, id, { where = '', message } = {}) {
  const row = await (db.get(`SELECT * FROM ${table} WHERE id = ? ${where}`, [id]));
  if (!row) throw notFound(message);
  return row;
}

export const escapeLike = (s) => String(s).replace(/[\\%_]/g, (m) => `\\${m}`);

/**
 * Listado paginado con búsqueda, filtros y ordenación por lista blanca.
 * from puede ser una tabla con joins o una subconsulta con alias.
 */
export async function paginate(query, { select = '*', from, where = [], params = [], searchColumns = [], sortMap, defaultSort, tiebreak = 'id DESC' }) {
  const conditions = [...where];
  const values = [...params];
  const q = String(query.q ?? '').trim();
  if (q && searchColumns.length) {
    conditions.push(`(${searchColumns.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
    searchColumns.forEach(() => values.push(`%${escapeLike(q)}%`));
  }
  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sortKey = sortMap[query.sort] ? query.sort : defaultSort[0];
  const dir = query.dir === 'asc' || query.dir === 'desc' ? query.dir : defaultSort[1];
  const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize, 10) || 25, 1), 500);
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);

  const total = await (db.value(`SELECT COUNT(*) FROM ${from} ${whereSql}`, values));
  const items = await (db.all(
    `SELECT ${select} FROM ${from} ${whereSql} ORDER BY ${sortMap[sortKey]} ${dir.toUpperCase()} NULLS LAST, ${tiebreak} LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  ));
  return { items, total, page, pageSize, sort: sortKey, dir };
}

export const parseJson = (value, fallback) => {
  if (value == null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

/** Convierte columnas JSON conocidas de una fila. */
export function hydrate(row, jsonColumns = ['tags']) {
  if (!row) return row;
  for (const col of jsonColumns) if (col in row) row[col] = parseJson(row[col], Array.isArray(row[col]) ? row[col] : []);
  return row;
}
