/* Automations: Zapier-style workflows, built into the workspace. */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDown, ArrowUp, Bot, CheckCircle2, Clock, Copy, Filter, Globe, Hash, Mail, MessageSquare, Plus, Play, Rocket, Send, Trash2, Type, Workflow, XCircle, Database,
} from 'lucide-react';
import { api } from '../api';
import { attempt, Card, Loading, PageHead, Shell, timeAgo, useLoad } from './Layout';
import type { ProjectSummary } from './Workspace';

type Trigger = { type: string; projectId?: string; form?: string; collection?: string; every?: number; unit?: string };
interface Step { id: string; type: string; name?: string; config: Record<string, string> }
interface Run { id: string; status: string; trigger_data: Record<string, unknown>; log: { step: string; name: string; type: string; status: string; ms: number; output?: unknown; error?: string }[]; started_at: string }
interface WorkflowFull { id: string; name: string; enabled: boolean; trigger: Trigger; steps: Step[]; hookUrl: string; runs: Run[] }

const TRIGGERS: Record<string, { label: string; icon: typeof Mail; hint: string }> = {
  form_submission: { label: 'Form submission', icon: Send, hint: 'When a visitor submits a form on a published site.' },
  cms_item_created: { label: 'New CMS item', icon: Database, hint: 'When an item is added to a collection.' },
  site_published: { label: 'Site published', icon: Rocket, hint: 'When a site is published.' },
  webhook: { label: 'Incoming webhook', icon: Globe, hint: 'When another app sends a request to this automation\'s URL.' },
  schedule: { label: 'Schedule', icon: Clock, hint: 'On a fixed interval.' },
  manual: { label: 'Run manually', icon: Play, hint: 'Only when you press Run.' },
};

type FieldSpec = [key: string, label: string, kind: 'text' | 'area' | 'site' | 'select', options?: [string, string][]];
const STEPS: Record<string, { label: string; icon: typeof Mail; fields: FieldSpec[]; output: string }> = {
  email: { label: 'Send email', icon: Mail, output: 'messageId', fields: [['to', 'To', 'text'], ['subject', 'Subject', 'text'], ['body', 'Message', 'area'], ['replyTo', 'Reply to', 'text']] },
  slack: { label: 'Slack message', icon: Hash, output: 'status', fields: [['webhookUrl', 'Slack webhook URL', 'text'], ['text', 'Message', 'area']] },
  discord: { label: 'Discord message', icon: MessageSquare, output: 'status', fields: [['webhookUrl', 'Discord webhook URL', 'text'], ['content', 'Message', 'area']] },
  http: { label: 'HTTP request', icon: Globe, output: 'status, body', fields: [['method', 'Method', 'select', [['POST', 'POST'], ['GET', 'GET'], ['PUT', 'PUT'], ['PATCH', 'PATCH'], ['DELETE', 'DELETE']]], ['url', 'URL', 'text'], ['headers', 'Headers (Name: value per line)', 'area'], ['body', 'Body', 'area']] },
  cms_add: { label: 'Add CMS item', icon: Database, output: 'itemId, name, slug…', fields: [['projectId', 'Site', 'site'], ['collection', 'Collection (name or slug)', 'text'], ['fields', 'Fields (slug: value per line)', 'area']] },
  publish: { label: 'Publish site', icon: Rocket, output: 'id, files', fields: [['projectId', 'Site', 'site']] },
  ai: { label: 'Ask AI', icon: Bot, output: 'text', fields: [['prompt', 'Instruction', 'area']] },
  filter: { label: 'Only continue if…', icon: Filter, output: 'passed', fields: [['left', 'Value', 'text'], ['op', 'Condition', 'select', [['contains', 'contains'], ['not_contains', 'does not contain'], ['equals', 'equals'], ['not_equals', 'does not equal'], ['not_empty', 'is not empty'], ['is_empty', 'is empty'], ['gt', 'is greater than'], ['lt', 'is less than']]], ['right', 'Compared with', 'text']] },
  format: { label: 'Format text', icon: Type, output: 'text', fields: [['template', 'Text', 'area']] },
  delay: { label: 'Wait', icon: Clock, output: 'waited', fields: [['seconds', 'Seconds (up to 300)', 'text']] },
};

