/* Workspaces (orgs): members, invites, teams and the Claude API key. */
import { Router } from 'express';
import crypto from 'node:crypto';
import { one, q } from '../db';
import { env } from '../env';
import { fail, needOrgRole, requireAuth, type OrgRole } from '../http';
import { newId } from '../security';
import { aiStatus, PROVIDERS, saveProvider } from '../ai';

export const orgs = Router();
orgs.use(requireAuth);

const ROLES: OrgRole[] = ['owner', 'admin', 'member'];

orgs.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80);
  if (!name) fail(400, 'Give the workspace a name');
  const id = newId();
  await q('insert into orgs (id, name) values ($1, $2)', [id, name]);
  await q(`insert into org_members (org_id, user_id, role) values ($1, $2, 'owner')`, [id, req.user!.id]);
  res.json({ id });
});

orgs.get('/:orgId', async (req, res) => {
  const { orgId } = req.params;
  const role = await needOrgRole(req.user!.id, orgId);
  const org = await one('select id, name, personal, created_at, smtp_enc is not null as has_smtp from orgs where id = $1', [orgId]);
  const members = await q(
    `select u.id, u.name, u.email, m.role, m.created_at from org_members m join users u on u.id = m.user_id
     where m.org_id = $1 order by m.created_at`, [orgId]);
  const teams = await q(
    `select t.id, t.name, t.created_at,
       coalesce((select json_agg(tm.user_id) from team_members tm where tm.team_id = t.id), '[]'::json) as member_ids,
       (select count(*)::int from projects p where p.team_id = t.id) as project_count
     from teams t where t.org_id = $1 order by t.created_at`, [orgId]);
  const invites = role === 'member' ? [] : await q('select id, email, role, token, created_at from invites where org_id = $1 order by created_at desc', [orgId]);
  const stats = await one(
    `select (select count(*)::int from projects where org_id = $1) as projects,
            (select count(*)::int from projects where org_id = $1 and live_deployment_id is not null) as published,
            (select count(*)::int from domains d join projects p on p.id = d.project_id where p.org_id = $1) as domains`, [orgId]);
  res.json({ org: { ...org, has_ai_key: undefined }, role, members, teams, invites, stats, ai: await aiStatus(orgId), providers: PROVIDERS, publicUrl: env.publicUrl });
});

orgs.patch('/:orgId', async (req, res) => {
  await needOrgRole(req.user!.id, req.params.orgId, 'admin');
  const name = String(req.body?.name || '').trim().slice(0, 80);
  if (name) await q('update orgs set name = $1 where id = $2', [name, req.params.orgId]);
  res.json({ ok: true });
});

orgs.delete('/:orgId', async (req, res) => {
  await needOrgRole(req.user!.id, req.params.orgId, 'owner');
  const org = await one('select personal from orgs where id = $1', [req.params.orgId]);
  if (org?.personal) fail(400, "Your personal workspace can't be deleted");
  await q('delete from orgs where id = $1', [req.params.orgId]);
  res.json({ ok: true });
});

/* ---- Claude ---- */
/** Adds or updates an AI provider: { provider, apiKey?, model?, baseUrl?, makeActive? }. apiKey null removes the key. */
orgs.put('/:orgId/ai', async (req, res) => {
  await needOrgRole(req.user!.id, req.params.orgId, 'admin');
  const { provider = 'anthropic', apiKey, model, baseUrl, makeActive } = req.body || {};
  await saveProvider(req.params.orgId, provider, { apiKey, model, baseUrl, makeActive });
  res.json(await aiStatus(req.params.orgId));
});

/* ---- Members ---- */
orgs.patch('/:orgId/members/:userId', async (req, res) => {
  const myRole = await needOrgRole(req.user!.id, req.params.orgId, 'admin');
  const role = req.body?.role as OrgRole;
  if (!ROLES.includes(role)) fail(400, 'Unknown role');
  if (role === 'owner' && myRole !== 'owner') fail(403, 'Only owners can make someone an owner');
  const target = await one('select role from org_members where org_id = $1 and user_id = $2', [req.params.orgId, req.params.userId]);
  if (!target) fail(404, 'Member not found');
  if (target!.role === 'owner' && myRole !== 'owner') fail(403, 'Only owners can change an owner');
  if (target!.role === 'owner' && role !== 'owner') {
    const owners = await one(`select count(*)::int as n from org_members where org_id = $1 and role = 'owner'`, [req.params.orgId]);
    if (owners!.n < 2) fail(400, 'A workspace needs at least one owner');
  }
  await q('update org_members set role = $1 where org_id = $2 and user_id = $3', [role, req.params.orgId, req.params.userId]);
  res.json({ ok: true });
});

