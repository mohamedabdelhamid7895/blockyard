/* Projects (sites): listing, editing data, settings, deployments and custom domains. */
import { Router } from 'express';
import dns from 'node:dns/promises';
import crypto from 'node:crypto';
import { one, q } from '../db';
import { env } from '../env';
import { fail, needOrgRole, needProject, requireAuth } from '../http';
import { newId } from '../security';
import { exportFiles } from '../../src/codegen';
import { migrate, sanitizeSlug } from '../../src/model';
import { blankProject, starterProject } from '../../src/templates';
import type { Project } from '../../src/types';
import { forgetSite } from '../sites';

export const projects = Router();
projects.use(requireAuth);

const RESERVED = new Set(['www', 'api', 'app', 'admin', 'mail', 'sites', 'static', 'assets', 'mcp', 'blockyard']);

export async function uniqueProjectSlug(base: string, exceptId = '') {
  base = sanitizeSlug(base).slice(0, 40) || 'site';
  if (RESERVED.has(base)) base += '-site';
  let slug = base, i = 2;
  while (await one('select 1 from projects where slug = $1 and id <> $2', [slug, exceptId])) slug = `${base}-${i++}`;
  return slug;
}

export function siteUrls(slug: string) {
  return {
    pathUrl: `${env.publicUrl}/sites/${slug}/`,
    subdomainUrl: env.sitesDomain ? `https://${slug}.${env.sitesDomain}/` : null,
  };
}

const summary = (p: Record<string, any>) => ({
  id: p.id, orgId: p.org_id, teamId: p.team_id, name: p.name, slug: p.slug, version: p.version,
  published: !!p.live_deployment_id, liveDeploymentId: p.live_deployment_id, createdAt: p.created_at, updatedAt: p.updated_at,
  pageCount: p.page_count, ...siteUrls(p.slug),
});

/** Projects in a workspace the user can see. */
projects.get('/org/:orgId', async (req, res) => {
  const role = await needOrgRole(req.user!.id, req.params.orgId);
  const rows = await q(
    `select p.id, p.org_id, p.team_id, p.name, p.slug, p.version, p.live_deployment_id, p.created_at, p.updated_at,
       jsonb_array_length(p.data->'pages') as page_count
     from projects p where p.org_id = $1
       and ($2 <> 'member' or p.team_id is null or exists (select 1 from team_members tm where tm.team_id = p.team_id and tm.user_id = $3))
     order by p.updated_at desc`, [req.params.orgId, role, req.user!.id]);
  res.json(rows.map(summary));
});

projects.post('/org/:orgId', async (req, res) => {
  await needOrgRole(req.user!.id, req.params.orgId);
  const name = String(req.body?.name || '').trim().slice(0, 80) || 'Untitled site';
  const teamId = req.body?.teamId || null;
  if (teamId && !(await one('select 1 from teams where id = $1 and org_id = $2', [teamId, req.params.orgId]))) fail(400, 'Unknown team');
  const data = req.body?.template === 'blank' ? blankProject() : starterProject();
  const id = newId();
  await q(`insert into projects (id, org_id, team_id, name, slug, data, created_by) values ($1, $2, $3, $4, $5, $6, $7)`,
    [id, req.params.orgId, teamId, name, await uniqueProjectSlug(name), JSON.stringify(data), req.user!.id]);
  res.json({ id });
});

projects.get('/:id', async (req, res) => {
  const { project, role } = await needProject(req.user!.id, req.params.id);
  const org = await one('select name, ai_key_enc is not null as has_ai_key from orgs where id = $1', [project.org_id]);
  res.json({ ...summary(project), data: project.data, role, orgName: org!.name, hasAiKey: org!.has_ai_key });
});

/** Saves the designer's data. `version` must match, so two people can't silently overwrite each other. */
projects.put('/:id/data', async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id);
  const data = migrate(req.body?.data);
  if (!data) fail(400, 'That is not a valid project');
  const baseVersion = Number(req.body?.version);
  if (baseVersion !== project.version) fail(409, 'This site was changed somewhere else. Reload to get the latest version.');
  const row = await one(`update projects set data = $1, version = version + 1, updated_at = now() where id = $2 and version = $3 returning version`,
    [JSON.stringify(data), project.id, baseVersion]);
  if (!row) fail(409, 'This site was changed somewhere else. Reload to get the latest version.');
  res.json({ version: row!.version });
});

projects.patch('/:id', async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id);
  const { name, slug, teamId } = req.body || {};
  if (typeof name === 'string' && name.trim()) await q('update projects set name = $1 where id = $2', [name.trim().slice(0, 80), project.id]);
  if (typeof slug === 'string' && slug.trim()) {
    const clean = sanitizeSlug(slug).slice(0, 40);
    if (!clean || RESERVED.has(clean)) fail(400, 'Choose a different address');
    if (await one('select 1 from projects where slug = $1 and id <> $2', [clean, project.id])) fail(409, 'That address is taken');
    forgetSite(project.slug);
    await q('update projects set slug = $1 where id = $2', [clean, project.id]);
  }
  if (teamId !== undefined) {
    await needOrgRole(req.user!.id, project.org_id, 'admin');
    if (teamId && !(await one('select 1 from teams where id = $1 and org_id = $2', [teamId, project.org_id]))) fail(400, 'Unknown team');
    await q('update projects set team_id = $1 where id = $2', [teamId || null, project.id]);
  }
  res.json({ ok: true });
});

