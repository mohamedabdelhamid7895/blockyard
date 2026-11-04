/* Assets: uploaded images, videos, fonts and files, stored in the database and served with long-lived caching. */
import express, { Router } from 'express';
import { one, q } from '../db';
import { env } from '../env';
import { fail, needProject, requireAuth } from '../http';
import { newId } from '../security';

const ALLOWED = /^(image\/(png|jpeg|gif|webp|avif|svg\+xml|x-icon|vnd\.microsoft\.icon)|video\/(mp4|webm)|font\/(woff2?|ttf|otf)|application\/(pdf|font-woff))$/;
const MAX = 10 * 1024 * 1024;

export const assetUrl = (id: string, name: string) => `${env.publicUrl}/assets/${id}/${encodeURIComponent(name)}`;

/** Stores a file for a project and returns its public URL. */
export async function storeAsset(orgId: string, projectId: string | null, name: string, mime: string, data: Buffer) {
  if (!ALLOWED.test(mime)) fail(415, `${mime || 'This file type'} can't be uploaded. Use images, MP4/WebM video, fonts or PDF.`);
  if (data.length > MAX) fail(413, 'Files can be up to 10 MB');
  const id = newId();
  const clean = name.replace(/[^\w.-]+/g, '-').slice(-80) || 'file';
  await q('insert into assets (id, org_id, project_id, name, mime, size, data) values ($1, $2, $3, $4, $5, $6, $7)',
    [id, orgId, projectId, clean, mime, data.length, data]);
  return assetUrl(id, clean);
}

export const assetsApi = Router();
assetsApi.use(requireAuth);

/** Upload: raw file body with its Content-Type, ?name=photo.jpg */
assetsApi.post('/:id/assets', express.raw({ type: () => true, limit: MAX }), async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id);
  const mime = String(req.headers['content-type'] || '').split(';')[0].trim();
  const url = await storeAsset(project.org_id, project.id, String(req.query.name || 'file'), mime, req.body as Buffer);
  res.json({ url });
});

assetsApi.get('/:id/assets', async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id);
  const rows = await q('select id, name, mime, size, created_at from assets where project_id = $1 order by created_at desc limit 200', [project.id]);
  res.json(rows.map((r) => ({ ...r, url: assetUrl(r.id, r.name) })));
});

/** Public, immutable: an asset never changes after upload. SVGs are sandboxed so scripts inside them can't run. */
export const assetsPublic = Router();
assetsPublic.get('/:id/:name', async (req, res) => {
  const row = await one('select mime, data from assets where id = $1', [req.params.id]);
  if (!row) { res.status(404).end(); return; }
  res.setHeader('Content-Type', row.mime);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (row.mime === 'image/svg+xml') res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.send(Buffer.from(row.data));
});
