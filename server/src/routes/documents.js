import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { db, nowIso, tx } from '../db/index.js';
import { can } from '../middleware/auth.js';
import { findOr404, hydrate, insert, paginate, update } from '../lib/query.js';
import { f, parse, z } from '../lib/validate.js';
import { badRequest, forbidden, HttpError, notFound } from '../lib/errors.js';
import { record } from '../lib/audit.js';
import { createDownloadUrl, createUploadUrl, inspectObject, removeObject, uploadObject } from '../storage/supabase.js';

const router = Router();
export const DOC_CATEGORIES = ['contract', 'invoice', 'quote', 'technical', 'manual', 'deliverable', 'receipt', 'other'];
const BLOCKED_EXT = /\.(exe|bat|cmd|com|msi|ps1|sh|scr|js|mjs|html?|svg|php|jar|vbs)$/i;
const MAX_UPLOAD_BYTES = 25_000_000;

const useSupabaseStorage = Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
if (!useSupabaseStorage) fs.mkdirSync(config.uploadsDir, { recursive: true });

export const upload = multer({
  storage: useSupabaseStorage ? multer.memoryStorage() : multer.diskStorage({
    destination: config.uploadsDir,
    filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.bin`),
  }),
  limits: { fileSize: useSupabaseStorage ? 4_000_000 : 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (BLOCKED_EXT.test(file.originalname)) return cb(badRequest('Tipo de archivo no permitido por seguridad'));
    cb(null, true);
  },
});

const metaSchema = z.object({
  title: f.optText(200),
  description: f.optText(2000),
  category: f.oneOf(DOC_CATEGORIES).default('other'),
  client_id: f.optId(),
  project_id: f.optId(),
  tags: z.preprocess((v) => (typeof v === 'string' ? (v ? v.split(',').map((t) => t.trim()).filter(Boolean) : []) : v), f.tags()),
});

const uploadInfoSchema = z.object({
  file_name: f.text(200),
  mime_type: z.string().trim().max(200).default('application/octet-stream'),
  size_bytes: f.int(1, MAX_UPLOAD_BYTES),
});

const completedUploadSchema = uploadInfoSchema.extend({
  storage_key: z.string().min(1).max(160),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i, 'Hash no válido'),
});

const cleanFileName = (name) => String(name).split(/[\\/]/).pop().slice(0, 200);

function assertUploadKeyBelongsToUser(key, userId) {
  if (!new RegExp(`^uploads/${Number(userId)}/[a-f0-9-]{36}\\.bin$`, 'i').test(key)) {
    throw forbidden('La carga no pertenece a esta sesión');
  }
}

const hashFile = (file) =>
  new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });

/** Guarda un archivo subido como documento y devuelve su id (reutilizado por gastos). */
export async function storeUpload(req, file, meta) {
  const storageKey = useSupabaseStorage ? `${crypto.randomUUID()}.bin` : path.basename(file.path);
  const sha = useSupabaseStorage ? crypto.createHash('sha256').update(file.buffer).digest('hex') : await hashFile(file.path);
  if (useSupabaseStorage) await uploadObject(storageKey, file.buffer, file.mimetype || 'application/octet-stream');
  try {
    return await (tx(async () => {
      const id = await (insert('documents', {
      client_id: meta.client_id,
      project_id: meta.project_id,
      category: meta.category,
      title: meta.title || file.originalname,
      description: meta.description,
      tags: JSON.stringify(meta.tags ?? []),
      file_name: path.basename(file.originalname).slice(0, 200),
      mime_type: file.mimetype || 'application/octet-stream',
      size_bytes: file.size,
      storage_key: storageKey,
      sha256: sha,
      uploaded_by: req.user.id,
      }));
      await (record(req, { action: 'document.uploaded', entityType: 'document', entityId: id, clientId: meta.client_id, label: meta.title || file.originalname, summary: `Documento subido: ${meta.title || file.originalname}` }));
      return id;
    }));
  } catch (error) {
    if (useSupabaseStorage) await removeObject(storageKey).catch(() => {});
    throw error;
  }
}

/** Registra un archivo que el navegador subió directamente usando una URL firmada de Supabase. */
export async function completeSupabaseUpload(req, body, { transaction = true } = {}) {
  if (!useSupabaseStorage) throw new HttpError(501, 'Las cargas firmadas solo están habilitadas con Supabase Storage.');
  if (!req.perms?.has('documents.write')) throw forbidden();
  const info = parse(completedUploadSchema, body);
  const fileName = cleanFileName(info.file_name);
  if (BLOCKED_EXT.test(fileName)) throw badRequest('Tipo de archivo no permitido por seguridad');
  assertUploadKeyBelongsToUser(info.storage_key, req.user.id);

  const existing = await db.get('SELECT id FROM documents WHERE storage_key = ?', [info.storage_key]);
  if (existing) return existing.id;

  const remote = await inspectObject(info.storage_key);
  if (remote.size !== info.size_bytes) throw badRequest('El tamaño del archivo subido no coincide con el archivo seleccionado');
  const meta = parse(metaSchema, body);
  const save = async () => {
    const id = await insert('documents', {
      client_id: meta.client_id,
      project_id: meta.project_id,
      category: meta.category,
      title: meta.title || fileName,
      description: meta.description,
      tags: JSON.stringify(meta.tags ?? []),
      file_name: fileName,
      mime_type: info.mime_type || 'application/octet-stream',
      size_bytes: info.size_bytes,
      storage_key: info.storage_key,
      sha256: info.sha256.toLowerCase(),
      uploaded_by: req.user.id,
    });
    await record(req, { action: 'document.uploaded', entityType: 'document', entityId: id, clientId: meta.client_id, label: meta.title || fileName, summary: `Documento subido: ${meta.title || fileName}` });
    return id;
  };

  try {
    return transaction ? await tx(save) : await save();
  } catch (error) {
    await removeObject(info.storage_key).catch(() => {});
    throw error;
  }
}

const SELECT = `SELECT d.*, c.name AS client_name, p.name AS project_name, u.name AS uploaded_by_name
  FROM documents d LEFT JOIN clients c ON c.id = d.client_id LEFT JOIN projects p ON p.id = d.project_id LEFT JOIN users u ON u.id = d.uploaded_by`;

router.get('/', can('documents.read'), async (req, res) => {
  const where = ['x.deleted_at IS NULL'];
  const params = [];
  if (req.query.client_id) where.push('x.client_id = ?') && params.push(Number(req.query.client_id));
  if (req.query.project_id) where.push('x.project_id = ?') && params.push(Number(req.query.project_id));
  if (DOC_CATEGORIES.includes(req.query.category)) where.push('x.category = ?') && params.push(req.query.category);
  if (req.query.tag) where.push(config.databaseUrl
    ? 'EXISTS (SELECT 1 FROM jsonb_array_elements_text(x.tags::jsonb) AS tag(value) WHERE tag.value = ?)'
    : 'EXISTS (SELECT 1 FROM json_each(x.tags) WHERE value = ?)') && params.push(String(req.query.tag));
  const result = await (paginate(req.query, {
    from: `(${SELECT}) x`,
    where,
    params,
    searchColumns: ['x.title', 'x.file_name', 'x.description', 'x.client_name', 'x.tags'],
    sortMap: { title: 'x.title COLLATE NOCASE', created_at: 'x.created_at', size: 'x.size_bytes', category: 'x.category', client: 'x.client_name' },
    defaultSort: ['created_at', 'desc'],
    tiebreak: 'x.id DESC',
  }));
  result.items.forEach((r) => {
    hydrate(r);
    delete r.storage_key;
  });
  res.json(result);
});

router.get('/tags', can('documents.read'), async (_req, res) => {
  const sql = config.databaseUrl
    ? 'SELECT DISTINCT tag.value AS tag FROM documents d CROSS JOIN LATERAL jsonb_array_elements_text(d.tags::jsonb) AS tag(value) WHERE d.deleted_at IS NULL ORDER BY 1'
    : 'SELECT DISTINCT j.value AS tag FROM documents d, json_each(d.tags) j WHERE d.deleted_at IS NULL ORDER BY 1';
  res.json((await db.all(sql)).map((r) => r.tag));
});

router.post('/upload-url', can('documents.write'), async (req, res) => {
  if (!useSupabaseStorage) throw new HttpError(501, 'Supabase Storage no está configurado en este entorno.');
  const info = parse(uploadInfoSchema, req.body);
  const fileName = cleanFileName(info.file_name);
  if (BLOCKED_EXT.test(fileName)) throw badRequest('Tipo de archivo no permitido por seguridad');
  const storageKey = `uploads/${req.user.id}/${crypto.randomUUID()}.bin`;
  res.json({ storage_key: storageKey, signed_url: await createUploadUrl(storageKey) });
});

router.post('/complete', can('documents.write'), async (req, res) => {
  const id = await completeSupabaseUpload(req, req.body);
  const doc = hydrate(await db.get(`${SELECT} WHERE d.id = ?`, [id]));
  delete doc.storage_key;
  res.status(201).json(doc);
});

router.post('/upload-cancel', can('documents.write'), async (req, res) => {
  if (!useSupabaseStorage) throw new HttpError(501, 'Supabase Storage no está configurado en este entorno.');
  const key = z.string().min(1).max(160).parse(req.body?.storage_key);
  assertUploadKeyBelongsToUser(key, req.user.id);
  if (!await db.value('SELECT 1 FROM documents WHERE storage_key = ?', [key])) await removeObject(key);
  res.json({ ok: true });
});

router.post('/', can('documents.write'), upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('Selecciona un archivo', { file: 'Obligatorio' });
  try {
    const meta = parse(metaSchema, req.body);
    const id = await storeUpload(req, req.file, meta);
    const doc = hydrate(await (db.get(`${SELECT} WHERE d.id = ?`, [id])));
    delete doc.storage_key;
    res.status(201).json(doc);
  } catch (err) {
    if (req.file.path) fs.rm(req.file.path, { force: true }, () => {});
    throw err;
  }
});

router.patch('/:id', can('documents.write'), async (req, res) => {
  const doc = await (findOr404('documents', req.params.id, { where: 'AND deleted_at IS NULL', message: 'Documento no encontrado' }));
  const data = parse(metaSchema.partial(), req.body);
  await (update('documents', doc.id, { ...data, tags: data.tags ? JSON.stringify(data.tags) : undefined }));
  await (record(req, { action: 'document.updated', entityType: 'document', entityId: doc.id, clientId: doc.client_id, label: doc.title, summary: `Documento actualizado: ${doc.title}` }));
  const out = hydrate(await (db.get(`${SELECT} WHERE d.id = ?`, [doc.id])));
  delete out.storage_key;
  res.json(out);
});

router.delete('/:id', can('documents.delete'), async (req, res) => {
  const doc = await (findOr404('documents', req.params.id, { where: 'AND deleted_at IS NULL', message: 'Documento no encontrado' }));
  await (tx(async () => {
    await (db.run('UPDATE documents SET deleted_at = ?, updated_at = ? WHERE id = ?', [nowIso(), nowIso(), doc.id]));
    await (record(req, { action: 'document.deleted', entityType: 'document', entityId: doc.id, clientId: doc.client_id, label: doc.title, summary: `Documento eliminado: ${doc.title}` }));
  }));
  res.json({ ok: true });
});

/** Descarga autenticada: nunca hay enlaces públicos a los archivos. */
router.get('/:id/download', can('documents.read'), async (req, res) => {
  const doc = await (findOr404('documents', req.params.id, { where: 'AND deleted_at IS NULL', message: 'Documento no encontrado' }));
  await (record(req, { action: 'document.downloaded', entityType: 'document', entityId: doc.id, clientId: doc.client_id, label: doc.title, summary: `Documento descargado: ${doc.title}` }));
  if (useSupabaseStorage) {
    return res.redirect(302, await createDownloadUrl(doc.storage_key, doc.file_name));
  }
  const file = path.join(config.uploadsDir, path.basename(doc.storage_key));
  if (!fs.existsSync(file)) throw notFound('El archivo no está disponible en el almacenamiento');
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.download(file, doc.file_name, { headers: { 'Content-Type': doc.mime_type } });
});

export default router;
