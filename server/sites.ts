/* Serves published sites: /sites/<slug>/…, <slug>.SITES_DOMAIN and verified custom domains. */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { one } from './db';
import { env } from './env';

interface Experiment { id: string; file: string; variantFile: string; split: number }
interface Site { files: Record<string, string>; experiments: Experiment[] }
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
  const row = await one(`select d.files, d.meta from projects p join deployments d on d.id = p.live_deployment_id where p.slug = $1`, [slug]);
  const site = row ? { files: row.files as Record<string, string>, experiments: (row.meta?.experiments || []) as Experiment[] } : null;
  sites.set(slug, { site, at: Date.now() });
  if (sites.size > 500) sites.delete(sites.keys().next().value!);
  return site;
}

const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  xml: 'application/xml; charset=utf-8', txt: 'text/plain; charset=utf-8' };

const notFound = (res: Response, msg: string) =>
  res.status(404).type('html').send(`<!doctype html><meta charset="utf-8"><title>Not found</title>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:90vh;color:#555"><div style="text-align:center">
<h1 style="font-size:20px;color:#111">${msg}</h1><p>Built with Blockyard</p></div></body>`);

const cookieOf = (req: Request, name: string) => (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '='))?.slice(name.length + 1);

async function serve(slug: string, rawPath: string, req: Request, res: Response, cookiePath = '/') {
  const site = await loadSite(slug);
  if (!site) return notFound(res, 'This site is not published');
  let p = decodeURIComponent(rawPath).replace(/^\/+/, '');
  if (!p) p = 'index.html';
  if (!site.files[p] && site.files[`${p.replace(/\/$/, '')}.html`]) p = `${p.replace(/\/$/, '')}.html`;
  if (p.startsWith('_ab/')) return notFound(res, 'Page not found');
  let body = site.files[p];
  if (body == null) return site.files['404.html'] ? res.status(404).type('html').send(site.files['404.html']) : notFound(res, 'Page not found');
  const type = p.split('.').pop()!;
  const cookies: string[] = [];
  if (type === 'html' && !cookieOf(req, 'by_vid')) cookies.push(`by_vid=${Math.random().toString(36).slice(2)}${Date.now().toString(36)}; Path=${cookiePath}; Max-Age=31536000; SameSite=Lax`);
  // A/B test: each visitor keeps the side they were first given.
  const exp = site.experiments.find((e) => e.file === p);
  if (exp && site.files[exp.variantFile]) {
    let side = cookieOf(req, `by_ab_${exp.id}`);
    if (side !== 'a' && side !== 'b') {
      side = Math.random() * 100 < exp.split ? 'b' : 'a';
      cookies.push(`by_ab_${exp.id}=${side}; Path=${cookiePath}; Max-Age=7776000; SameSite=Lax`);
    }
    if (side === 'b') body = site.files[exp.variantFile];
  }
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  res.setHeader('Content-Type', TYPES[type] || 'application/octet-stream');
  res.setHeader('Cache-Control', exp ? 'private, no-store' : type === 'html' ? 'public, max-age=60, stale-while-revalidate=600' : 'public, max-age=300, stale-while-revalidate=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(body);
}

/** Path-based hosting, always available. */
export const sitesByPath = Router({ strict: true });
sitesByPath.get('/:slug', (req, res) => res.redirect(301, `${req.baseUrl}/${req.params.slug}/`));
sitesByPath.get('/:slug/{*rest}', (req, res) => serve(req.params.slug, req.path.slice(req.params.slug.length + 1), req, res, `/sites/${req.params.slug}/`));

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
  await serve(slug, req.path, req, res);
}
