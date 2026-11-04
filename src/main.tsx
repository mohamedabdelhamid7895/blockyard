import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Editor } from './App';
import { api, bootSession, useSession } from './api';
import { flushSave, openInEditor, useStore } from './store';
import { migrate } from './model';
import { AuthPage, InvitePage } from './dashboard/Auth';
import { MembersPage, TeamPage, TeamsPage, WorkspaceHome, WorkspaceSettings } from './dashboard/Workspace';
import { ProjectDashboard } from './dashboard/Project';
import { AccountPage } from './dashboard/Account';
import { AutomationEditor, AutomationsPage } from './dashboard/Automations';
import { Loading } from './dashboard/Layout';
import type { Project } from './types';
import './styles.css';

function RequireAuth({ children }: { children: ReactNode }) {
  const me = useSession((s) => s.me);
  const loc = useLocation();
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  return <>{children}</>;
}

function Home() {
  const me = useSession((s) => s.me);
  return <Navigate to={me ? `/w/${me.orgs[0].id}` : '/login'} replace />;
}

/** Loads a site from the server into the Designer, and saves any pending change when leaving. */
function EditorPage() {
  const { projectId } = useParams();
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    api<{ id: string; orgId: string; name: string; version: number; data: Project; pathUrl: string; subdomainUrl: string | null; published: boolean; hasAiKey: boolean }>(`/projects/${projectId}`)
      .then((p) => {
        if (cancelled) return;
        const data = migrate(p.data);
        if (!data) throw new Error('This site could not be opened');
        openInEditor(data, {
          kind: 'remote', projectId: p.id, orgId: p.orgId, version: p.version, name: p.name,
          pathUrl: p.pathUrl, subdomainUrl: p.subdomainUrl, published: p.published, hasAiKey: p.hasAiKey,
        });
        setReady(true);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; flushSave(); };
  }, [projectId]);
  useEffect(() => {
    // Only ask before leaving when a save is still pending.
    const warn = (e: BeforeUnloadEvent) => { if (useStore.getState().saveState === 'saving') { flushSave(); e.preventDefault(); } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  if (error) return <div className="dash-full"><Loading error={error} /></div>;
  return ready ? <Editor /> : <div className="dash-full"><Loading /></div>;
}

function Root() {
  const mode = useSession((s) => s.mode);
  useEffect(() => { bootSession(); }, []);
  if (mode === 'checking') return <div className="dash-full"><Loading /></div>;
  // Without a server (for example the GitHub Pages build), the Designer works on a site saved in this browser.
  if (mode === 'local') return <Editor />;
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/" element={<Home />} />
        <Route path="/w/:orgId" element={<RequireAuth><WorkspaceHome /></RequireAuth>} />
        <Route path="/w/:orgId/teams" element={<RequireAuth><TeamsPage /></RequireAuth>} />
        <Route path="/w/:orgId/teams/:teamId" element={<RequireAuth><TeamPage /></RequireAuth>} />
        <Route path="/w/:orgId/members" element={<RequireAuth><MembersPage /></RequireAuth>} />
        <Route path="/w/:orgId/automations" element={<RequireAuth><AutomationsPage /></RequireAuth>} />
        <Route path="/w/:orgId/automations/:workflowId" element={<RequireAuth><AutomationEditor /></RequireAuth>} />
        <Route path="/w/:orgId/settings" element={<RequireAuth><WorkspaceSettings /></RequireAuth>} />
        <Route path="/p/:projectId" element={<RequireAuth><ProjectDashboard /></RequireAuth>} />
        <Route path="/p/:projectId/edit" element={<RequireAuth><EditorPage /></RequireAuth>} />
        <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
