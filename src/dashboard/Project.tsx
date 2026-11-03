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
type Tab = 'publishing' | 'domains' | 'code' | 'settings';

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
        {([['publishing', 'Publishing'], ['domains', 'Domains'], ['code', 'Custom code'], ['settings', 'Settings']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      {tab === 'publishing' && <Publishing p={p} onChange={project.reload} />}
      {tab === 'domains' && <DomainsTab p={p} />}
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