/** Site-wide custom code, edited from the dashboard. Bumps the version like a designer save. */
projects.put('/:id/custom-code', async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id);
  const data = project.data as Project;
  data.settings = { ...(data.settings || {}), customCode: { head: String(req.body?.head ?? ''), body: String(req.body?.body ?? '') } };
  const row = await one('update projects set data = $1, version = version + 1, updated_at = now() where id = $2 returning version',
    [JSON.stringify(data), project.id]);
  res.json({ version: row!.version });
});

projects.post('/:id/duplicate', async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id);
  const id = newId();
  const name = `${project.name} copy`;
  await q(`insert into projects (id, org_id, team_id, name, slug, data, created_by) values ($1, $2, $3, $4, $5, $6, $7)`,
    [id, project.org_id, project.team_id, name, await uniqueProjectSlug(name), JSON.stringify(project.data), req.user!.id]);
  res.json({ id });
});

projects.delete('/:id', async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id, 'admin');
  forgetSite(project.slug);
  await q('delete from projects where id = $1', [project.id]);
  res.json({ ok: true });
});

/* ---- Deployments ---- */
projects.get('/:id/deployments', async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id);
  const rows = await q(
    `select d.id, d.file_count, d.size_bytes, d.note, d.created_at, u.name as created_by_name
     from deployments d left join users u on u.id = d.created_by where d.project_id = $1 order by d.created_at desc limit 50`, [project.id]);
  res.json({ liveId: project.live_deployment_id, deployments: rows, ...siteUrls(project.slug) });
});

/** Builds the site from its current data and makes that build live. */
export async function publishProject(projectId: string, userId: string, note = '') {
  const project = await one('select * from projects where id = $1', [projectId]);
  const files = exportFiles(project!.data as Project);
  const map = Object.fromEntries(files.map((f) => [f.name, f.content]));
  const size = files.reduce((n, f) => n + Buffer.byteLength(f.content), 0);
  const id = newId();
  await q('insert into deployments (id, project_id, files, file_count, size_bytes, note, created_by) values ($1, $2, $3, $4, $5, $6, $7)',
    [id, projectId, JSON.stringify(map), files.length, size, note.slice(0, 200), userId]);
  await q('update projects set live_deployment_id = $1 where id = $2', [id, projectId]);
  forgetSite(project!.slug);
  return { id, files: files.length, ...siteUrls(project!.slug) };
}

projects.post('/:id/deployments', async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id);
  res.json(await publishProject(project.id, req.user!.id, String(req.body?.note || '')));
});

/** Rolls back (or forward) to an earlier deployment. */
projects.post('/:id/deployments/:deploymentId/promote', async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id);
  if (!(await one('select 1 from deployments where id = $1 and project_id = $2', [req.params.deploymentId, project.id]))) fail(404, 'Deployment not found');
  await q('update projects set live_deployment_id = $1 where id = $2', [req.params.deploymentId, project.id]);
  forgetSite(project.slug);
  res.json({ ok: true });
});

projects.post('/:id/unpublish', async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id);
  await q('update projects set live_deployment_id = null where id = $1', [project.id]);
  forgetSite(project.slug);
  res.json({ ok: true });
});

/* ---- Custom domains ---- */
const HOST_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

projects.get('/:id/domains', async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id);
  const rows = await q('select id, hostname, verify_token, verified_at, created_at from domains where project_id = $1 order by created_at', [project.id]);
  res.json({
    domains: rows,
    cnameTarget: env.cnameTarget || (env.sitesDomain ? `${project.slug}.${env.sitesDomain}` : new URL(env.publicUrl).hostname),
  });
});

projects.post('/:id/domains', async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id);
  const hostname = String(req.body?.hostname || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!HOST_RE.test(hostname)) fail(400, 'Enter a domain like www.example.com');
  if (env.sitesDomain && hostname.endsWith('.' + env.sitesDomain)) fail(400, 'That address is already provided for you');
  if (await one('select 1 from domains where hostname = $1', [hostname])) fail(409, 'That domain is already connected to a site');
  const id = newId();
  await q('insert into domains (id, project_id, hostname, verify_token) values ($1, $2, $3, $4)',
    [id, project.id, hostname, crypto.randomBytes(12).toString('hex')]);
  res.json({ id });
});

/** Checks the TXT record `_blockyard.<domain>` = `blockyard-verify=<token>`. */
projects.post('/:id/domains/:domainId/verify', async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id);
  const d = await one('select * from domains where id = $1 and project_id = $2', [req.params.domainId, project.id]);
  if (!d) fail(404, 'Domain not found');
  let ok = env.skipDomainVerification;
  if (!ok) {
    try {
      const records = (await dns.resolveTxt(`_blockyard.${d!.hostname}`)).map((r) => r.join(''));
      ok = records.includes(`blockyard-verify=${d!.verify_token}`);
    } catch { ok = false; }
  }
  if (!ok) fail(400, `We couldn't find the TXT record yet. DNS changes can take a few minutes to an hour.`);
  await q('update domains set verified_at = now() where id = $1', [d!.id]);
  forgetSite(project.slug);
  res.json({ ok: true });
});

projects.delete('/:id/domains/:domainId', async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id);
  await q('delete from domains where id = $1 and project_id = $2', [req.params.domainId, project.id]);
  forgetSite(project.slug);
  res.json({ ok: true });
});
