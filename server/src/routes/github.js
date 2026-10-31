import { Router } from 'express';
import { db, nowIso } from '../db/index.js';
import { config } from '../config.js';
import { can } from '../middleware/auth.js';
import { notFound } from '../lib/errors.js';
import { f, parse, z } from '../lib/validate.js';
import { record } from '../lib/audit.js';
import { notify } from '../lib/notify.js';

const router = Router();

// owner/repo: solo caracteres que GitHub admite, para que nunca se pueda alterar la ruta de la petición.
const REPO_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const SHA_RE = /^[0-9a-f]{7,40}$/;
const TTL_MS = 60_000;
const DETAIL_TTL_MS = 10 * 60_000; // un commit no cambia: se cachea más
const MAX_FILES = 40;
const MAX_PATCH_CHARS = 20_000;
const REVIEW_STATUSES = ['new', 'in_review', 'accepted', 'changes_requested'];
const REVIEW_LABEL = { new: 'Nuevo', in_review: 'En revisión', accepted: 'Aceptado', changes_requested: 'Cambios solicitados' };
const cache = new Map();

/** Acepta "owner/repo" o una URL de GitHub y devuelve "owner/repo" (o null si no es válido). */
export function normalizeRepo(value) {
  if (!value) return null;
  const raw = String(value).trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  return REPO_RE.test(raw) ? raw : null;
}

/** GET a la API de GitHub con caché. Devuelve { status, data?, message? } sin lanzar nunca. */
async function ghGet(pathname, ttl) {
  const hit = cache.get(pathname);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'webpulsar-crm', 'X-GitHub-Api-Version': '2022-11-28' };
  if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`;
  let value;
  try {
    const res = await fetch(`https://api.github.com${pathname}`, { headers, signal: AbortSignal.timeout(10_000) });
    if (res.ok) value = { status: 'ok', data: await res.json() };
    else if (res.status === 404) value = { status: 'not_found', message: 'Repositorio no encontrado o privado (configura GITHUB_TOKEN)' };
    else if (res.status === 403 || res.status === 429) value = { status: 'rate_limited', message: 'Límite de la API de GitHub alcanzado (configura GITHUB_TOKEN)' };
    else value = { status: 'error', message: `GitHub respondió ${res.status}` };
  } catch {
    value = { status: 'error', message: 'No se pudo contactar con GitHub' };
  }
  // Los errores se cachean menos tiempo para recuperarse pronto.
  cache.set(pathname, { at: value.status === 'ok' ? Date.now() : Date.now() - ttl + 10_000, value });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return value;
}

const shortCommit = (c) => ({
  sha: c.sha.slice(0, 7),
  message: String(c.commit?.message ?? '').split('\n')[0].slice(0, 200),
  author: c.commit?.author?.name ?? c.author?.login ?? 'Desconocido',
  login: c.author?.login ?? null,
  avatar: c.author?.avatar_url ?? null,
  date: c.commit?.author?.date ?? null,
  url: c.html_url,
});

const reviewsFor = (projectId) =>
  Object.fromEntries(db.all('SELECT sha, status, note, updated_at FROM change_reviews WHERE project_id = ?', [projectId]).map((r) => [r.sha.slice(0, 7), r]));

function linkedProject(id) {
  const p = db.get(
    `SELECT p.id, p.name, p.github_repo, p.preview_url, p.client_id, COALESCE(NULLIF(c.company, ''), c.name) AS client_label
     FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.id = ? AND p.deleted_at IS NULL`,
    [id],
  );
  const repo = normalizeRepo(p?.github_repo);
  if (!p || !repo) throw notFound('El proyecto no tiene un repositorio vinculado');
  return { ...p, repo };
}

