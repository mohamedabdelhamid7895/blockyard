/* Automations: Zapier-style workflows. A trigger (form submission, CMS item, publish, webhook, schedule)
 * runs a list of steps (HTTP, Slack, Discord, email, CMS, publish, AI, filter, formatter, delay). */
import nodemailer from 'nodemailer';
import { one, q } from './db';
import { decrypt, newId } from './security';
import { safeFetch } from './net';
import { askJSON } from './ai';
import { HttpError } from './http';
import { sanitizeSlug, uid } from '../src/model';
import type { Project } from '../src/types';

export type TriggerType = 'form_submission' | 'cms_item_created' | 'site_published' | 'webhook' | 'schedule' | 'manual';
export interface Trigger {
  type: TriggerType;
  projectId?: string;
  form?: string;
  collection?: string;
  every?: number;
  unit?: 'minutes' | 'hours' | 'days';
}
export interface Step { id: string; type: string; name?: string; config: Record<string, string> }
export interface Workflow { id: string; org_id: string; name: string; enabled: boolean; trigger: Trigger; steps: Step[]; created_by: string | null }
interface LogEntry { step: string; type: string; name: string; status: 'ok' | 'error' | 'stopped'; ms: number; output?: unknown; error?: string }

/* ---- Templates: {{trigger.fields.email}}, {{steps.step_1.text}}, {{now}} ---- */
function lookup(ctx: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), ctx);
}
export function render(template: string, ctx: Record<string, unknown>) {
  return String(template ?? '').replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, path) => {
    const v = lookup(ctx, path);
    return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
}

/* ---- Steps ---- */
type Ctx = { trigger: Record<string, unknown>; steps: Record<string, unknown>; now: string; orgId: string; userId: string | null };

async function postJSON(url: string, body: unknown) {
  const res = await safeFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  return { status: res.status, body: text.slice(0, 2000) };
}

async function loadProject(orgId: string, projectId: string) {
  const p = await one('select id, data, slug from projects where id = $1 and org_id = $2', [projectId, orgId]);
  if (!p) throw new Error('The site for this step no longer exists in this workspace');
  return p;
}

