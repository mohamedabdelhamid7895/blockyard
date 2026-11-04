/* Site dashboard: publishing and rollbacks, custom domains, site custom code and settings. */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Clock, ExternalLink, Globe, Pencil, Rocket, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../api';
import { CodeField } from '../CodeEditor';
import type { Project } from '../types';
import { attempt, Card, isAdmin, Loading, PageHead, Shell, timeAgo, useLoad, useOrg } from './Layout';

interface ProjectFull {
  id: string; orgId: string; teamId: string | null; name: string; slug: string; version: number; published: boolean;
  liveDeploymentId: string | null; pathUrl: string; subdomainUrl: string | null; role: string; orgName: string; data: Project;
}
interface Deployments {
  liveId: string | null; pathUrl: string; subdomainUrl: string | null;
  deployments: { id: string; file_count: number; size_bytes: number; note: string; created_at: string; created_by_name: string | null }[];
}
interface Domains { cnameTarget: string; domains: { id: string; hostname: string; verify_token: string; verified_at: string | null; created_at: string }[] }

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
type Tab = 'publishing' | 'domains' | 'forms' | 'abtests' | 'code' | 'settings';

export function ProjectDashboard() {
  const { projectId } = useParams();
  const [tab, setTab] = useState<Tab>('publishing');
  const project = useLoad(() => api<ProjectFull>(`/projects/${projectId}`), [projectId]);
  const org = useOrg(project.data?.orgId);
  if (!project.data) return <Shell><Loading error={project.error} /></Shell>;
  const p = project.data;
  const live = p.subdomainUrl || p.pathUrl;
  return (
    <Shell>
      <PageHead title={p.name} sub={<><Link to={`/w/${p.orgId}`}>{p.orgName}</Link> · {p.published ? <a href={live} target="_blank" rel="noreferrer">{live.replace(/^https?:\/\//, '')}</a> : 'Not published yet'}</>}>
        {p.published && <a className="btn" href={live} target="_blank" rel="noreferrer"><ExternalLink size={13} /> View site</a>}
        <Link className="btn primary" to={`/p/${p.id}/edit`}><Pencil size={13} /> Open Designer</Link>
      </PageHead>
      <nav className="dash-tabs">
        {([['publishing', 'Publishing'], ['domains', 'Domains'], ['forms', 'Forms'], ['abtests', 'A/B tests'], ['code', 'Custom code'], ['settings', 'Settings']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      {tab === 'publishing' && <Publishing p={p} onChange={project.reload} />}
      {tab === 'domains' && <DomainsTab p={p} />}
      {tab === 'forms' && <FormsTab p={p} />}
      {tab === 'abtests' && <AbTestsTab p={p} onChange={project.reload} />}
      {tab === 'code' && <SiteCode p={p} onChange={project.reload} />}
      {tab === 'settings' && <SiteSettings p={p} teams={org.data?.teams || []} canAdmin={isAdmin(p.role)} onChange={project.reload} />}
    </Shell>
  );
}

function Publishing({ p, onChange }: { p: ProjectFull; onChange: () => void }) {
  const deps = useLoad(() => api<Deployments>(`/projects/${p.id}/deployments`), [p.id]);
  const [busy, setBusy] = useState(false);
  const publish = async () => {
    setBusy(true);
    await attempt(() => api(`/projects/${p.id}/deployments`, { body: { note: 'Published from the dashboard' } }));
    setBusy(false);
    deps.reload();
    onChange();
  };
  const d = deps.data;
  return (
    <>
      <Card title="Hosting" actions={<button className="btn primary" disabled={busy} onClick={publish}><Rocket size={13} /> {busy ? 'Publishing…' : 'Publish now'}</button>}>
        <div className="url-list">
          {p.subdomainUrl && <a href={p.subdomainUrl} target="_blank" rel="noreferrer"><Globe size={13} /> {p.subdomainUrl}</a>}
          <a href={p.pathUrl} target="_blank" rel="noreferrer"><Globe size={13} /> {p.pathUrl}</a>
        </div>
        <p className="muted small">Publishing builds the site from its latest saved design. Every build is kept, so you can roll back at any time.</p>
      </Card>
      <Card title="Deployments">
        {!d ? <Loading error={deps.error} /> : !d.deployments.length ? <p className="muted">Nothing published yet.</p> : d.deployments.map((x) => (
          <div key={x.id} className="row-item">
            {x.id === d.liveId ? <CheckCircle2 size={15} className="ok" /> : <Clock size={15} className="muted" />}
            <div className="grow"><b>{new Date(x.created_at).toLocaleString()}</b>
              <span className="muted small">{x.created_by_name || 'Someone'} · {x.file_count} files · {kb(x.size_bytes)}{x.note ? ` · ${x.note}` : ''}</span></div>
            {x.id === d.liveId ? <span className="role-tag live">Live</span>
              : <button className="btn small" onClick={() => attempt(() => api(`/projects/${p.id}/deployments/${x.id}/promote`, { method: 'POST' })).then(() => { deps.reload(); onChange(); })}><RotateCcw size={12} /> Make live</button>}
          </div>
        ))}
        {d?.liveId && <div className="btn-row"><button className="btn danger" onClick={() => confirm('Unpublish this site? Visitors will see a "not published" page.') && attempt(() => api(`/projects/${p.id}/unpublish`, { method: 'POST' })).then(() => { deps.reload(); onChange(); })}>Unpublish</button></div>}
      </Card>
    </>
  );
}

function DomainsTab({ p }: { p: ProjectFull }) {
  const domains = useLoad(() => api<Domains>(`/projects/${p.id}/domains`), [p.id]);
  const [host, setHost] = useState('');
  const d = domains.data;
  return (
    <Card title="Custom domains">
      <form className="invite-row" onSubmit={(e) => { e.preventDefault(); attempt(() => api(`/projects/${p.id}/domains`, { body: { hostname: host } })).then((ok) => { if (ok) { setHost(''); domains.reload(); } }); }}>
        <input className="f-input big" placeholder="www.example.com" value={host} onChange={(e) => setHost(e.target.value)} required />
        <button className="btn primary big">Add domain</button>
      </form>
      {!d ? <Loading error={domains.error} /> : d.domains.map((x) => (
        <div key={x.id} className="domain">
          <div className="row-item">
            <Globe size={15} />
            <div className="grow"><b>{x.hostname}</b><span className="muted small">{x.verified_at ? `Connected ${timeAgo(x.verified_at)}` : 'Waiting for DNS records'}</span></div>
            {x.verified_at ? <><span className="role-tag live">Connected</span><a className="btn small" href={`https://${x.hostname}`} target="_blank" rel="noreferrer"><ExternalLink size={12} /></a></>
              : <button className="btn small primary" onClick={() => attempt(() => api(`/projects/${p.id}/domains/${x.id}/verify`, { method: 'POST' })).then(domains.reload)}>Check DNS</button>}
            <button className="icon-btn" title="Remove" onClick={() => confirm(`Disconnect ${x.hostname}?`) && attempt(() => api(`/projects/${p.id}/domains/${x.id}`, { method: 'DELETE' })).then(domains.reload)}><Trash2 size={13} /></button>
          </div>
          {!x.verified_at && (
            <table className="dns">
              <thead><tr><th>Type</th><th>Name</th><th>Value</th></tr></thead>
              <tbody>
                <tr><td>CNAME</td><td>{x.hostname.split('.').length > 2 ? x.hostname.split('.')[0] : '@ (use ALIAS/ANAME at the root)'}</td><td><code>{d.cnameTarget}</code></td></tr>
                <tr><td>TXT</td><td>_blockyard{x.hostname.split('.').length > 2 ? '.' + x.hostname.split('.')[0] : ''}</td><td><code>blockyard-verify={x.verify_token}</code></td></tr>
              </tbody>
            </table>
          )}
        </div>
      ))}
      <p className="muted small">Add both records at your DNS provider, then press Check DNS. HTTPS for custom domains is handled by your host (Render, Fly.io and Cloudflare do this automatically).</p>
    </Card>
  );
}

function SiteCode({ p, onChange }: { p: ProjectFull; onChange: () => void }) {
  const code = p.data.settings?.customCode || { head: '', body: '' };
  const save = (patch: Partial<typeof code>) => attempt(() => api(`/projects/${p.id}/custom-code`, { method: 'PUT', body: { ...code, ...patch } })).then(onChange);
  return (
    <Card title="Site custom code">
      <p className="muted">Code here is added to every page of the site when it's published. Page-specific code is in each page's settings in the Designer.</p>
      <CodeField label="Head code" kind="head" value={code.head} onSave={(head) => save({ head })} />
      <CodeField label="Footer code (before </body>)" kind="body" value={code.body} onSave={(body) => save({ body })} />
      <p className="muted small">Publish the site to apply changes.</p>
    </Card>
  );
}

function SiteSettings({ p, teams, canAdmin, onChange }: { p: ProjectFull; teams: { id: string; name: string }[]; canAdmin: boolean; onChange: () => void }) {
  const nav = useNavigate();
  const patch = (body: object) => attempt(() => api(`/projects/${p.id}`, { method: 'PATCH', body })).then(onChange);
  return (
    <>
      <Card title="General">
        <div className="f-row wide"><label className="f-label">Name</label><input className="f-input big" defaultValue={p.name} onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && patch({ name: e.target.value })} /></div>
        <div className="f-row wide"><label className="f-label">Address</label><input className="f-input big" defaultValue={p.slug} onBlur={(e) => e.target.value.trim() && e.target.value !== p.slug && patch({ slug: e.target.value })} /></div>
        <p className="muted small">The address is used for the site's free URL: {p.pathUrl}</p>
        {canAdmin && (
          <div className="f-row wide"><label className="f-label">Team</label>
            <select className="f-input big" value={p.teamId || ''} onChange={(e) => patch({ teamId: e.target.value || null })}>
              <option value="">Everyone in the workspace</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>
        )}
      </Card>
      {canAdmin && (
        <Card title="Danger zone">
          <div className="row-item"><div className="grow"><b>Delete site</b><span className="muted small">Deletes the design, every deployment and its domains.</span></div>
            <button className="btn danger" onClick={() => confirm(`Delete “${p.name}”? This can't be undone.`) && attempt(() => api(`/projects/${p.id}`, { method: 'DELETE' })).then((ok) => ok && nav(`/w/${p.orgId}`))}><Trash2 size={12} /> Delete site</button></div>
        </Card>
      )}
    </>
  );
}

interface Submission { id: string; form: string; page: string; data: Record<string, string>; created_at: string }

function FormsTab({ p }: { p: ProjectFull }) {
  const subs = useLoad(() => api<{ submissions: Submission[]; forms: { form: string; n: number }[] }>(`/projects/${p.id}/submissions`), [p.id]);
  const [form, setForm] = useState('');
  const d = subs.data;
  const rows = (d?.submissions || []).filter((s) => !form || s.form === form);
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.data)))].slice(0, 6);
  const csv = async () => {
    const token = (await import('../api')).useSession.getState().token;
    const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/projects/${p.id}/submissions.csv`, { headers: { Authorization: `Bearer ${token}` } });
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a'); a.href = url; a.download = `${p.slug}-submissions.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <Card title="Form submissions" actions={<>
      {d && d.forms.length > 1 && <select className="f-input" value={form} onChange={(e) => setForm(e.target.value)}><option value="">All forms</option>{d.forms.map((f) => <option key={f.form} value={f.form}>{f.form} ({f.n})</option>)}</select>}
      <button className="btn small" disabled={!rows.length} onClick={csv}>Export CSV</button>
    </>}>
      <p className="muted small">Forms with an empty Action send their submissions here. Use <b>Automations</b> to email them, post them to Slack or add them to your CMS.</p>
      {!d ? <Loading error={subs.error} /> : !rows.length ? <p className="muted">No submissions yet.</p> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Received</th><th>Form</th>{keys.map((k) => <th key={k}>{k}</th>)}<th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td title={new Date(r.created_at).toLocaleString()}>{timeAgo(r.created_at)}</td><td>{r.form}</td>
                {keys.map((k) => <td key={k}>{r.data[k]}</td>)}
                <td><button className="icon-btn" title="Delete" onClick={() => confirm('Delete this submission?') && attempt(() => api(`/projects/${p.id}/submissions/${r.id}`, { method: 'DELETE' })).then(subs.reload)}><Trash2 size={12} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

interface Experiment {
  id: string; pageName: string; slug: string; status: string; split: number; goal: { type: string; page?: string; selector?: string };
  startedAt?: string; a: { views: number; conversions: number }; b: { views: number; conversions: number }; uplift: number | null; confidence: number;
}
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');
const goalText = (g: Experiment['goal']) => g.type === 'cta' ? 'Clicks on buttons and calls to action' : g.type === 'form' ? 'Form submissions' : g.type === 'page' ? `Visits to /${g.page}` : `Clicks on ${g.selector}`;

function AbTestsTab({ p, onChange }: { p: ProjectFull; onChange: () => void }) {
  const exps = useLoad(() => api<Experiment[]>(`/projects/${p.id}/experiments`), [p.id]);
  const finish = (e: Experiment, winner: 'a' | 'b') => {
    if (!confirm(winner === 'b' ? `Make variant B the ${e.pageName} page and end the test?` : `Keep the original ${e.pageName} page and end the test?`)) return;
    attempt(() => api(`/projects/${p.id}/experiments/${e.id}/finish`, { body: { winner } })).then(() => { exps.reload(); onChange(); });
  };
  return (
    <>
      <Card title="A/B tests">
        <p className="muted small">Create a test from a page's settings in the Designer (Page settings → A/B test): Blockyard duplicates the page as variant B (optionally rewritten by AI), splits visitors and counts conversions. Tests run on Blockyard hosting, with no flicker, and each visitor always sees the same version. Publish after starting or pausing a test.</p>
        {!exps.data ? <Loading error={exps.error} /> : !exps.data.length ? <p className="muted">No A/B tests yet.</p> : exps.data.map((e) => {
          const winner = e.confidence >= 0.95 && e.uplift != null ? (e.uplift > 0 ? 'b' : 'a') : null;
          return (
            <div key={e.id} className="ab-card">
              <div className="ab-head"><b>{e.pageName}</b><span className={'role-tag ' + (e.status === 'running' ? 'live' : '')}>{e.status}</span>
                <span className="muted small">{goalText(e.goal)} · {100 - e.split}/{e.split} split{e.startedAt ? ` · started ${timeAgo(e.startedAt)}` : ''}</span></div>
              <table className="data-table ab-table">
                <thead><tr><th>Version</th><th>Visitors</th><th>Conversions</th><th>Rate</th></tr></thead>
                <tbody>
                  <tr className={winner === 'a' ? 'win' : ''}><td>A · original</td><td>{e.a.views}</td><td>{e.a.conversions}</td><td>{pct(e.a.conversions, e.a.views)}</td></tr>
                  <tr className={winner === 'b' ? 'win' : ''}><td>B · variant</td><td>{e.b.views}</td><td>{e.b.conversions}</td><td>{pct(e.b.conversions, e.b.views)}</td></tr>
                </tbody>
              </table>
              <div className="ab-verdict">
                {e.uplift != null && <span className={e.uplift >= 0 ? 'up' : 'down'}>{e.uplift >= 0 ? '+' : ''}{(e.uplift * 100).toFixed(1)}% for B</span>}
                <span className="muted small">{(e.confidence * 100).toFixed(1)}% confidence{e.confidence < 0.95 ? ' · keep the test running until it reaches 95%' : ''}</span>
              </div>
              <div className="meter"><i style={{ width: `${Math.min(100, e.confidence * 100)}%` }} /></div>
              <div className="btn-row">
                <button className={'btn' + (winner === 'b' ? ' primary' : '')} onClick={() => finish(e, 'b')}>Use variant B</button>
                <button className={'btn' + (winner === 'a' ? ' primary' : '')} onClick={() => finish(e, 'a')}>Keep original</button>
                <Link className="btn" to={`/p/${p.id}/edit`}>Edit in Designer</Link>
              </div>
            </div>
          );
        })}
      </Card>
    </>
  );
}