/** Actividad reciente de los repositorios vinculados a proyectos (opcionalmente de un cliente o proyecto). */
router.get('/activity', can('projects.read'), async (req, res) => {
  const where = ['p.deleted_at IS NULL', 'p.github_repo IS NOT NULL', "p.github_repo <> ''"];
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
      const project = { id: p.id, name: p.name, status: p.status, preview_url: p.preview_url, client_id: p.client_id, client_label: p.client_label };
      if (!repo) return { project, repo: p.github_repo, status: 'error', commits: [], message: 'Repositorio con formato no válido' };
      const r = await ghGet(`/repos/${repo}/commits?per_page=10`, TTL_MS);
      const reviews = reviewsFor(p.id);
      const commits = r.status === 'ok' ? r.data.map(shortCommit).map((c) => ({ ...c, review: reviews[c.sha] ?? { status: 'new', note: null } })) : [];
      return { project, repo, status: r.status, message: r.message, commits };
    }),
  );
  res.json({ items, authenticated: !!config.githubToken });
});

/** Detalle de un cambio: archivos modificados y diff (recortado para no saturar el navegador). */
router.get('/commit', can('projects.read'), async (req, res) => {
  const { project_id: projectId, sha } = parse(z.object({ project_id: f.id(), sha: z.string().regex(SHA_RE, 'Commit no válido') }), req.query);
  const project = linkedProject(projectId);
  const r = await ghGet(`/repos/${project.repo}/commits/${sha}`, DETAIL_TTL_MS);
  if (r.status !== 'ok') return res.json({ status: r.status, message: r.message, files: [] });
  const c = r.data;
  const files = (c.files ?? []).slice(0, MAX_FILES).map((file) => ({
    filename: file.filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    patch: file.patch ? file.patch.slice(0, MAX_PATCH_CHARS) : null,
    truncated: !!file.patch && file.patch.length > MAX_PATCH_CHARS,
  }));
  res.json({
    status: 'ok',
    commit: { ...shortCommit(c), full_message: String(c.commit?.message ?? '').slice(0, 5000), stats: c.stats ?? null },
    files,
    files_total: c.files?.length ?? 0,
    review: reviewsFor(project.id)[sha.slice(0, 7)] ?? { status: 'new', note: null },
    project: { id: project.id, name: project.name, preview_url: project.preview_url, client_id: project.client_id, client_label: project.client_label },
  });
});

/** Cambia el estado de revisión de un cambio y deja una nota. */
router.put('/reviews', can('projects.write'), (req, res) => {
  const data = parse(
    z.object({ project_id: f.id(), sha: z.string().regex(SHA_RE, 'Commit no válido'), status: f.oneOf(REVIEW_STATUSES), note: f.optText(2000), message: f.optText(200) }),
    req.body,
  );
  const project = linkedProject(data.project_id);
  const sha = data.sha.slice(0, 7);
  const before = db.get('SELECT status FROM change_reviews WHERE project_id = ? AND sha = ?', [project.id, sha]);
  db.run(
    `INSERT INTO change_reviews (project_id, sha, status, note, reviewed_by) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(project_id, sha) DO UPDATE SET status = excluded.status, note = excluded.note, reviewed_by = excluded.reviewed_by, updated_at = ?`,
    [project.id, sha, data.status, data.note ?? null, req.user.id, nowIso()],
  );
  if ((before?.status ?? 'new') !== data.status) {
    record(req, {
      action: 'change.reviewed',
      entityType: 'project',
      entityId: project.id,
      clientId: project.client_id,
      label: project.name,
      summary: `${project.name} · cambio ${sha}: ${REVIEW_LABEL[data.status]}${data.message ? ` (${data.message})` : ''}`,
    });
    if (data.status === 'accepted' || data.status === 'changes_requested') {
      notify({
        excludeUserId: req.user.id,
        type: 'change.reviewed',
        title: `${REVIEW_LABEL[data.status]}: ${project.name} (${sha})`,
        body: `${req.user.name}${data.message ? ` · ${data.message}` : ''}${data.note ? ` — ${data.note}` : ''}`.slice(0, 300),
        severity: data.status === 'accepted' ? 'success' : 'warning',
        entityType: 'project',
        entityId: project.id,
        link: `/trabajo?proyecto=${project.id}&cambio=${sha}&tab=revision`,
      });
    }
  }
  res.json({ ok: true, review: { status: data.status, note: data.note ?? null } });
});

export default router;