const STEPS: Record<string, (c: Record<string, string>, ctx: Ctx) => Promise<unknown>> = {
  async http(c) {
    const headers: Record<string, string> = {};
    for (const line of (c.headers || '').split('\n')) {
      const i = line.indexOf(':');
      if (i > 0) headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    const method = (c.method || 'POST').toUpperCase();
    if (c.body && !Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
    const res = await safeFetch(c.url, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : c.body });
    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    return { status: res.status, body: json ?? text.slice(0, 5000) };
  },
  slack: (c) => postJSON(c.webhookUrl, { text: c.text }),
  discord: (c) => postJSON(c.webhookUrl, { content: c.content?.slice(0, 2000) }),
  async email(c, ctx) {
    const org = await one('select smtp_enc from orgs where id = $1', [ctx.orgId]);
    if (!org?.smtp_enc) throw new Error('Email is not set up. Add SMTP settings in Workspace settings → Email.');
    const smtp = JSON.parse(decrypt(org.smtp_enc));
    const transport = nodemailer.createTransport({ host: smtp.host, port: Number(smtp.port) || 587, secure: smtp.secure === 'true' || Number(smtp.port) === 465,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined });
    const info = await transport.sendMail({ from: smtp.from || smtp.user, to: c.to, subject: c.subject, text: c.body, replyTo: c.replyTo || undefined });
    return { messageId: info.messageId, to: c.to };
  },
  async cms_add(c, ctx) {
    const p = await loadProject(ctx.orgId, c.projectId);
    const data = p.data as Project;
    const coll = data.collections.find((x) => x.slug === c.collection || x.id === c.collection || x.name === c.collection);
    if (!coll) throw new Error(`No collection “${c.collection}” on that site`);
    const fields: Record<string, string> = {};
    // Field mapping: one "slug: value" per line.
    for (const line of (c.fields || '').split('\n')) {
      const i = line.indexOf(':');
      const slug = i > 0 ? line.slice(0, i).trim() : '';
      if (slug && coll.fields.some((f) => f.slug === slug)) fields[slug] = line.slice(i + 1).trim();
    }
    const base = sanitizeSlug(fields.slug || fields.name || 'item') || 'item';
    let slug = base, i = 2;
    while (coll.items.some((it) => it.data.slug === slug)) slug = `${base}-${i++}`;
    const item = { id: uid(), data: { ...fields, name: fields.name || slug, slug } };
    coll.items.push(item);
    await q('update projects set data = $1, version = version + 1, updated_at = now() where id = $2', [JSON.stringify(data), p.id]);
    return { itemId: item.id, ...item.data };
  },
  async publish(c, ctx) {
    await loadProject(ctx.orgId, c.projectId);
    const { publishProject } = await import('./routes/projects');
    return publishProject(c.projectId, ctx.userId || '', 'Published by an automation');
  },
  async ai(c, ctx) {
    const out = await askJSON<{ text: string }>(ctx.orgId, {
      system: 'You are a step in an automation workflow. Follow the instruction using the data given and reply with the result only.',
      effort: 'low',
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
      prompt: c.prompt,
    });
    return { text: out.text };
  },
  async filter(c) {
    const a = c.left ?? '', b = c.right ?? '';
    const n = (x: string) => parseFloat(x);
    const pass = ({
      equals: a === b, not_equals: a !== b, contains: a.toLowerCase().includes(b.toLowerCase()),
      not_contains: !a.toLowerCase().includes(b.toLowerCase()), is_empty: !a.trim(), not_empty: !!a.trim(),
      gt: n(a) > n(b), lt: n(a) < n(b),
    } as Record<string, boolean>)[c.op || 'not_empty'];
    if (!pass) throw new StopRun(`Stopped: “${a}” ${(c.op || 'not_empty').replace('_', ' ')} “${b}” is false`);
    return { passed: true };
  },
  async format(c) { return { text: c.template }; },
  async delay(c) {
    const s = Math.min(Math.max(Number(c.seconds) || 0, 0), 300);
    await new Promise((r) => setTimeout(r, s * 1000));
    return { waited: s };
  },
};
export const STEP_TYPES = Object.keys(STEPS);
class StopRun extends Error {}

/* ---- Running ---- */
export async function runWorkflow(wf: Workflow, triggerData: Record<string, unknown>) {
  const runId = newId();
  await q(`insert into workflow_runs (id, workflow_id, status, trigger_data) values ($1, $2, 'running', $3)`, [runId, wf.id, JSON.stringify(triggerData)]);
  const ctx: Ctx = { trigger: triggerData, steps: {}, now: new Date().toISOString(), orgId: wf.org_id, userId: wf.created_by };
  const log: LogEntry[] = [];
  let status: 'success' | 'failed' | 'stopped' = 'success';
  for (const step of wf.steps) {
    const fn = STEPS[step.type];
    const started = Date.now();
    const name = step.name || step.type;
    if (!fn) { log.push({ step: step.id, type: step.type, name, status: 'error', ms: 0, error: 'Unknown step type' }); status = 'failed'; break; }
    try {
      const config = Object.fromEntries(Object.entries(step.config || {}).map(([k, v]) => [k, render(v, ctx as unknown as Record<string, unknown>)]));
      const output = await fn(config, ctx);
      ctx.steps[step.id] = output;
      log.push({ step: step.id, type: step.type, name, status: 'ok', ms: Date.now() - started, output });
    } catch (e) {
      const stopped = e instanceof StopRun;
      log.push({ step: step.id, type: step.type, name, status: stopped ? 'stopped' : 'error', ms: Date.now() - started, error: (e as Error).message });
      status = stopped ? 'stopped' : 'failed';
      break;
    }
  }
  await q('update workflow_runs set status = $1, log = $2, finished_at = now() where id = $3', [status, JSON.stringify(log), runId]);
  return { id: runId, status, log };
}

const matches = (t: Trigger, type: TriggerType, payload: Record<string, unknown>) =>
  t.type === type
  && (!t.projectId || t.projectId === payload.projectId)
  && (!t.form || String(t.form).toLowerCase() === String(payload.form || '').toLowerCase())
  && (!t.collection || [payload.collection, payload.collectionSlug].includes(t.collection));

/** Runs every enabled workflow in the workspace that listens for this event. Never throws. */
export function fireEvent(orgId: string, type: TriggerType, payload: Record<string, unknown>) {
  (async () => {
    const rows = await q('select * from workflows where org_id = $1 and enabled', [orgId]);
    for (const wf of rows as Workflow[]) if (matches(wf.trigger, type, payload)) await runWorkflow(wf, payload);
  })().catch((e) => console.error('Automation error', e));
}

const intervalMs = (t: Trigger) => Math.max(1, Number(t.every) || 1) * ({ minutes: 60_000, hours: 3_600_000, days: 86_400_000 }[t.unit || 'hours']);
export const nextRunAt = (t: Trigger) => (t.type === 'schedule' ? new Date(Date.now() + intervalMs(t)).toISOString() : null);

/** Polls for scheduled workflows. Claiming a run with an UPDATE keeps several server instances from running it twice. */
export function startScheduler() {
  const tick = async () => {
    const due = await q(`select * from workflows where enabled and trigger->>'type' = 'schedule' and next_run_at <= now() limit 20`);
    for (const wf of due as Workflow[]) {
      const claimed = await one('update workflows set next_run_at = $1 where id = $2 and next_run_at <= now() returning id', [nextRunAt(wf.trigger), wf.id]);
      if (claimed) runWorkflow(wf, { scheduledAt: new Date().toISOString() }).catch((e) => console.error('Scheduled automation error', e));
    }
  };
  setInterval(() => tick().catch((e) => console.error('Scheduler error', e)), 30_000);
}

export { HttpError };
