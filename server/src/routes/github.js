import { Router } from 'express';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { can } from '../middleware/auth.js';
import { notFound } from '../lib/errors.js';

const router = Router();

// owner/repo: solo caracteres que GitHub admite, para que nunca se pueda alterar la ruta de la petición.
const REPO_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const TTL_MS = 60_000;
const cache = new Map();

/** Acepta "owner/repo" o una URL de GitHub y devuelve "owner/repo" (o null si no es válido). */
export function normalizeRepo(value) {
  if (!value) return null;
  const raw = String(value).trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  return REPO_RE.test(raw) ? raw : null;
}

async function ghFetch(repo) {
  const hit = cache.get(repo);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'webpulsar-crm', 'X-GitHub-Api-Version': '2022-11-28' };
  if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`;
  let value;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=8`, { headers, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const raw = await res.json();
      value = {
        status: 'ok',
        commits: raw.map((c) => ({
          sha: c.sha.slice(0, 7),
          message: String(c.commit?.message ?? '').split('\n')[0].slice(0, 200),
          author: c.commit?.author?.name ?? c.author?.login ?? 'Desconocido',
          login: c.author?.login ?? null,
          avatar: c.author?.avatar_url ?? null,
          date: c.commit?.author?.date ?? null,
          url: c.html_url,
        })),
      };
    } else if (res.status === 404) value = { status: 'not_found', commits: [], message: 'Repositorio no encontrado o privado (configura GITHUB_TOKEN)' };
    else if (res.status === 403 || res.status === 429) value = { status: 'rate_limited', commits: [], message: 'Límite de la API de GitHub alcanzado (configura GITHUB_TOKEN)' };
    else value = { status: 'error', commits: [], message: `GitHub respondió ${res.status}` };
  } catch {
    value = { status: 'error', commits: [], message: 'No se pudo contactar con GitHub' };
  }
  // Los errores se cachean menos tiempo para recuperarse pronto.
  cache.set(repo, { at: value.status === 'ok' ? Date.now() : Date.now() - TTL_MS + 10_000, value });
  return value;
}

/** Actividad reciente de los repositorios vinculados a proyectos (opcionalmente de un cliente o proyecto). */
router.get('/activity', can('projects.read'), async (req, res) => {
  const where = ["p.deleted_at IS NULL", "p.github_repo IS NOT NULL", "p.github_repo <> ''"];
  const params = [];
  if (req.query.client_id) where.push('p.client_id = ?') && params.push(Number(req.query.client_id));
  if (req.query.project_id) where.push('p.id = ?') && params.push(Number(req.query.project_id));
  const projects = db.all(
    `SELECT p.id, p.name, p.github_repo, p.preview_url, p.status, c.id AS client_id, COALESCE(NULLIF(c.company, ''), c.name) AS client_label
     FROM projects p JOIN clients c ON c.id = p.client_id WHERE ${where.join(' AND ')} ORDER BY p.updated_at DESC LIMIT 30`,
    params,
  );
  if (req.query.project_id && !projects.length) throw notFound('El proyecto no tiene un repositorio vinculado');
  const items = await Promise.all(
    projects.map(async (p) => {
      const repo = normalizeRepo(p.github_repo);
      const activity = repo ? await ghFetch(repo) : { status: 'error', commits: [], message: 'Repositorio con formato no válido' };
      return { project: { id: p.id, name: p.name, status: p.status, preview_url: p.preview_url, client_id: p.client_id, client_label: p.client_label }, repo, ...activity };
    }),
  );
  res.json({ items, authenticated: !!config.githubToken });
});

export default router;
