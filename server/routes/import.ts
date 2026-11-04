/* Import a site from another platform: a live URL (Webflow, WordPress, Squarespace, Wix, Framer, any site)
 * or a ZIP of static files (a Webflow export or any HTML/CSS site). Class rules become editable classes;
 * CSS the visual editor can't represent is kept in the site's head code so pages still look right. */
import express, { Router } from 'express';
import path from 'node:path/posix';
import { unzipSync } from 'fflate';
import { parseHTML } from 'linkedom';
import { one, q } from '../db';
import { fail, needOrgRole, rateLimit, requireAuth } from '../http';
import { newId } from '../security';
import { safeFetch } from '../net';
import { storeAsset } from './assets';
import { uniqueProjectSlug } from './projects';
import { importMarkup, leftoverCSS } from '../../src/importer';
import { bodyNode, sanitizeSlug, uid } from '../../src/model';
import type { Page, Project } from '../../src/types';

export const importer = Router();
importer.use(requireAuth);

interface SourcePage { key: string; html: string }
interface Source {
  pages: SourcePage[];
  /** Returns CSS text for a stylesheet href found on a page. */
  css: (href: string, pageKey: string) => Promise<string>;
  /** Turns a src/href found on a page (or a url() in CSS) into the URL the imported site should use. */
  url: (ref: string, baseKey: string) => string;
  /** Maps a link on a page to the key of another imported page, if it is one. */
  pageKey: (href: string, baseKey: string) => string | null;
}

const PLATFORMS: [RegExp, string][] = [
  [/data-wf-site|webflow\.js|website-files\.com|assets\.website-files/i, 'Webflow'],
  [/wp-content|wp-includes/i, 'WordPress'],
  [/static\.squarespace|squarespace-cdn/i, 'Squarespace'],
  [/static\.wixstatic|wix-code|_wix/i, 'Wix'],
  [/framerusercontent|framer\.com/i, 'Framer'],
  [/cdn\.shopify|shopify/i, 'Shopify'],
];