const VARS: Record<string, string[]> = {
  form_submission: ['trigger.fields.email', 'trigger.fields.name', 'trigger.form', 'trigger.site', 'trigger.page', 'trigger.submittedAt'],
  cms_item_created: ['trigger.item.name', 'trigger.item.slug', 'trigger.collection', 'trigger.site'],
  site_published: ['trigger.site', 'trigger.url', 'trigger.publishedAt'],
  webhook: ['trigger.body.your_field', 'trigger.query.your_param', 'trigger.receivedAt'],
  schedule: ['trigger.scheduledAt'],
  manual: [],
};

const SAMPLES: Record<string, Record<string, unknown>> = {
  form_submission: { form: 'Contact', site: 'My site', page: '/', fields: { name: 'Ada Lovelace', email: 'ada@example.com', message: 'Hello!' }, submittedAt: new Date().toISOString() },
  cms_item_created: { site: 'My site', collection: 'Blog Posts', item: { name: 'Hello world', slug: 'hello-world' } },
  site_published: { site: 'My site', url: 'https://example.com/', publishedAt: new Date().toISOString() },
  webhook: { body: { your_field: 'value' }, query: {} },
  schedule: { scheduledAt: new Date().toISOString() },
  manual: {},
};

const TEMPLATES: { name: string; desc: string; trigger: Trigger; steps: Omit<Step, 'id'>[] }[] = [
  { name: 'Email me new form submissions', desc: 'Form submission → Send email', trigger: { type: 'form_submission' },
    steps: [{ type: 'email', config: { to: '', subject: 'New {{trigger.form}} submission on {{trigger.site}}', body: '{{trigger.fields}}', replyTo: '{{trigger.fields.email}}' } }] },
  { name: 'Post new leads to Slack', desc: 'Form submission → Filter → Slack', trigger: { type: 'form_submission' },
    steps: [{ type: 'filter', config: { left: '{{trigger.fields.email}}', op: 'contains', right: '@' } },
      { type: 'slack', config: { webhookUrl: '', text: ':tada: New lead from {{trigger.fields.name}} ({{trigger.fields.email}}) on {{trigger.site}}' } }] },
  { name: 'Save submissions to the CMS', desc: 'Form submission → Add CMS item', trigger: { type: 'form_submission' },
    steps: [{ type: 'cms_add', config: { projectId: '', collection: '', fields: 'name: {{trigger.fields.name}}' } }] },
  { name: 'Summarise messages with AI', desc: 'Form submission → Ask AI → Send email', trigger: { type: 'form_submission' },
    steps: [{ type: 'ai', config: { prompt: 'Summarise this message in one sentence and rate its urgency (low, medium, high):\n{{trigger.fields.message}}' } },
      { type: 'email', config: { to: '', subject: 'New message: {{trigger.fields.name}}', body: '{{steps.step_1.text}}\n\nFrom {{trigger.fields.email}}' } }] },
  { name: 'Announce publishes in Discord', desc: 'Site published → Discord', trigger: { type: 'site_published' },
    steps: [{ type: 'discord', config: { webhookUrl: '', content: '🚀 {{trigger.site}} was just published: {{trigger.url}}' } }] },
  { name: 'Create CMS items from another app', desc: 'Webhook → Add CMS item → Publish', trigger: { type: 'webhook' },
    steps: [{ type: 'cms_add', config: { projectId: '', collection: '', fields: 'name: {{trigger.body.title}}' } }, { type: 'publish', config: { projectId: '' } }] },
];

const withIds = (steps: Omit<Step, 'id'>[]) => steps.map((s, i) => ({ ...s, id: `step_${i + 1}` }));

