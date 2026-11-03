/* Workspace dashboards: sites, teams, members and settings. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Copy, ExternalLink, Globe, LayoutGrid, Mail, MoreHorizontal, Pencil, Plus, Sparkles, Trash2, UsersRound } from 'lucide-react';
import { api, refreshMe, useSession } from '../api';
import { Menu } from '../ui';
import { attempt, Card, initials, isAdmin, Loading, PageHead, Shell, timeAgo, useLoad, useOrg, type OrgDetails } from './Layout';

export interface ProjectSummary {
  id: string; orgId: string; teamId: string | null; name: string; slug: string; published: boolean;
  updatedAt: string; createdAt: string; pageCount: number; pathUrl: string; subdomainUrl: string | null;
}

const liveUrl = (p: { pathUrl: string; subdomainUrl: string | null }) => p.subdomainUrl || p.pathUrl;
const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

function NewSiteButton({ orgId, teams, teamId }: { orgId: string; teams: OrgDetails['teams']; teamId?: string }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', template: 'starter', teamId: teamId || '' });
  const create = () => attempt(async () => {
    const { id } = await api<{ id: string }>(`/projects/org/${orgId}`, { body: { ...form, teamId: form.teamId || null } });
    nav(`/p/${id}/edit`);
  });
  return (
    <>
      <button className="btn primary" onClick={() => setOpen(true)}><Plus size={13} /> New site</button>
      {open && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <form className="modal" onSubmit={(e) => { e.preventDefault(); create(); }}>
            <div className="modal-head"><h3>New site</h3></div>
            <div className="modal-body form-stack">
              <label>Site name<input className="f-input big" autoFocus required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme marketing site" /></label>
              <div className="tpl-pick">
                {[['starter', 'Starter site', 'Home, About, Blog and a CMS collection'], ['blank', 'Blank site', 'One empty page']].map(([id, name, desc]) => (
                  <button type="button" key={id} className={form.template === id ? 'on' : ''} onClick={() => setForm({ ...form, template: id })}>
                    <b>{name}</b><span className="muted small">{desc}</span>
                  </button>
                ))}
              </div>
              {teams.length > 0 && (
                <label>Team<select className="f-input big" value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
                  <option value="">Everyone in the workspace</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select></label>
              )}
              <div className="btn-row end"><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary">Create site</button></div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function SiteGrid({ sites, org, onChange }: { sites: ProjectSummary[]; org: OrgDetails; onChange: () => void }) {
  const nav = useNavigate();
  if (!sites.length) return <div className="empty-big"><LayoutGrid size={28} /><p>No sites yet. Create one to start designing.</p></div>;
  const teamName = (id: string | null) => org.teams.find((t) => t.id === id)?.name;
  return (
    <div className="site-grid">
      {sites.map((s) => (
        <div key={s.id} className="site-card">
          <Link to={`/p/${s.id}/edit`} className="site-thumb" style={{ background: `linear-gradient(135deg, hsl(${hue(s.name)} 70% 55%), hsl(${(hue(s.name) + 50) % 360} 70% 40%))` }}>
            <span>{initials(s.name)}</span>
            <em>Open Designer</em>
          </Link>
          <div className="site-info">
            <div className="site-title">
              <Link to={`/p/${s.id}`}>{s.name}</Link>
              <Menu align="right" trigger={() => <button className="icon-btn"><MoreHorizontal size={15} /></button>}>
                {(close) => (<>
                  <button onClick={() => { close(); nav(`/p/${s.id}/edit`); }}><Pencil size={12} /> Open Designer</button>
                  <button onClick={() => { close(); nav(`/p/${s.id}`); }}><Globe size={12} /> Publishing &amp; domains</button>
                  <button onClick={() => { close(); attempt(() => api(`/projects/${s.id}/duplicate`, { method: 'POST' })).then(onChange); }}><Copy size={12} /> Duplicate</button>
                  {isAdmin(org.role) && <button onClick={() => { close(); if (confirm(`Delete “${s.name}” and all its deployments? This can't be undone.`)) attempt(() => api(`/projects/${s.id}`, { method: 'DELETE' })).then(onChange); }}><Trash2 size={12} /> Delete</button>}
                </>)}
              </Menu>
            </div>
            <div className="site-meta">
              {s.published ? <a href={liveUrl(s)} target="_blank" rel="noreferrer" className="live-dot">Live <ExternalLink size={10} /></a> : <span className="draft-dot">Draft</span>}
              <span>{s.pageCount} page{s.pageCount === 1 ? '' : 's'}</span>
              {teamName(s.teamId) && <span><UsersRound size={10} /> {teamName(s.teamId)}</span>}
              <span>Edited {timeAgo(s.updatedAt)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const useSites = (orgId?: string) => useLoad(() => api<ProjectSummary[]>(`/projects/org/${orgId}`), [orgId]);

export function WorkspaceHome() {
  const { orgId } = useParams();
  const org = useOrg(orgId);
  const sites = useSites(orgId);
  const [filter, setFilter] = useState('');
  const [team, setTeam] = useState('all');
  const shown = useMemo(() => (sites.data || []).filter((s) =>
    s.name.toLowerCase().includes(filter.toLowerCase()) && (team === 'all' || (team === 'none' ? !s.teamId : s.teamId === team))), [sites.data, filter, team]);
  if (!org.data) return <Shell><Loading error={org.error} /></Shell>;
  const d = org.data;
  return (
    <Shell>
      <PageHead title={d.org.name} sub={d.org.personal ? 'Your personal workspace' : `${d.members.length} member${d.members.length === 1 ? '' : 's'} · ${d.teams.length} team${d.teams.length === 1 ? '' : 's'}`}>
        <NewSiteButton orgId={d.org.id} teams={d.teams} />
      </PageHead>
      <div className="stats">
        <div className="stat"><b>{d.stats.projects}</b><span>Sites</span></div>
        <div className="stat"><b>{d.stats.published}</b><span>Published</span></div>
        <div className="stat"><b>{d.stats.domains}</b><span>Custom domains</span></div>
        <div className="stat"><b>{d.members.length}</b><span>Members</span></div>
        <Link to={`/w/${d.org.id}/settings#claude`} className={'stat ai' + (d.org.has_ai_key ? ' on' : '')}>
          <b><Sparkles size={18} /></b><span>{d.org.has_ai_key ? 'Claude connected' : 'Connect Claude'}</span>
        </Link>
      </div>
      <div className="toolbar">
        <input className="f-input big search" placeholder="Search sites" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {d.teams.length > 0 && (
          <select className="f-input big" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="all">All teams</option>
            <option value="none">No team</option>
            {d.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>
      {sites.data ? <SiteGrid sites={shown} org={d} onChange={sites.reload} /> : <Loading error={sites.error} />}
    </Shell>
  );
}

/* ---- Teams ---- */
export function TeamsPage() {
  const { orgId } = useParams();
  const org = useOrg(orgId);
  if (!org.data) return <Shell><Loading error={org.error} /></Shell>;
  const d = org.data;
  const admin = isAdmin(d.role);
  const add = () => {
    const name = prompt('Team name (for example Marketing, Design, Client: Acme):');
    if (name) attempt(() => api(`/orgs/${d.org.id}/teams`, { body: { name } })).then(org.reload);
  };
  return (
    <Shell>
      <PageHead title="Teams" sub="Group people and sites. Members only see sites in their teams and sites with no team; owners and admins see everything.">
        {admin && <button className="btn primary" onClick={add}><Plus size={13} /> New team</button>}
      </PageHead>
      {!d.teams.length ? <div className="empty-big"><UsersRound size={28} /><p>No teams yet.{admin ? ' Create one to organise sites and people.' : ''}</p></div> : (
        <div className="team-grid">
          {d.teams.map((t) => (
            <Link key={t.id} to={`/w/${d.org.id}/teams/${t.id}`} className="team-card">
              <span className="ws-avatar">{initials(t.name)}</span>
              <div><b>{t.name}</b><span className="muted small">{t.member_ids.length} member{t.member_ids.length === 1 ? '' : 's'} · {t.project_count} site{t.project_count === 1 ? '' : 's'}</span></div>
              <div className="avatars">{t.member_ids.slice(0, 5).map((id) => <span key={id} className="ws-avatar sm">{initials(d.members.find((m) => m.id === id)?.name || '?')}</span>)}</div>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}

export function TeamPage() {
  const { orgId, teamId } = useParams();
  const org = useOrg(orgId);
  const sites = useSites(orgId);
  const nav = useNavigate();
  if (!org.data) return <Shell><Loading error={org.error} /></Shell>;
  const d = org.data;
  const team = d.teams.find((t) => t.id === teamId);
  if (!team) return <Shell><Loading error="Team not found" /></Shell>;
  const admin = isAdmin(d.role);
  const teamSites = (sites.data || []).filter((s) => s.teamId === team.id);
  const others = (sites.data || []).filter((s) => s.teamId !== team.id);
  const outsiders = d.members.filter((m) => !team.member_ids.includes(m.id));
  const base = `/orgs/${d.org.id}/teams/${team.id}`;
  return (
    <Shell>
      <PageHead title={team.name} sub={<Link to={`/w/${d.org.id}/teams`}>← All teams</Link>}>
        {admin && <>
          <button className="btn" onClick={() => { const name = prompt('Team name:', team.name); if (name) attempt(() => api(base, { method: 'PATCH', body: { name } })).then(org.reload); }}><Pencil size={12} /> Rename</button>
          <button className="btn danger" onClick={() => { if (confirm(`Delete the ${team.name} team? Its sites stay in the workspace.`)) attempt(() => api(base, { method: 'DELETE' })).then(() => nav(`/w/${d.org.id}/teams`)); }}><Trash2 size={12} /> Delete</button>
        </>}
      </PageHead>
      <div className="two-col">
        <Card title={`Members (${team.member_ids.length})`} actions={admin && outsiders.length > 0 && (
          <select className="f-input" value="" onChange={(e) => e.target.value && attempt(() => api(`${base}/members/${e.target.value}`, { method: 'PUT' })).then(org.reload)}>
            <option value="">+ Add member</option>
            {outsiders.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}>
          {!team.member_ids.length && <p className="muted">No members yet.</p>}
          {team.member_ids.map((id) => {
            const m = d.members.find((x) => x.id === id);
            if (!m) return null;
            return (
              <div key={id} className="row-item">
                <span className="ws-avatar sm">{initials(m.name)}</span><div className="grow"><b>{m.name}</b><span className="muted small">{m.email}</span></div>
                {admin && <button className="icon-btn" title="Remove from team" onClick={() => attempt(() => api(`${base}/members/${id}`, { method: 'DELETE' })).then(org.reload)}><Trash2 size={13} /></button>}
              </div>
            );
          })}
        </Card>
        <Card title={`Sites (${teamSites.length})`} actions={admin && others.length > 0 && (
          <select className="f-input" value="" onChange={(e) => e.target.value && attempt(() => api(`/projects/${e.target.value}`, { method: 'PATCH', body: { teamId: team.id } })).then(() => { sites.reload(); org.reload(); })}>
            <option value="">+ Move a site here</option>
            {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}>
          {!teamSites.length && <p className="muted">No sites in this team.</p>}
          {teamSites.map((s) => (
            <div key={s.id} className="row-item">
              <LayoutGrid size={15} /><div className="grow"><Link to={`/p/${s.id}`}><b>{s.name}</b></Link><span className="muted small">{s.published ? 'Live' : 'Draft'} · edited {timeAgo(s.updatedAt)}</span></div>
              <Link className="btn small" to={`/p/${s.id}/edit`}>Designer</Link>
              {admin && <button className="icon-btn" title="Remove from team" onClick={() => attempt(() => api(`/projects/${s.id}`, { method: 'PATCH', body: { teamId: null } })).then(() => { sites.reload(); org.reload(); })}><Trash2 size={13} /></button>}
            </div>
          ))}
        </Card>
      </div>
    </Shell>
  );
}

/* ---- Members ---- */
export function MembersPage() {
  const { orgId } = useParams();
  const org = useOrg(orgId);
  const me = useSession((s) => s.me);
  const nav = useNavigate();
  const [invite, setInvite] = useState({ email: '', role: 'member' });
  const [lastLink, setLastLink] = useState('');
  if (!org.data) return <Shell><Loading error={org.error} /></Shell>;
  const d = org.data;
  const admin = isAdmin(d.role);
  const base = `/orgs/${d.org.id}`;
  const inviteLink = (token: string) => `${window.location.origin}${window.location.pathname}#/invite/${token}`;
  const send = () => attempt(async () => {
    const { token } = await api<{ token: string }>(`${base}/invites`, { body: invite });
    setLastLink(inviteLink(token));
    setInvite({ email: '', role: 'member' });
    org.reload();
  });
  return (
    <Shell>
      <PageHead title="Members" sub={`People in ${d.org.name}. Owners manage billing-level settings, admins manage people, teams and Claude, members design and publish.`} />
      {admin && (
        <Card title="Invite people">
          <form className="invite-row" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input className="f-input big" type="email" required placeholder="name@company.com" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            <select className="f-input big" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
              <option value="member">Member</option><option value="admin">Admin</option>{d.role === 'owner' && <option value="owner">Owner</option>}
            </select>
            <button className="btn primary big"><Mail size={13} /> Create invite</button>
          </form>
          {lastLink && <div className="copy-box"><span>Send this link to them. They join when they sign in or sign up with that email.</span><code>{lastLink}</code>
            <button className="btn small" onClick={() => navigator.clipboard.writeText(lastLink)}>Copy link</button></div>}
          {d.invites.length > 0 && <>
            <h3 className="sub-h">Pending invites</h3>
            {d.invites.map((i) => (
              <div key={i.id} className="row-item">
                <Mail size={15} /><div className="grow"><b>{i.email}</b><span className="muted small">{i.role} · sent {timeAgo(i.created_at)}</span></div>
                <button className="btn small" onClick={() => navigator.clipboard.writeText(inviteLink(i.token))}>Copy link</button>
                <button className="icon-btn" title="Revoke" onClick={() => attempt(() => api(`${base}/invites/${i.id}`, { method: 'DELETE' })).then(org.reload)}><Trash2 size={13} /></button>
              </div>
            ))}
          </>}
        </Card>
      )}
      <Card title={`Members (${d.members.length})`}>
        {d.members.map((m) => {
          const self = m.id === me?.user.id;
          return (
            <div key={m.id} className="row-item">
              <span className="ws-avatar sm">{initials(m.name)}</span>
              <div className="grow"><b>{m.name}{self && ' (you)'}</b><span className="muted small">{m.email} · joined {timeAgo(m.created_at)}</span></div>
              {admin && !self ? (
                <select className="f-input" value={m.role} onChange={(e) => attempt(() => api(`${base}/members/${m.id}`, { method: 'PATCH', body: { role: e.target.value } })).then(org.reload)}>
                  <option value="member">Member</option><option value="admin">Admin</option><option value="owner">Owner</option>
                </select>
              ) : <span className={'role-tag ' + m.role}>{m.role}</span>}
              {(admin || self) && !d.org.personal && (
                <button className="icon-btn" title={self ? 'Leave workspace' : 'Remove'} onClick={() => {
                  if (!confirm(self ? `Leave ${d.org.name}?` : `Remove ${m.name} from ${d.org.name}?`)) return;
                  attempt(() => api(`${base}/members/${m.id}`, { method: 'DELETE' })).then(async (ok) => {
                    if (ok && self) { await refreshMe(); nav('/'); } else org.reload();
                  });
                }}><Trash2 size={13} /></button>
              )}
            </div>
          );
        })}
      </Card>
    </Shell>
  );
}

/* ---- Settings ---- */
export function WorkspaceSettings() {
  const { orgId } = useParams();
  const org = useOrg(orgId);
  const nav = useNavigate();
  const loc = useLocation();
  const [key, setKey] = useState('');
  useEffect(() => {
    if (org.data && loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [org.data, loc.hash]);
  if (!org.data) return <Shell><Loading error={org.error} /></Shell>;
  const d = org.data;
  const admin = isAdmin(d.role);
  const base = `/orgs/${d.org.id}`;
  return (
    <Shell>
      <PageHead title="Workspace settings" sub={d.org.name} />
      <Card title="General">
        <div className="f-row wide"><label className="f-label">Name</label>
          <input className="f-input big" defaultValue={d.org.name} disabled={!admin}
            onBlur={(e) => e.target.value.trim() && e.target.value !== d.org.name && attempt(() => api(base, { method: 'PATCH', body: { name: e.target.value } })).then(() => { org.reload(); refreshMe(); })} /></div>
      </Card>
      <Card id="claude" title={<><Sparkles size={15} /> Claude &amp; AI</>}>
        <p className="muted">Connect Claude to generate sections from a description, rewrite copy, fill CMS collections and write custom code in the Designer. Your workspace uses its own Anthropic API key, so usage is billed to your Anthropic account. The key is encrypted on the server and never sent to the browser.</p>
        <div className={'ai-status' + (d.org.has_ai_key ? ' on' : '')}>{d.org.has_ai_key ? 'Claude is connected' : 'Claude is not connected'}</div>
        {admin ? <>
          <div className="f-row wide"><label className="f-label">API key</label>
            <input className="f-input big" type="password" autoComplete="off" placeholder={d.org.has_ai_key ? '•••••••• (saved, paste a new key to replace it)' : 'sk-ant-…'} value={key} onChange={(e) => setKey(e.target.value)} />
            <button className="btn primary big" disabled={!key.trim()} onClick={() => attempt(() => api(`${base}/ai`, { method: 'PUT', body: { apiKey: key } })).then((ok) => { if (ok) { setKey(''); org.reload(); } })}>Save key</button>
          </div>
          <div className="f-row wide"><label className="f-label">Model</label>
            <select className="f-input big" value={d.org.ai_model} onChange={(e) => attempt(() => api(`${base}/ai`, { method: 'PUT', body: { model: e.target.value } })).then(org.reload)}>
              {d.aiModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="btn-row">
            <a className="btn" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer"><ExternalLink size={12} /> Get an API key</a>
            {d.org.has_ai_key && <button className="btn danger" onClick={() => confirm('Disconnect Claude from this workspace?') && attempt(() => api(`${base}/ai`, { method: 'PUT', body: { apiKey: null } })).then(org.reload)}>Disconnect</button>}
          </div>
        </> : <p className="muted">Ask a workspace admin to connect Claude.</p>}
        <p className="muted small">Want Claude Desktop or Claude Code to edit your sites directly? Create an access token in <Link to="/account#claude">Account → Connect Claude</Link>.</p>
      </Card>
      {d.role === 'owner' && !d.org.personal && (
        <Card title="Danger zone">
          <div className="row-item"><div className="grow"><b>Delete workspace</b><span className="muted small">Deletes every site, deployment, domain and team in it.</span></div>
            <button className="btn danger" onClick={() => {
              if (prompt(`Type the workspace name (${d.org.name}) to delete it:`) !== d.org.name) return;
              attempt(() => api(base, { method: 'DELETE' })).then(async (ok) => { if (ok) { await refreshMe(); nav('/'); } });
            }}>Delete workspace</button></div>
        </Card>
      )}
    </Shell>
  );
}