/** Removes a member, or lets a member leave. */
orgs.delete('/:orgId/members/:userId', async (req, res) => {
  const self = req.params.userId === req.user!.id;
  const myRole = await needOrgRole(req.user!.id, req.params.orgId, self ? 'member' : 'admin');
  const target = await one('select role from org_members where org_id = $1 and user_id = $2', [req.params.orgId, req.params.userId]);
  if (!target) fail(404, 'Member not found');
  if (target!.role === 'owner') {
    if (!self && myRole !== 'owner') fail(403, 'Only owners can remove an owner');
    const owners = await one(`select count(*)::int as n from org_members where org_id = $1 and role = 'owner'`, [req.params.orgId]);
    if (owners!.n < 2) fail(400, 'A workspace needs at least one owner. Make someone else an owner first.');
  }
  await q('delete from org_members where org_id = $1 and user_id = $2', [req.params.orgId, req.params.userId]);
  await q('delete from team_members where user_id = $1 and team_id in (select id from teams where org_id = $2)', [req.params.userId, req.params.orgId]);
  res.json({ ok: true });
});

/* ---- Invites ---- */
orgs.post('/:orgId/invites', async (req, res) => {
  const myRole = await needOrgRole(req.user!.id, req.params.orgId, 'admin');
  const email = String(req.body?.email || '').trim().toLowerCase();
  const role = (req.body?.role || 'member') as OrgRole;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'Enter a valid email');
  if (!ROLES.includes(role) || (role === 'owner' && myRole !== 'owner')) fail(400, 'You cannot invite with that role');
  const existing = await one(`select 1 from org_members m join users u on u.id = m.user_id where m.org_id = $1 and u.email = $2`, [req.params.orgId, email]);
  if (existing) fail(409, 'That person is already a member');
  const token = crypto.randomBytes(18).toString('base64url');
  await q('delete from invites where org_id = $1 and email = $2', [req.params.orgId, email]);
  await q('insert into invites (id, org_id, email, role, token, invited_by) values ($1, $2, $3, $4, $5, $6)',
    [newId(), req.params.orgId, email, role, token, req.user!.id]);
  res.json({ token });
});

orgs.delete('/:orgId/invites/:id', async (req, res) => {
  await needOrgRole(req.user!.id, req.params.orgId, 'admin');
  await q('delete from invites where id = $1 and org_id = $2', [req.params.id, req.params.orgId]);
  res.json({ ok: true });
});

/* ---- Teams ---- */
orgs.post('/:orgId/teams', async (req, res) => {
  await needOrgRole(req.user!.id, req.params.orgId, 'admin');
  const name = String(req.body?.name || '').trim().slice(0, 80);
  if (!name) fail(400, 'Give the team a name');
  const id = newId();
  await q('insert into teams (id, org_id, name) values ($1, $2, $3)', [id, req.params.orgId, name]);
  res.json({ id });
});

async function teamInOrg(teamId: string, orgId: string) {
  const t = await one('select * from teams where id = $1 and org_id = $2', [teamId, orgId]);
  if (!t) fail(404, 'Team not found');
  return t!;
}

orgs.patch('/:orgId/teams/:teamId', async (req, res) => {
  await needOrgRole(req.user!.id, req.params.orgId, 'admin');
  await teamInOrg(req.params.teamId, req.params.orgId);
  const name = String(req.body?.name || '').trim().slice(0, 80);
  if (name) await q('update teams set name = $1 where id = $2', [name, req.params.teamId]);
  res.json({ ok: true });
});

orgs.delete('/:orgId/teams/:teamId', async (req, res) => {
  await needOrgRole(req.user!.id, req.params.orgId, 'admin');
  await teamInOrg(req.params.teamId, req.params.orgId);
  await q('delete from teams where id = $1', [req.params.teamId]);
  res.json({ ok: true });
});

orgs.put('/:orgId/teams/:teamId/members/:userId', async (req, res) => {
  await needOrgRole(req.user!.id, req.params.orgId, 'admin');
  await teamInOrg(req.params.teamId, req.params.orgId);
  if (!(await one('select 1 from org_members where org_id = $1 and user_id = $2', [req.params.orgId, req.params.userId]))) fail(404, 'Member not found');
  await q('insert into team_members (team_id, user_id) values ($1, $2) on conflict do nothing', [req.params.teamId, req.params.userId]);
  res.json({ ok: true });
});

orgs.delete('/:orgId/teams/:teamId/members/:userId', async (req, res) => {
  await needOrgRole(req.user!.id, req.params.orgId, 'admin');
  await q('delete from team_members where team_id = $1 and user_id = $2', [req.params.teamId, req.params.userId]);
  res.json({ ok: true });
});

/* ---- Public invite lookup and acceptance ---- */
export const invites = Router();

invites.get('/:token', async (req, res) => {
  const inv = await one(
    `select i.email, i.role, o.name as org_name, u.name as invited_by from invites i join orgs o on o.id = i.org_id
     left join users u on u.id = i.invited_by where i.token = $1`, [req.params.token]);
  if (!inv) fail(404, 'This invite link is invalid or was already used');
  res.json(inv);
});

invites.post('/:token/accept', requireAuth, async (req, res) => {
  const inv = await one('select * from invites where token = $1', [req.params.token]);
  if (!inv) fail(404, 'This invite link is invalid or was already used');
  await q('insert into org_members (org_id, user_id, role) values ($1, $2, $3) on conflict do nothing', [inv!.org_id, req.user!.id, inv!.role]);
  await q('delete from invites where id = $1', [inv!.id]);
  res.json({ orgId: inv!.org_id });
});
