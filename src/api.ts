/* API client and session state. Without a reachable server the app runs in local mode (browser storage only). */
import { create } from 'zustand';

const BASE = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'blockyard.token';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface OrgSummary { id: string; name: string; personal: boolean; role: 'owner' | 'admin' | 'member' }
export interface Me { user: { id: string; name: string; email: string }; orgs: OrgSummary[] }

interface Session {
  mode: 'checking' | 'online' | 'local';
  token: string | null;
  me: Me | null;
}

const readToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };

export const useSession = create<Session>(() => ({ mode: 'checking', token: readToken(), me: null }));

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const { token } = useSession.getState();
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
      headers: { ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) setToken(null);
    throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function setToken(token: string | null) {
  try { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
  useSession.setState({ token, me: token ? useSession.getState().me : null });
}

export async function refreshMe() {
  const me = await api<Me>('/auth/me');
  useSession.setState({ me });
  return me;
}

/** Decides between server mode and local mode, and loads the signed-in user. */
export async function bootSession() {
  try {
    const res = await fetch(`${BASE}/api/health`);
    const body = await res.json();
    if (!res.ok || !body.ok) throw new Error('no server');
  } catch {
    useSession.setState({ mode: 'local' });
    return;
  }
  // Load the user before switching to server mode, so signed-in pages don't redirect to the login screen.
  if (useSession.getState().token) await refreshMe().catch(() => setToken(null));
  useSession.setState({ mode: 'online' });
}

export async function signOut() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  setToken(null);
}

/** Absolute URL of a server path (for links shown to users, like the MCP endpoint). */
export const serverUrl = (path: string) => (BASE || window.location.origin) + path;
