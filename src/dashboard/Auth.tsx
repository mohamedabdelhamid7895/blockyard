/* Sign in, sign up and invite acceptance. */
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, refreshMe, setToken, useSession } from '../api';

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token } = await api<{ token: string }>(`/auth/${mode}`, { body: form });
      setToken(token);
      await refreshMe();
      nav(next, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand"><span className="logo-mark">B</span> Blockyard</div>
        <h1>{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
        <p className="muted">{mode === 'login' ? 'Welcome back. Pick up where you left off.' : 'Design, manage and publish websites with your team.'}</p>
        {mode === 'signup' && (
          <label>Name<input className="f-input big" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        )}
        <label>Email<input className="f-input big" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Password<input className="f-input big" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'signup' ? 8 : undefined}
          value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        {error && <div className="auth-error">{error}</div>}
        <button className="btn primary big" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <p className="muted small center">
          {mode === 'login' ? <>New here? <Link to={`/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link></>
            : <>Already have an account? <Link to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>Sign in</Link></>}
        </p>
      </form>
    </div>
  );
}

export function InvitePage() {
  const { token } = useParams();
  const me = useSession((s) => s.me);
  const nav = useNavigate();
  const [invite, setInvite] = useState<{ email: string; role: string; org_name: string; invited_by: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<typeof invite>(`/invites/${token}`).then(setInvite, (e) => setError(e.message));
  }, [token]);

  const accept = async () => {
    try {
      const { orgId } = await api<{ orgId: string }>(`/invites/${token}/accept`, { method: 'POST' });
      await refreshMe();
      nav(`/w/${orgId}`);
    } catch (e) { setError((e as Error).message); }
  };

  const here = `/invite/${token}`;
  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-brand"><span className="logo-mark">B</span> Blockyard</div>
        {error ? <><h1>Invite unavailable</h1><p className="auth-error">{error}</p><Link to="/">Go to your dashboard</Link></>
          : !invite ? <p className="muted">Loading invite…</p>
          : <>
            <h1>Join {invite.org_name}</h1>
            <p className="muted">{invite.invited_by || 'Someone'} invited <b>{invite.email}</b> to join as {invite.role === 'admin' ? 'an admin' : `a ${invite.role}`}.</p>
            {me ? <button className="btn primary big" onClick={accept}>Accept invite as {me.user.email}</button>
              : <div className="btn-row">
                <Link className="btn primary big" to={`/signup?next=${encodeURIComponent(here)}`}>Create an account</Link>
                <Link className="btn big" to={`/login?next=${encodeURIComponent(here)}`}>Sign in</Link>
              </div>}
          </>}
      </div>
    </div>
  );
}