export function AutomationsPage() {
  const { orgId } = useParams();
  const nav = useNavigate();
  const list = useLoad(() => api<{ id: string; name: string; enabled: boolean; trigger: Trigger; step_count: number; last_status: string | null; last_run: string | null; run_count: number }[]>(`/workflows/org/${orgId}`), [orgId]);
  const create = (t?: (typeof TEMPLATES)[number]) => attempt(async () => {
    const { id } = await api<{ id: string }>(`/workflows/org/${orgId}`, { body: { name: t?.name || 'Untitled automation', trigger: t?.trigger || { type: 'form_submission' }, steps: withIds(t?.steps || []) } });
    nav(`/w/${orgId}/automations/${id}`);
  });
  return (
    <Shell>
      <PageHead title="Automations" sub="Connect forms, the CMS and publishing to email, Slack, Discord, webhooks and AI. Like Zapier, built in.">
        <button className="btn primary" onClick={() => create()}><Plus size={13} /> New automation</button>
      </PageHead>
      {!list.data ? <Loading error={list.error} /> : list.data.length > 0 && (
        <Card title="Your automations">
          {list.data.map((w) => {
            const T = TRIGGERS[w.trigger.type] || TRIGGERS.manual;
            return (
              <Link key={w.id} to={`/w/${orgId}/automations/${w.id}`} className="row-item link-row">
                <T.icon size={15} />
                <div className="grow"><b>{w.name}</b><span className="muted small">{T.label} → {w.step_count} step{w.step_count === 1 ? '' : 's'} · {w.run_count} run{w.run_count === 1 ? '' : 's'}{w.last_run ? ` · last ${timeAgo(w.last_run)}` : ''}</span></div>
                {w.last_status && <span className={'role-tag ' + (w.last_status === 'success' ? 'live' : w.last_status === 'failed' ? 'err' : '')}>{w.last_status}</span>}
                <span className={'toggle-tag' + (w.enabled ? ' on' : '')}>{w.enabled ? 'On' : 'Off'}</span>
              </Link>
            );
          })}
        </Card>
      )}
      <Card title="Start from a template">
        <div className="tpl-pick three">
          {TEMPLATES.map((t) => (
            <button key={t.name} onClick={() => create(t)}><b>{t.name}</b><span className="muted small">{t.desc}</span></button>
          ))}
        </div>
      </Card>
    </Shell>
  );
}

