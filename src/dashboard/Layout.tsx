/* Dashboard shell: sidebar with the workspace switcher, plus small shared pieces. */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronDown, LayoutGrid, LogOut, Plus, Settings, Sparkles, User, Users, UsersRound } from 'lucide-react';
import { api, refreshMe, signOut, useSession } from '../api';
import { Menu } from '../ui';

/** Loads data and exposes a reload function. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fn, deps);
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return load().then((data) => setState({ data, error: null, loading: false }), (e: Error) => setState({ data: null, error: e.message, loading: false }));
  }, [load]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

export interface OrgDetails {
  org: { id: string; name: string; personal: boolean; ai_model: string; has_ai_key: boolean };
  role: 'owner' | 'admin' | 'member';
  members: { id: string; name: string; email: string; role: 'owner' | 'admin' | 'member'; created_at: string }[];
  teams: { id: string; name: string; member_ids: string[]; project_count: number }[];
  invites: { id: string; email: string; role: string; token: string; created_at: string }[];
  stats: { projects: number; published: number; domains: number };
  aiModels: { id: string; label: string }[];
}

export const useOrg = (orgId: string | undefined) =>
  useLoad(() => (orgId ? api<OrgDetails>(`/orgs/${orgId}`) : Promise.reject(new Error('No workspace'))), [orgId]);

export const isAdmin = (role?: string) => role === 'owner' || role === 'admin';

/** Runs an action, showing its error in an alert. Returns whether it succeeded. */
export async function attempt(fn: () => Promise<unknown>) {
  try { await fn(); return true; } catch (e) { alert((e as Error).message); return false; }
}

export function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

export function Shell({ children }: { children: ReactNode }) {
  const me = useSession((s) => s.me);
  const { orgId } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const org = me?.orgs.find((o) => o.id === orgId) || me?.orgs[0];

  const newWorkspace = async () => {
    const name = prompt('Workspace name (for a company or client):');
    if (!name) return;
    await attempt(async () => {
      const { id } = await api<{ id: string }>('/orgs', { body: { name } });
      await refreshMe();
      nav(`/w/${id}`);
    });
  };

  return (
    <div className="dash">
      <aside className="dash-side">
        <div className="dash-brand"><span className="logo-mark">B</span> Blockyard</div>
        <Menu className="ws-menu" trigger={(open) => (
          <button className={'ws-btn' + (open ? ' on' : '')}>
            <span className="ws-avatar">{initials(org?.name || '?')}</span>
            <span className="ws-name">{org?.name}<small>{org?.personal ? 'Personal' : org?.role}</small></span>
            <ChevronDown size={13} />
          </button>
        )}>
          {(close) => (<>
            {me?.orgs.map((o) => (
              <button key={o.id} onClick={() => { close(); nav(`/w/${o.id}`); }}>
                <span className="ws-avatar sm">{initials(o.name)}</span> {o.name} {o.id === org?.id && <Check size={12} />}
              </button>
            ))}
            <hr />
            <button onClick={() => { close(); newWorkspace(); }}><Plus size={12} /> New workspace</button>
          </>)}
        </Menu>
        {org && (
          <nav className="dash-nav">
            <NavLink end to={`/w/${org.id}`}><LayoutGrid size={15} /> Sites</NavLink>
            <NavLink to={`/w/${org.id}/teams`}><UsersRound size={15} /> Teams</NavLink>
            <NavLink to={`/w/${org.id}/members`}><Users size={15} /> Members</NavLink>
            <NavLink to={`/w/${org.id}/settings`} className={({ isActive }) => (isActive && loc.hash !== '#claude' ? 'active' : '')}><Settings size={15} /> Workspace settings</NavLink>
            <NavLink to={`/w/${org.id}/settings#claude`} className={({ isActive }) => 'claude-link' + (isActive && loc.hash === '#claude' ? ' active' : '')}><Sparkles size={15} /> Claude &amp; AI</NavLink>
          </nav>
        )}
        <div className="spacer" />
        <nav className="dash-nav">
          <NavLink to="/account"><User size={15} /> {me?.user.name}</NavLink>
          <button onClick={async () => { await signOut(); nav('/login'); }}><LogOut size={15} /> Sign out</button>
        </nav>
      </aside>
      <main className="dash-main">{children}</main>
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="dash-head">
      <div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
      <div className="dash-head-actions">{children}</div>
    </header>
  );
}

export function Loading({ error }: { error?: string | null }) {
  return <div className="dash-loading">{error ? <span className="err">{error}</span> : 'Loading…'}</div>;
}

export function Card({ title, children, actions, id }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <section className="card" id={id}>
      {(title || actions) && <div className="card-head"><h2>{title}</h2><div className="spacer" />{actions}</div>}
      <div className="card-body">{children}</div>
    </section>
  );
}
