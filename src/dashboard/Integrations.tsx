/* Workspace integrations: AI models (bring your own) and email for automations. */
import { useState } from 'react';
import { CheckCircle2, ExternalLink, Mail, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../api';
import { attempt, Card, isAdmin, type OrgDetails } from './Layout';

export function AiModelsCard({ d, onChange }: { d: OrgDetails; onChange: () => void }) {
  const admin = isAdmin(d.role);
  const [pick, setPick] = useState(d.ai.active || 'anthropic');
  const def = d.providers.find((p) => p.id === pick)!;
  const cur = d.ai.providers[pick] || { hasKey: false, model: '', baseUrl: '' };
  const [form, setForm] = useState({ apiKey: '', model: cur.model, baseUrl: cur.baseUrl });
  const base = `/orgs/${d.org.id}/ai`;
  const choose = (id: string) => {
    setPick(id);
    const c = d.ai.providers[id] || { model: '', baseUrl: '' };
    setForm({ apiKey: '', model: c.model, baseUrl: c.baseUrl });
  };
  const save = (makeActive: boolean) => attempt(() => api(base, {
    method: 'PUT', body: { provider: pick, apiKey: form.apiKey || undefined, model: form.model, baseUrl: def.id === 'custom' || def.id === 'ollama' ? form.baseUrl : undefined, makeActive },
  })).then((ok) => { if (ok) { setForm({ ...form, apiKey: '' }); onChange(); } });

  return (
    <Card id="claude" title={<><Sparkles size={15} /> AI models</>}>
      <p className="muted">Power the AI panel, text rewriting, CMS generation, code writing, A/B variant copy and AI automation steps.
        Claude is recommended; you can also bring your own model from another provider. Keys are encrypted on the server and never sent to the browser, and usage is billed to your own account with that provider.</p>
      <div className={'ai-status' + (d.ai.enabled ? ' on' : '')}>
        {d.ai.enabled ? <>Using {d.providers.find((p) => p.id === d.ai.active)?.label.replace(/ \(.*\)$/, '')}{d.ai.providers[d.ai.active!]?.model ? ` · ${d.ai.providers[d.ai.active!].model}` : ''}</> : 'No AI model connected'}
      </div>
      <div className="provider-grid">
        {d.providers.map((p) => {
          const c = d.ai.providers[p.id];
          const ready = c && (c.hasKey || !p.keyRequired);
          return (
            <button key={p.id} className={(pick === p.id ? 'on ' : '') + (d.ai.active === p.id ? 'active' : '')} onClick={() => choose(p.id)}>
              <b>{p.label.replace(/ \(.*\)$/, '')}</b>
              <span className="muted small">{d.ai.active === p.id ? 'In use' : ready ? 'Connected' : p.id === 'anthropic' ? 'Recommended' : 'Not connected'}</span>
            </button>
          );
        })}
      </div>
      {admin ? (
        <div className="provider-form">
          <h3 className="sub-h">{def.label}</h3>
          {def.id !== 'ollama' && (
            <div className="f-row wide"><label className="f-label">API key</label>
              <input className="f-input big" type="password" autoComplete="off" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder={cur.hasKey ? '•••••••• saved (paste a new key to replace it)' : def.keyHint || 'API key'} /></div>
          )}
          {(def.id === 'custom' || def.id === 'ollama') && (
            <div className="f-row wide"><label className="f-label">Base URL</label>
              <input className="f-input big" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder={def.baseUrl || 'https://your-endpoint/v1'} /></div>
          )}
          <div className="f-row wide"><label className="f-label">Model</label>
            {def.models.length ? (
              <select className="f-input big" value={form.model || def.models[0]} onChange={(e) => setForm({ ...form, model: e.target.value })}>
                {def.models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : <input className="f-input big" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="The model id from your provider's docs" />}
          </div>
          <div className="btn-row">
            <button className="btn primary" onClick={() => save(true)}><CheckCircle2 size={13} /> Save and use this model</button>
            <button className="btn" onClick={() => save(false)}>Save only</button>
            {def.docs && <a className="btn" href={def.docs} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Get a key</a>}
            {d.ai.providers[pick] && <button className="btn danger" onClick={() => confirm(`Disconnect ${def.label}?`) && attempt(() => api(base, { method: 'PUT', body: { provider: pick, apiKey: null } })).then(onChange)}><Trash2 size={12} /> Disconnect</button>}
          </div>
          {def.id !== 'anthropic' && <p className="muted small">Other providers are reached through their OpenAI-compatible API. Results depend on the model: for generating sections, pick a large, recent model.</p>}
        </div>
      ) : <p className="muted">Ask a workspace admin to connect an AI model.</p>}
    </Card>
  );
}

export function EmailCard({ d, onChange }: { d: OrgDetails; onChange: () => void }) {
  const [form, setForm] = useState({ host: '', port: '587', user: '', pass: '', from: '', secure: 'false' });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  if (!isAdmin(d.role)) return null;
  return (
    <Card id="email" title={<><Mail size={15} /> Email for automations</>}>
      <p className="muted">Automations send email through your own mail server or provider (Gmail, Outlook, Postmark, SendGrid, Resend, Amazon SES and others all offer SMTP).</p>
      <div className={'ai-status' + (d.org.has_smtp ? ' on' : '')}>{d.org.has_smtp ? 'Email is set up' : 'Email is not set up'}</div>
      <form className="smtp-grid" onSubmit={(e) => { e.preventDefault(); attempt(() => api(`/orgs/${d.org.id}/smtp`, { method: 'PUT', body: form })).then((ok) => ok && onChange()); }}>
        <input className="f-input big" placeholder="SMTP host (smtp.example.com)" value={form.host} onChange={set('host')} required />
        <input className="f-input big" placeholder="Port" value={form.port} onChange={set('port')} />
        <input className="f-input big" placeholder="Username" value={form.user} onChange={set('user')} autoComplete="off" />
        <input className="f-input big" type="password" placeholder="Password or app password" value={form.pass} onChange={set('pass')} autoComplete="new-password" />
        <input className="f-input big" placeholder="From address (Site <hello@example.com>)" value={form.from} onChange={set('from')} required />
        <select className="f-input big" value={form.secure} onChange={set('secure')}><option value="false">STARTTLS (port 587)</option><option value="true">TLS (port 465)</option></select>
        <div className="btn-row">
          <button className="btn primary">{d.org.has_smtp ? 'Replace settings' : 'Save'}</button>
          {d.org.has_smtp && <button type="button" className="btn danger" onClick={() => attempt(() => api(`/orgs/${d.org.id}/smtp`, { method: 'PUT', body: { remove: true } })).then(onChange)}>Remove</button>}
        </div>
      </form>
    </Card>
  );
}
