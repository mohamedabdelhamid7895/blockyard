/* Serves published sites: /sites/<slug>/…, <slug>.SITES_DOMAIN and verified custom domains. */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { one } from './db';
import { env } from './env';

interface Site { files: Record<string, string> }
const TTL = 60_000;
const sites = new Map<string, { site: Site | null; at: number }>();
const hosts = new Map<string, { slug: string | null; at: number }>();

/** Drops cached files and host mappings after a publish, rollback, rename or domain change. */
export function forgetSite(slug: string) {
  sites.delete(slug);
  hosts.clear();
}

async function loadSite(slug: string): Promise<Site | null> {
  const cached = sites.get(slug);
  if (cached && Date.now() - cached.at < TTL) return cached.site;
  const row = await one(`select d.files from projects p join deployments d on d.id = p.live_deployment_id where p.slug = $1`, [slug]);
  const site = row ? { files: row.files as Record<string, string> } : null;
  sites.set(slug, { site, at: Date.now() });
  if (sites.size > 500) sites.delete(sites.keys().next().value!);
  return site;
}

const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8' };

const notFound = (res: Response, msg: string) =>
  res.status(404).type('html').send(`<!doctype html><meta charset="utf-8"><title>Not found</title>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:90vh;color:#555"><div style="text-align:center">
<h1 style="font-size:20px;color:#111">${msg}</h1><p>Built with Blockyard</p></div></body>`);

async function serve(slug: string, rawPath: string, res: Response) {
  const site = await loadSite(slug);
  if (!site) return notFound(res, 'This site is not published');
  let p = decodeURIComponent(rawPath).replace(/^\/+/, '');
  if (!p) p = 'index.html';
  if (!site.files[p] && site.files[`${p.replace(/\/$/, '')}.html`]) p = `${p.replace(/\/$/, '')}.html`;
  const body = site.files[p];
  if (body == null) return site.files['404.html'] ? res.status(404).type('html').send(site.files['404.html']) : notFound(res, 'Page not found');
  res.setHeader('Content-Type', TYPES[p.split('.').pop()!] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.send(body);
}

/** Path-based hosting, always available. */
export const sitesByPath = Router({ strict: true });
sitesByPath.get('/:slug', (req, res) => res.redirect(301, `${req.baseUrl}/${req.params.slug}/`));
sitesByPath.get('/:slug/{*rest}', (req, res) => serve(req.params.slug, req.path.slice(req.params.slug.length + 1), res));

async function slugForHost(host: string): Promise<string | null> {
  const hit = hosts.get(host);
  if (hit && hit.at + TTL > Date.now()) return hit.slug;
  let slug: string | null = null;
  if (env.sitesDomain && host.endsWith('.' + env.sitesDomain)) slug = host.slice(0, -(env.sitesDomain.length + 1));
  else {
    const row = await one(`select p.slug from domains d join projects p on p.id = d.project_id where d.hostname = $1 and d.verified_at is not null`, [host]);
    slug = row?.slug || null;
  }
  hosts.set(host, { slug, at: Date.now() });
  return slug;
}

/** Host-based hosting: subdomains of SITES_DOMAIN and verified custom domains. Other hosts fall through to the app. */
export async function sitesByHost(req: Request, res: Response, next: NextFunction) {
  const host = req.hostname.toLowerCase();
  const appHost = new URL(env.publicUrl).hostname;
  if (host === appHost || host === 'localhost' || host === '127.0.0.1') return next();
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const slug = await slugForHost(host);
  if (!slug) return next();
  await serve(slug, req.path, res);
}
