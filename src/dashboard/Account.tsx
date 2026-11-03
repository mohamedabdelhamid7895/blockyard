/* Account: profile, password, and access tokens for connecting Claude to Blockyard over MCP. */
import { useState } from 'react';
import { Key, Sparkles, Trash2 } from 'lucide-react';
import { api, refreshMe, serverUrl, useSession } from '../api';
import { attempt, Card, PageHead, Shell, timeAgo, useLoad } from './Layout';

export function AccountPage() {
  const me = useSession((s) => s.me)!;
  const tokens = useLoad(() => api<{ id: string; name: string; created_at: string; last_used_at: string | null }[]>('/auth/tokens'), []);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [newToken, setNewToken] = useState('');
  const mcpUrl = serverUrl('/mcp');
  const desktopConfig = JSON.stringify({
    mcpServers: { blockyard: { command: 'npx', args: ['-y', 'mcp-remote', mcpUrl, '--header', `Authorization: Bearer ${newToken || 'byk_YOUR_TOKEN'}`] } },
  }, null, 2);
  const codeCmd = `claude mcp add --transport http blockyard ${mcpUrl} --header "Authorization: Bearer ${newToken || 'byk_YOUR_TOKEN'}"`;

  return (
    <Shell>
      <PageHead title="Account" sub={me.user.email} />
      <Card title="Profile">
        <div className="f-row wide"><label className="f-label">Name</label>
          <input className="f-input big" defaultValue={me.user.name} onBlur={(e) => e.target.value.trim() && e.target.value !== me.user.name && attempt(() => api('/auth/me', { method: 'PATCH', body: { name: e.target.value } })).then(refreshMe)} /></div>
      </Card>
      <Card title="Password">
        <form className="form-stack narrow" onSubmit={(e) => { e.preventDefault(); attempt(() => api('/auth/me', { method: 'PATCH', body: pw })).then((ok) => { if (ok) { setPw({ currentPassword: '', newPassword: '' }); alert('Password changed'); } }); }}>
          <input className="f-input big" type="password" autoComplete="current-password" placeholder="Current password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          <input className="f-input big" type="password" autoComplete="new-password" placeholder="New password (8+ characters)" minLength={8} required value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          <button className="btn primary big">Change password</button>
        </form>
      </Card>
      <Card id="claude" title={<><Sparkles size={15} /> Connect Claude</>}>
        <p className="muted">Let Claude work on your sites from Claude Desktop or Claude Code: list sites, read pages, add sections, replace text, add CMS items, set custom code and publish. Claude acts as you, with your access.</p>
        <div className="btn-row">
          <button className="btn primary" onClick={() => {
            const name = prompt('Name this token (for example "Claude Desktop on my laptop"):', 'Claude');
            if (name) attempt(async () => { const r = await api<{ token: string }>('/auth/tokens', { body: { name } }); setNewToken(r.token); tokens.reload(); });
          }}><Key size={13} /> Create access token</button>
        </div>
        {newToken && <div className="copy-box"><span>Copy this token now. It won't be shown again.</span><code>{newToken}</code>
          <button className="btn small" onClick={() => navigator.clipboard.writeText(newToken)}>Copy</button></div>}
        <h3 className="sub-h">Claude Code</h3>
        <pre className="code-block">{codeCmd}</pre>
        <h3 className="sub-h">Claude Desktop</h3>
        <p className="muted small">Add this to <code>claude_desktop_config.json</code> (Settings → Developer → Edit Config), then restart Claude Desktop.</p>
        <pre className="code-block">{desktopConfig}</pre>
        <p className="muted small">MCP endpoint: <code>{mcpUrl}</code> (Streamable HTTP, bearer token).</p>
        {tokens.data && tokens.data.length > 0 && <>
          <h3 className="sub-h">Your tokens</h3>
          {tokens.data.map((t) => (
            <div key={t.id} className="row-item">
              <Key size={14} /><div className="grow"><b>{t.name}</b><span className="muted small">Created {timeAgo(t.created_at)} · {t.last_used_at ? `last used ${timeAgo(t.last_used_at)}` : 'never used'}</span></div>
              <button className="icon-btn" title="Revoke" onClick={() => confirm(`Revoke “${t.name}”? Claude will lose access through it.`) && attempt(() => api(`/auth/tokens/${t.id}`, { method: 'DELETE' })).then(tokens.reload)}><Trash2 size={13} /></button>
            </div>
          ))}
        </>}
      </Card>
    </Shell>
  );
}
