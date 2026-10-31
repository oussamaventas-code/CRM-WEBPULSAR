import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { can } from '../middleware/auth.js';
import { badRequest, notFound } from '../lib/errors.js';
import { record } from '../lib/audit.js';

const router = Router();
const dir = path.join(config.uploadsDir, 'branding');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Detecta PNG o JPEG por su cabecera (no se confía en el nombre ni el Content-Type). pdfkit solo admite estos dos. */
export function detectImage(buf) {
  if (buf.length > 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return { ext: 'png' };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg' };
  return null;
}

/** Ruta del logo guardado o null. */
export function logoPath() {
  for (const ext of ['png', 'jpg']) {
    const p = path.join(dir, `logo.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const removeLogo = () => {
  for (const ext of ['png', 'jpg']) fs.rmSync(path.join(dir, `logo.${ext}`), { force: true });
};

router.get('/logo', (_req, res) => {
  const file = logoPath();
  if (!file) throw notFound('Todavía no hay logo');
  res.setHeader('Content-Type', file.endsWith('.png') ? 'image/png' : 'image/jpeg');
  res.setHeader('Cache-Control', 'private, no-cache');
  res.sendFile(file);
});

router.post('/logo', can('settings.manage'), upload.single('file'), (req, res) => {
  if (!req.file) throw badRequest('Selecciona una imagen');
  const kind = detectImage(req.file.buffer);
  if (!kind) throw badRequest('El logo debe ser una imagen PNG o JPG');
  fs.mkdirSync(dir, { recursive: true });
  removeLogo();
  fs.writeFileSync(path.join(dir, `logo.${kind.ext}`), req.file.buffer);
  record(req, { action: 'settings.updated', entityType: 'settings', label: 'logo', summary: 'Logo de la empresa actualizado' });
  res.status(201).json({ ok: true });
});

router.delete('/logo', can('settings.manage'), (req, res) => {
  removeLogo();
  record(req, { action: 'settings.updated', entityType: 'settings', label: 'logo', summary: 'Logo de la empresa eliminado' });
  res.json({ ok: true });
});

export default router;