function ConfigField({ spec, value, onChange, sites }: { spec: FieldSpec; value: string; onChange: (v: string) => void; sites: ProjectSummary[] }) {
  const [key, label, kind, options] = spec;
  return (
    <label className="wf-field">
      <span>{label}</span>
      {kind === 'area' ? <textarea className="f-input" rows={key === 'body' || key === 'prompt' ? 4 : 3} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
        : kind === 'site' ? <select className="f-input" value={value} onChange={(e) => onChange(e.target.value)}><option value="">Choose a site</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        : kind === 'select' ? <select className="f-input" value={value || options![0][0]} onChange={(e) => onChange(e.target.value)}>{options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        : <input className="f-input" value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />}
    </label>
  );
}

export function AutomationEditor() {
  const { orgId, workflowId } = useParams();
  const nav = useNavigate();
  const loaded = useLoad(() => api<WorkflowFull>(`/workflows/${workflowId}`), [workflowId]);
  const sites = useLoad(() => api<ProjectSummary[]>(`/projects/org/${orgId}`), [orgId]);
  const [wf, setWf] = useState<WorkflowFull | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sample, setSample] = useState('');
  const [testRun, setTestRun] = useState<Run | null>(null);
  useEffect(() => {
    if (loaded.data) { setWf(loaded.data); setDirty(false); setSample(JSON.stringify(SAMPLES[loaded.data.trigger.type] || {}, null, 2)); }
  }, [loaded.data]);
  if (!wf) return <Shell><Loading error={loaded.error} /></Shell>;

  const update = (patch: Partial<WorkflowFull>) => { setWf({ ...wf, ...patch }); setDirty(true); };
  const setTrigger = (patch: Partial<Trigger>) => {
    const trigger = { ...wf.trigger, ...patch };
    if (patch.type) setSample(JSON.stringify(SAMPLES[patch.type] || {}, null, 2));
    update({ trigger });
  };
  const setStep = (i: number, patch: Partial<Step>) => update({ steps: wf.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const addStep = (type: string) => {
    const n = Math.max(0, ...wf.steps.map((s) => Number(s.id.replace(/\D/g, '')) || 0)) + 1;
    update({ steps: [...wf.steps, { id: `step_${n}`, type, config: {} }] });
  };
  const move = (i: number, d: -1 | 1) => { const s = [...wf.steps]; [s[i], s[i + d]] = [s[i + d], s[i]]; update({ steps: s }); };
  const save = (extra: Partial<WorkflowFull> = {}) => attempt(async () => {
    const body = { ...wf, ...extra };
    await api(`/workflows/${wf.id}`, { method: 'PUT', body: { name: body.name, enabled: body.enabled, trigger: body.trigger, steps: body.steps } });
    setWf(body); setDirty(false); loaded.reload();
  });
  const runTest = () => attempt(async () => {
    if (dirty) await api(`/workflows/${wf.id}`, { method: 'PUT', body: { name: wf.name, enabled: wf.enabled, trigger: wf.trigger, steps: wf.steps } });
    let parsed: unknown = {};
    try { parsed = sample.trim() ? JSON.parse(sample) : {}; } catch { throw new Error('The sample data is not valid JSON'); }
    const r = await api<Omit<Run, 'trigger_data' | 'started_at'>>(`/workflows/${wf.id}/run`, { body: { sample: parsed } });
    setTestRun({ ...r, trigger_data: parsed as Record<string, unknown>, started_at: new Date().toISOString() });
    setDirty(false); loaded.reload();
  });

  const T = TRIGGERS[wf.trigger.type];
  const siteList = sites.data || [];
  const vars = [...(VARS[wf.trigger.type] || []), ...wf.steps.map((s) => `steps.${s.id}.${STEPS[s.type]?.output.split(',')[0] || 'output'}`)];
  return (
    <Shell>
      <PageHead title={<input className="title-input" value={wf.name} onChange={(e) => update({ name: e.target.value })} aria-label="Automation name" />}
        sub={<Link to={`/w/${orgId}/automations`}>← All automations</Link>}>
        <label className="switch"><input type="checkbox" checked={wf.enabled} onChange={(e) => save({ enabled: e.target.checked })} /> <span>{wf.enabled ? 'On' : 'Off'}</span></label>
        <button className="btn" onClick={runTest}><Play size={13} /> Test run</button>
        <button className="btn primary" disabled={!dirty} onClick={() => save()}>{dirty ? 'Save' : 'Saved'}</button>
      </PageHead>
      <div className="wf-layout">
        <div className="wf-flow">
          <div className="wf-card trigger">
            <div className="wf-card-head"><T.icon size={15} /> <b>When</b><span className="muted small">{T.hint}</span></div>
            <label className="wf-field"><span>Trigger</span>
              <select className="f-input" value={wf.trigger.type} onChange={(e) => setTrigger({ type: e.target.value })}>
                {Object.entries(TRIGGERS).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
              </select></label>
            {['form_submission', 'cms_item_created', 'site_published'].includes(wf.trigger.type) && (
              <label className="wf-field"><span>Site</span>
                <select className="f-input" value={wf.trigger.projectId || ''} onChange={(e) => setTrigger({ projectId: e.target.value || undefined })}>
                  <option value="">Any site in this workspace</option>{siteList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></label>
            )}
            {wf.trigger.type === 'form_submission' && <label className="wf-field"><span>Form name (optional)</span><input className="f-input" value={wf.trigger.form || ''} placeholder="Any form" onChange={(e) => setTrigger({ form: e.target.value || undefined })} /></label>}
            {wf.trigger.type === 'cms_item_created' && <label className="wf-field"><span>Collection (optional)</span><input className="f-input" value={wf.trigger.collection || ''} placeholder="Any collection" onChange={(e) => setTrigger({ collection: e.target.value || undefined })} /></label>}
            {wf.trigger.type === 'schedule' && (
              <div className="wf-inline"><span>Every</span>
                <input className="f-input" type="number" min={1} value={wf.trigger.every || 1} onChange={(e) => setTrigger({ every: Number(e.target.value) })} />
                <select className="f-input" value={wf.trigger.unit || 'hours'} onChange={(e) => setTrigger({ unit: e.target.value })}><option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option></select>
              </div>
            )}
            {wf.trigger.type === 'webhook' && (
              <div className="copy-box"><span>Send a POST (JSON or form data) to this URL. Keep it secret.</span><code>{wf.hookUrl}</code>
                <button className="btn small" onClick={() => navigator.clipboard.writeText(wf.hookUrl)}><Copy size={11} /> Copy</button></div>
            )}
          </div>

          {wf.steps.map((s, i) => {
            const def = STEPS[s.type];
            return (
              <div key={s.id} className="wf-card">
                <div className="wf-card-head">
                  <def.icon size={15} /> <b>{i + 1}. {def.label}</b><code className="muted">{s.id}</code>
                  <div className="spacer" />
                  <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Move up"><ArrowUp size={13} /></button>
                  <button className="icon-btn" disabled={i === wf.steps.length - 1} onClick={() => move(i, 1)} title="Move down"><ArrowDown size={13} /></button>
                  <button className="icon-btn" onClick={() => update({ steps: wf.steps.filter((_, j) => j !== i) })} title="Remove step"><Trash2 size={13} /></button>
                </div>
                {def.fields.map((f) => <ConfigField key={f[0]} spec={f} value={s.config[f[0]] || ''} sites={siteList} onChange={(v) => setStep(i, { config: { ...s.config, [f[0]]: v } })} />)}
                <span className="muted small">Output: <code>{`{{steps.${s.id}.${def.output.split(',')[0]}}}`}</code></span>
              </div>
            );
          })}
          <div className="wf-add">
            <span className="muted">Then…</span>
            {Object.entries(STEPS).map(([id, d]) => <button key={id} className="btn small" onClick={() => addStep(id)}><d.icon size={12} /> {d.label}</button>)}
          </div>
        </div>

        <div className="wf-side">
          <Card title="Variables">
            <p className="muted small">Use these in any field. Type them with double braces.</p>
            {vars.length ? vars.map((v) => <button key={v} className="var-chip" title="Copy" onClick={() => navigator.clipboard.writeText(`{{${v}}}`)}>{`{{${v}}}`}</button>) : <p className="muted small">This trigger has no data.</p>}
          </Card>
          <Card title="Test data">
            <textarea className="f-input code" rows={8} value={sample} onChange={(e) => setSample(e.target.value)} spellCheck={false} />
            <button className="btn" onClick={runTest}><Play size={12} /> Run with this data</button>
          </Card>
          {testRun && <RunLog run={testRun} title="Test run" />}
          <Card title="History">
            {!wf.runs.length && <p className="muted small">No runs yet.</p>}
            {wf.runs.map((r) => <RunLog key={r.id} run={r} compact />)}
          </Card>
          <button className="btn danger" onClick={() => confirm(`Delete “${wf.name}”?`) && attempt(() => api(`/workflows/${wf.id}`, { method: 'DELETE' })).then((ok) => ok && nav(`/w/${orgId}/automations`))}><Trash2 size={12} /> Delete automation</button>
        </div>
      </div>
    </Shell>
  );
}

function RunLog({ run, title, compact }: { run: Run; title?: string; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const Icon = run.status === 'success' ? CheckCircle2 : run.status === 'failed' ? XCircle : Workflow;
  const body = (
    <div className="run-log">
      {run.log.map((l, i) => (
        <div key={i} className={'run-step ' + l.status}>
          <b>{l.name}</b> <span className="muted small">{l.status} · {l.ms} ms</span>
          {(l.error || l.output !== undefined) && <pre>{l.error || JSON.stringify(l.output, null, 2).slice(0, 1200)}</pre>}
        </div>
      ))}
      {!run.log.length && <span className="muted small">No steps ran.</span>}
    </div>
  );
  if (title) return <Card title={<><Icon size={14} className={'run-' + run.status} /> {title}: {run.status}</>}>{body}</Card>;
  return (
    <div className="run-item">
      <button className="run-head" onClick={() => setOpen(!open)}><Icon size={13} className={'run-' + run.status} /> {run.status} <span className="muted small">{timeAgo(run.started_at)}</span></button>
      {open && body}
    </div>
  );
}