function slugFor(key: string) {
  const clean = key.replace(/^\/+|\/+$/g, '').replace(/\.html?$/i, '').replace(/\/index$/i, '');
  return !clean || clean === 'index' ? 'index' : sanitizeSlug(clean.replace(/\//g, '-')) || 'page';
}

/** Builds a Blockyard project from the pages of another site. */
async function build(src: Source, name: string) {
  const p: Project = { version: 2, pages: [], classes: { body: {} }, components: {}, collections: [] };
  const cssCache = new Map<string, string>();
  const extraCss: string[] = [];
  const headLinks = new Set<string>();
  const slugs = new Map<string, string>();
  const used = new Set<string>();
  for (const pg of src.pages) {
    let slug = slugFor(pg.key);
    for (let i = 2; used.has(slug); i++) slug = `${slugFor(pg.key)}-${i}`;
    used.add(slug);
    slugs.set(pg.key, slug);
  }
  const warnings = new Set<string>();
  let platform = 'a website';

  for (const pg of src.pages) {
    const { document } = parseHTML(pg.html);
    const plat = PLATFORMS.find(([re]) => re.test(pg.html));
    if (plat) platform = plat[1];

    // Stylesheets: same-site CSS is read in; font services stay linked.
    let css = '';
    for (const link of Array.from(document.querySelectorAll('link[rel~="stylesheet"][href]'))) {
      const href = link.getAttribute('href')!;
      if (/fonts\.googleapis|use\.typekit|fonts\.bunny|use\.fontawesome/i.test(href)) { headLinks.add(src.url(href, pg.key)); continue; }
      const k = `${pg.key}|${href}`;
      if (!cssCache.has(k)) cssCache.set(k, await src.css(href, pg.key).catch(() => { warnings.add(`Couldn't load the stylesheet ${href}`); return ''; }));
      css += cssCache.get(k) + '\n';
    }
    for (const st of Array.from(document.querySelectorAll('style'))) css += (st.textContent || '') + '\n';
    if (document.querySelector('script[src]')) warnings.add('Scripts were not imported. Re-create interactions with Blockyard Interactions, or add scripts as custom code.');

    // Resolve links and media against the source.
    for (const el of Array.from(document.querySelectorAll('[src]'))) el.setAttribute('src', src.url(el.getAttribute('src')!, pg.key));
    for (const el of Array.from(document.querySelectorAll('[srcset]'))) el.removeAttribute('srcset');
    for (const el of Array.from(document.querySelectorAll('[style]'))) el.setAttribute('style', el.getAttribute('style')!.replace(/url\((['"]?)([^'")]+)\1\)/g, (_m, _q, u) => `url("${src.url(u, pg.key)}")`));
    for (const a of Array.from(document.querySelectorAll('a[href]'))) {
      const href = a.getAttribute('href')!;
      if (/^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
      const target = src.pageKey(href, pg.key);
      const hash = href.includes('#') ? href.slice(href.indexOf('#')) : '';
      a.setAttribute('href', target && slugs.has(target) ? `${slugs.get(target)}.html${hash}` : src.url(href, pg.key));
    }

    const body = document.body;
    const nodes = importMarkup(p, document as unknown as Document, body?.innerHTML || '', css);
    extraCss.push(leftoverCSS(css));
    const root = bodyNode();
    root.children = nodes;
    const title = document.querySelector('title')?.textContent?.trim() || '';
    const page: Page = {
      id: uid(), name: title.split(/[|–—-]/)[0].trim() || slugs.get(pg.key)!, slug: slugs.get(pg.key)!, title,
      description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '', root,
    };
    const lang = document.documentElement?.getAttribute('lang');
    if (lang) p.settings = { ...(p.settings || {}), lang };
    p.pages.push(page);
  }
  if (!p.pages.length) fail(400, 'No HTML pages were found');
  if (!p.pages.some((pg) => pg.slug === 'index')) p.pages[0].slug = 'index';

  // De-duplicate stylesheet text shared by every page.
  const leftover = [...new Set(extraCss.filter((c) => c.trim()))].join('\n');
  const head = [...[...headLinks].map((h) => `<link rel="stylesheet" href="${h}">`), leftover ? `<style>\n${leftover}\n</style>` : ''].filter(Boolean).join('\n');
  if (head.length > 200_000) warnings.add('The source site has a very large stylesheet; some of it is kept in Site settings → custom code.');
  p.settings = { ...(p.settings || {}), siteName: name, customCode: { head, body: '' } };
  return { project: p, platform, warnings: [...warnings] };
}

async function saveImported(orgId: string, userId: string, name: string, data: Project, id = newId()) {
  const exists = await one('select 1 from projects where id = $1', [id]);
  if (exists) await q('update projects set data = $1, version = version + 1, updated_at = now() where id = $2', [JSON.stringify(data), id]);
  else await q('insert into projects (id, org_id, name, slug, data, created_by) values ($1, $2, $3, $4, $5, $6)',
    [id, orgId, name, await uniqueProjectSlug(name), JSON.stringify(data), userId]);
  return id;
}

/* ---- From a URL ---- */
const MAX_HTML = 5 * 1024 * 1024;
async function fetchText(url: string, max = MAX_HTML) {
  const res = await safeFetch(url, { headers: { 'User-Agent': 'BlockyardImporter/2.0', Accept: 'text/html,text/css,*/*' } });
  if (!res.ok) fail(400, `${url} answered ${res.status}`);
  const text = await res.text();
  if (text.length > max) fail(413, `${url} is too large to import`);
  return { text, finalUrl: res.url || url, type: res.headers.get('content-type') || '' };
}

importer.post('/org/:orgId/import-url', async (req, res) => {
  await needOrgRole(req.user!.id, req.params.orgId);
  rateLimit(`import:${req.user!.id}`, 5, 60_000);
  let start: URL;
  try { start = new URL(String(req.body?.url || '').trim().replace(/^(?!https?:\/\/)/, 'https://')); } catch { fail(400, 'Enter a website address'); }
  const maxPages = Math.min(Math.max(Number(req.body?.maxPages) || 8, 1), 20);
  const first = await fetchText(start!.toString());
  const origin = new URL(first.finalUrl).origin;
  const keyOf = (u: URL) => (u.pathname.replace(/\/+$/, '') || '/');

  // Crawl same-site pages linked from the first page (breadth first).
  const pages: SourcePage[] = [{ key: keyOf(new URL(first.finalUrl)), html: first.text }];
  const queue: string[] = [];
  const seen = new Set([pages[0].key]);
  const enqueue = (html: string, base: string) => {
    const { document } = parseHTML(html);
    for (const a of Array.from(document.querySelectorAll('a[href]'))) {
      try {
        const u = new URL(a.getAttribute('href')!, base);
        if (u.origin !== origin || /\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|mp4|xml)$/i.test(u.pathname)) continue;
        const k = keyOf(u);
        if (!seen.has(k)) { seen.add(k); queue.push(u.origin + u.pathname); }
      } catch { /* bad link */ }
    }
  };
  enqueue(first.text, first.finalUrl);
  while (queue.length && pages.length < maxPages) {
    const next = queue.shift()!;
    try {
      const r = await fetchText(next);
      if (!/html/i.test(r.type)) continue;
      pages.push({ key: keyOf(new URL(next)), html: r.text });
      enqueue(r.text, next);
    } catch { /* skip pages that fail */ }
  }

  const abs = (ref: string, baseKey: string) => { try { return new URL(ref, origin + baseKey).toString(); } catch { return ref; } };
  const src: Source = {
    pages,
    url: abs,
    pageKey: (href, baseKey) => {
      try { const u = new URL(href, origin + baseKey); return u.origin === origin ? keyOf(u) : null; } catch { return null; }
    },
    css: async (href, baseKey) => {
      const cssUrl = abs(href, baseKey);
      const { text } = await fetchText(cssUrl, 2 * 1024 * 1024);
      return text.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, _q, u) => (u.startsWith('data:') ? m : `url("${new URL(u, cssUrl)}")`));
    },
  };
  const name = String(req.body?.name || '').trim() || new URL(origin).hostname.replace(/^www\./, '');
  const { project, platform, warnings } = await build(src, name);
  const id = await saveImported(req.params.orgId, req.user!.id, name, project);
  res.json({ id, platform, pages: project.pages.length, warnings });
});

/* ---- From a ZIP ---- */
const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml',
  ico: 'image/x-icon', mp4: 'video/mp4', webm: 'video/webm', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', pdf: 'application/pdf',
};

importer.post('/org/:orgId/import-zip', express.raw({ type: () => true, limit: '60mb' }), async (req, res) => {
  await needOrgRole(req.user!.id, req.params.orgId);
  rateLimit(`import:${req.user!.id}`, 5, 60_000);
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(new Uint8Array(req.body as Buffer)); } catch { fail(400, "That file isn't a valid ZIP"); }
  // Ignore macOS metadata and strip a single top-level folder.
  const names = Object.keys(files!).filter((n) => !n.startsWith('__MACOSX/') && !n.endsWith('/') && !/(^|\/)\.DS_Store$/.test(n));
  const top = names.every((n) => n.includes('/')) ? names[0].split('/')[0] + '/' : '';
  const get = (n: string) => files![top + n];
  const rel = names.filter((n) => n.startsWith(top)).map((n) => n.slice(top.length));
  const htmlNames = rel.filter((n) => /\.html?$/i.test(n) && !/^(401|404)\.html$/i.test(n)).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b))).slice(0, 50);
  if (!htmlNames.length) fail(400, 'No .html files were found in the ZIP');

  const name = String(req.query.name || '').trim() || 'Imported site';
  const projectId = newId();
  await saveImported(req.params.orgId, req.user!.id, name, { version: 2, pages: [{ id: uid(), name: 'Home', slug: 'index', title: name, description: '', root: bodyNode() }], classes: {}, components: {}, collections: [] }, projectId);

  // Upload media and fonts as assets, once each.
  const assetUrls = new Map<string, string>();
  const text = (n: string) => new TextDecoder().decode(get(n));
  const resolve = (ref: string, baseFile: string) => path.normalize(path.join(path.dirname(baseFile), decodeURIComponent(ref.split(/[?#]/)[0]))).replace(/^\/+/, '');
  const assetFor = async (file: string) => {
    if (assetUrls.has(file)) return assetUrls.get(file)!;
    const ext = file.split('.').pop()!.toLowerCase();
    if (!MIME[ext] || !get(file)) return null;
    const url = await storeAsset(req.params.orgId, projectId, path.basename(file), MIME[ext], Buffer.from(get(file)));
    assetUrls.set(file, url);
    return url;
  };
  // Pre-upload everything referenced so the synchronous URL mapper can use it.
  const refs = new Set<string>();
  for (const h of htmlNames) {
    const html = text(h);
    for (const m of html.matchAll(/(?:src|href)=["']([^"'#?]+)/g)) refs.add(resolve(m[1], h));
    for (const m of html.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) refs.add(resolve(m[2], h));
  }
  for (const css of rel.filter((n) => n.endsWith('.css'))) for (const m of text(css).matchAll(/url\((['"]?)([^'")]+)\1\)/g)) refs.add(resolve(m[2], css));
  let skipped = 0;
  for (const r of refs) {
    if (!get(r) || /\.(html?|css|js)$/i.test(r)) continue;
    if (assetUrls.size >= 300) { skipped++; continue; }
    await assetFor(r).catch(() => { skipped++; });
  }

  const isExternal = (ref: string) => /^([a-z]+:|\/\/|#|data:)/i.test(ref);
  const src: Source = {
    pages: htmlNames.map((n) => ({ key: n, html: text(n) })),
    url: (ref, baseKey) => (isExternal(ref) ? ref : assetUrls.get(resolve(ref, baseKey)) || ref),
    pageKey: (href, baseKey) => {
      if (isExternal(href)) return null;
      const r = resolve(href, baseKey);
      return htmlNames.includes(r) ? r : htmlNames.includes(`${r}/index.html`) ? `${r}/index.html` : null;
    },
    css: async (href, baseKey) => {
      if (isExternal(href)) return '';
      const file = resolve(href, baseKey);
      if (!get(file)) throw new Error('missing');
      return text(file).replace(/url\((['"]?)([^'")]+)\1\)/g, (m, _q, u) => (isExternal(u) ? m : `url("${assetUrls.get(resolve(u, file)) || u}")`));
    },
  };
  const { project, platform, warnings } = await build(src, name);
  if (skipped) warnings.push(`${skipped} files were not uploaded (too many files, or a type that isn't supported).`);
  await saveImported(req.params.orgId, req.user!.id, name, project, projectId);
  res.json({ id: projectId, platform, pages: project.pages.length, assets: assetUrls.size, warnings });
});
