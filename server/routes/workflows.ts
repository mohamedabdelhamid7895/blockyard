/* Automations API, the incoming webhook endpoint, and workspace email (SMTP) settings. */
import express, { Router } from 'express';
import crypto from 'node:crypto';
import { one, q } from '../db';
import { env } from '../env';
import { fail, needOrgRole, rateLimit, requireAuth } from '../http';
import { encrypt, newId } from '../security';
import { nextRunAt, runWorkflow, STEP_TYPES, type Step, type Trigger, type Workflow } from '../workflows';

export const workflows = Router();
workflows.use(requireAuth);

const TRIGGERS = ['form_submission', 'cms_item_created', 'site_published', 'webhook', 'schedule', 'manual'];
const hookUrl = (wf: { id: string; hook_token: string }) => `${env.publicUrl}/hooks/${wf.id}/${wf.hook_token}`;

function validate(body: { trigger?: Trigger; steps?: Step[] }) {
  if (body.trigger && !TRIGGERS.includes(body.trigger.type)) fail(400, 'Unknown trigger');
  if (body.steps) {
    if (!Array.isArray(body.steps) || body.steps.length > 25) fail(400, 'A workflow can have up to 25 steps');
    for (const s of body.steps) if (!STEP_TYPES.includes(s.type)) fail(400, `Unknown step type ${s.type}`);
  }
}

async function loadWorkflow(userId: string, id: string) {
  const wf = await one('select * from workflows where id = $1', [id]);
  if (!wf) fail(404, 'Automation not found');
  await needOrgRole(userId, wf!.org_id);
  return wf as Workflow & { hook_token: string };
}

workflows.get('/org/:orgId', async (req, res) => {
  await needOrgRole(req.user!.id, req.params.orgId);
  const rows = await q(
    `select w.id, w.name, w.enabled, w.trigger, jsonb_array_length(w.steps) as step_count, w.updated_at,
       (select status from workflow_runs r where r.workflow_id = w.id order by started_at desc limit 1) as last_status,
       (select started_at from workflow_runs r where r.workflow_id = w.id order by started_at desc limit 1) as last_run,
       (select count(*)::int from workflow_runs r where r.workflow_id = w.id) as run_count
     from workflows w where w.org_id = $1 order by w.updated_at desc`, [req.params.orgId]);
  res.json(rows);
});

workflows.post('/org/:orgId', async (req, res) => {
  await needOrgRole(req.user!.id, req.params.orgId);
  validate(req.body || {});
  const id = newId();
  const trigger: Trigger = req.body?.trigger || { type: 'form_submission' };
  await q(`insert into workflows (id, org_id, name, trigger, steps, hook_token, created_by, next_run_at) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, req.params.orgId, String(req.body?.name || 'Untitled automation').slice(0, 100), JSON.stringify(trigger),
      JSON.stringify(req.body?.steps || []), crypto.randomBytes(16).toString('hex'), req.user!.id, nextRunAt(trigger)]);
  res.json({ id });
});

workflows.get('/:id', async (req, res) => {
  const wf = await loadWorkflow(req.user!.id, req.params.id);
  const runs = await q('select id, status, trigger_data, log, started_at, finished_at from workflow_runs where workflow_id = $1 order by started_at desc limit 30', [wf.id]);
  res.json({ ...wf, hook_token: undefined, hookUrl: hookUrl(wf), runs, stepTypes: STEP_TYPES });
});

workflows.put('/:id', async (req, res) => {
  const wf = await loadWorkflow(req.user!.id, req.params.id);
  validate(req.body || {});
  const trigger = req.body?.trigger ?? wf.trigger;
  await q(`update workflows set name = $1, enabled = $2, trigger = $3, steps = $4, next_run_at = $5, updated_at = now() where id = $6`,
    [String(req.body?.name ?? wf.name).slice(0, 100), req.body?.enabled ?? wf.enabled, JSON.stringify(trigger),
      JSON.stringify(req.body?.steps ?? wf.steps), nextRunAt(trigger), wf.id]);
  res.json({ ok: true });
});

workflows.delete('/:id', async (req, res) => {
  const wf = await loadWorkflow(req.user!.id, req.params.id);
  await q('delete from workflows where id = $1', [wf.id]);
  res.json({ ok: true });
});

/** Runs the workflow now with sample trigger data, whether or not it is enabled. */
workflows.post('/:id/run', async (req, res) => {
  const wf = await loadWorkflow(req.user!.id, req.params.id);
  rateLimit(`wfrun:${wf.id}`, 20, 60_000);
  res.json(await runWorkflow(wf, { ...(req.body?.sample || {}), test: true }));
});

/* ---- Incoming webhooks: POST /hooks/:id/:token ---- */
export const hooks = Router();
hooks.all('/:id/:token', express.json({ limit: '1mb' }), express.urlencoded({ extended: false }), async (req, res) => {
  rateLimit(`hook:${req.params.id}`, 60, 60_000);
  const wf = await one('select * from workflows where id = $1', [req.params.id]);
  const ok = wf && wf.hook_token.length === req.params.token.length && crypto.timingSafeEqual(Buffer.from(wf.hook_token), Buffer.from(req.params.token));
  if (!ok || wf.trigger.type !== 'webhook') { res.status(404).json({ error: 'Unknown webhook' }); return; }
  if (!wf.enabled) { res.status(409).json({ error: 'This automation is turned off' }); return; }
  runWorkflow(wf as unknown as Workflow, { body: req.body ?? {}, query: req.query, method: req.method, receivedAt: new Date().toISOString() }).catch((e) => console.error(e));
  res.json({ ok: true });
});

/* ---- Workspace email settings ---- */
export const smtp = Router();
smtp.use(requireAuth);
smtp.put('/:orgId/smtp', async (req, res) => {
  await needOrgRole(req.user!.id, req.params.orgId, 'admin');
  if (req.body === null || req.body?.remove) { await q('update orgs set smtp_enc = null where id = $1', [req.params.orgId]); res.json({ ok: true }); return; }
  const { host, port, user, pass, from, secure } = req.body || {};
  if (!host || !from) fail(400, 'Enter at least the SMTP host and a From address');
  await q('update orgs set smtp_enc = $1 where id = $2', [encrypt(JSON.stringify({ host, port, user, pass, from, secure })), req.params.orgId]);
  res.json({ ok: true });
});
