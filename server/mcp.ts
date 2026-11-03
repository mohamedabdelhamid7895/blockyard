/* MCP server so Claude (Claude Desktop, Claude Code, claude.ai connectors) can work on Blockyard sites.
 * Authenticated with a personal access token: Authorization: Bearer byk_… */
import type { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { parseHTML } from 'linkedom';
import { q } from './db';
import { bearer, needProject, userFromToken, HttpError, type AuthUser } from './http';
import { publishProject, siteUrls } from './routes/projects';
import { exportFiles } from '../src/codegen';
import { importMarkup } from '../src/importer';
import { walkTree, uid, sanitizeSlug } from '../src/model';
import type { Node, Project } from '../src/types';

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const json = (v: unknown) => text(JSON.stringify(v, null, 2));

async function loadData(user: AuthUser, projectId: string) {
  const { project } = await needProject(user.id, projectId);
  return { project, data: project.data as Project };
}
/** Saves and bumps the version, so an open designer tab is asked to reload instead of overwriting this change. */
async function saveData(projectId: string, data: Project) {
  await q('update projects set data = $1, version = version + 1, updated_at = now() where id = $2', [JSON.stringify(data), projectId]);
}

function outline(n: Node, depth = 0, out: string[] = []): string[] {
  if (depth > 0) {
    const label = `${'  '.repeat(depth - 1)}- ${n.type}${n.classes.length ? ' .' + n.classes.join('.') : ''}`;
    out.push(n.text ? `${label}: "${n.text.slice(0, 80)}"` : label);
  }
  if (depth < 4) (n.children || []).forEach((c) => outline(c, depth + 1, out));
  return out;
}

function buildServer(user: AuthUser) {
  const server = new McpServer({ name: 'blockyard', version: '2.0.0' });

  server.registerTool('list_sites', {
    description: 'List the Blockyard sites (projects) you can access, with their workspace and live URL.',
    inputSchema: {},
  }, async () => {
    const rows = await q(
      `select p.id, p.name, p.slug, p.live_deployment_id, o.name as workspace, m.role from projects p
       join org_members m on m.org_id = p.org_id and m.user_id = $1 join orgs o on o.id = p.org_id
       where m.role <> 'member' or p.team_id is null or exists (select 1 from team_members tm where tm.team_id = p.team_id and tm.user_id = $1)
       order by p.updated_at desc`, [user.id]);
    return json(rows.map((r) => ({ id: r.id, name: r.name, workspace: r.workspace, published: !!r.live_deployment_id, url: siteUrls(r.slug).pathUrl })));
  });

  server.registerTool('get_site', {
    description: 'Get a site\'s pages (with an outline of their elements and text), CMS collections and components.',
    inputSchema: { siteId: z.string() },
  }, async ({ siteId }) => {
    const { project, data } = await loadData(user, siteId);
    return json({
      name: project.name, url: siteUrls(project.slug).pathUrl,
      pages: data.pages.map((p) => ({ name: p.name, slug: p.slug, collectionTemplate: !!p.collectionId, outline: outline(p.root).join('\n') })),
      collections: data.collections.map((c) => ({ name: c.name, slug: c.slug, fields: c.fields.map((f) => `${f.slug} (${f.type})`), items: c.items.length })),
      components: Object.values(data.components).map((c) => c.name),
      customCode: data.settings?.customCode || { head: '', body: '' },
    });
  });

  server.registerTool('get_page_html', {
    description: 'Get the exported HTML of one page plus the site stylesheet.',
    inputSchema: { siteId: z.string(), pageSlug: z.string().describe('Page slug, e.g. "index" or "about"') },
  }, async ({ siteId, pageSlug }) => {
    const { data } = await loadData(user, siteId);
    const files = exportFiles(data);
    const page = files.find((f) => f.name === `${pageSlug}.html`) || files.find((f) => f.name.startsWith(pageSlug));
    if (!page) throw new HttpError(404, `No page "${pageSlug}"`);
    return text(`${page.content}\n\n/* css/styles.css */\n${files.find((f) => f.name === 'css/styles.css')!.content}`);
  });

  server.registerTool('add_section', {
    description: 'Add a section to a page from HTML and CSS. Use class selectors only (.a, .a.b, :hover), with responsive rules in @media (max-width: 991px/767px/479px). The section is inserted above the footer unless position is "start".',
    inputSchema: {
      siteId: z.string(), pageSlug: z.string(), html: z.string(), css: z.string().default(''),
      position: z.enum(['start', 'end']).default('end'),
    },
  }, async ({ siteId, pageSlug, html, css, position }) => {
    const { project, data } = await loadData(user, siteId);
    const page = data.pages.find((p) => p.slug === pageSlug);
    if (!page) throw new HttpError(404, `No page "${pageSlug}"`);
    const { document } = parseHTML('<!doctype html><html><body></body></html>');
    const nodes = importMarkup(data, document as unknown as Document, html, css);
    if (!nodes.length) throw new HttpError(400, 'The HTML had no elements');
    const kids = page.root.children!;
    let index = position === 'start' ? 0 : kids.length;
    if (position === 'start' && kids[0] && (kids[0].tag === 'nav' || kids[0].type === 'symbol')) index = 1;
    const isFooter = (n: Node) => (n.type === 'symbol' ? data.components[n.componentId || '']?.root.tag : n.tag) === 'footer';
    if (position === 'end') while (index > 0 && isFooter(kids[index - 1])) index--;
    kids.splice(index, 0, ...nodes);
    await saveData(project.id, data);
    return text(`Added ${nodes.length} element(s) to "${page.name}". Publish to make it live.`);
  });

  server.registerTool('replace_text', {
    description: 'Replace text everywhere it appears exactly as given (headings, paragraphs, buttons, links) across all pages and components.',
    inputSchema: { siteId: z.string(), find: z.string().min(1), replace: z.string() },
  }, async ({ siteId, find, replace }) => {
    const { project, data } = await loadData(user, siteId);
    let n = 0;
    const visit = (node: Node) => { if (node.text != null && node.text.includes(find)) { node.text = node.text.split(find).join(replace); n++; } };
    data.pages.forEach((p) => walkTree(p.root, visit));
    Object.values(data.components).forEach((c) => walkTree(c.root, visit));
    if (n) await saveData(project.id, data);
    return text(n ? `Updated ${n} element(s).` : 'No elements contained that text.');
  });

  server.registerTool('set_custom_code', {
    description: 'Set site-wide custom code (head: inside <head>; body: before </body>), or a page\'s custom code when pageSlug is given.',
    inputSchema: { siteId: z.string(), pageSlug: z.string().optional(), head: z.string().optional(), body: z.string().optional() },
  }, async ({ siteId, pageSlug, head, body }) => {
    const { project, data } = await loadData(user, siteId);
    const target = pageSlug ? data.pages.find((p) => p.slug === pageSlug) : null;
    if (pageSlug && !target) throw new HttpError(404, `No page "${pageSlug}"`);
    const cur = (target ? target.customCode : data.settings?.customCode) || { head: '', body: '' };
    const next = { head: head ?? cur.head, body: body ?? cur.body };
    if (target) target.customCode = next; else data.settings = { ...(data.settings || {}), customCode: next };
    await saveData(project.id, data);
    return text('Custom code saved. Publish to make it live.');
  });

  server.registerTool('add_cms_items', {
    description: 'Add items to a CMS collection. Each item maps field slugs to string values and needs at least "name".',
    inputSchema: { siteId: z.string(), collection: z.string().describe('Collection name or slug'), items: z.array(z.record(z.string(), z.string())).min(1).max(50) },
  }, async ({ siteId, collection, items }) => {
    const { project, data } = await loadData(user, siteId);
    const c = data.collections.find((x) => x.slug === collection || x.name.toLowerCase() === collection.toLowerCase());
    if (!c) throw new HttpError(404, `No collection "${collection}"`);
    for (const raw of items) {
      const base = sanitizeSlug(raw.slug || raw.name || 'item') || 'item';
      let slug = base, i = 2;
      while (c.items.some((it) => it.data.slug === slug)) slug = `${base}-${i++}`;
      c.items.push({ id: uid(), data: { ...raw, name: raw.name || slug, slug } });
    }
    await saveData(project.id, data);
    return text(`Added ${items.length} item(s) to ${c.name}.`);
  });

  server.registerTool('publish_site', {
    description: 'Publish the site\'s current design so it is live.',
    inputSchema: { siteId: z.string(), note: z.string().optional() },
  }, async ({ siteId, note }) => {
    const { project } = await needProject(user.id, siteId);
    const out = await publishProject(project.id, user.id, note || 'Published from Claude');
    return text(`Published ${out.files} files. Live at ${out.subdomainUrl || out.pathUrl}`);
  });

  return server;
}

/** Stateless Streamable HTTP endpoint: a fresh server per request, bound to the token's user. */
export async function mcpHandler(req: Request, res: Response) {
  const user = await userFromToken(bearer(req));
  if (!user) {
    res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Add a Blockyard access token: Authorization: Bearer byk_…' }, id: null });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
    return;
  }
  const server = buildServer(user);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

