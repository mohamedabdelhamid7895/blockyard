/* Claude panel: generate sections from a description, or import pasted HTML and CSS. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardPaste, Sparkles } from 'lucide-react';
import { api } from '../api';
import { insertMarkup } from '../actions';
import { getState, toast, useTarget } from '../store';

const EXAMPLES = [
  'A hero for a coffee roastery with a headline, short intro, two buttons and a product photo',
  'A pricing section with three plans, the middle one highlighted',
  'A team section with four people, photos, names and roles',
  'A testimonial slider-style section with three customer quotes',
  'A newsletter signup band with an email field',
];

export function AiPanel() {
  const target = useTarget();
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ prompt: string; summary: string }[]>([]);
  const [paste, setPaste] = useState({ open: false, html: '', css: '' });

  const generate = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      const { project } = getState();
      const existingClasses = [...new Set(Object.keys(project.classes).map((k) => k.split('.')[0]))];
      const out = await api<{ html: string; css: string; summary: string }>(`/ai/${target.projectId}/section`, {
        body: { prompt, existingClasses, siteName: target.name },
      });
      const n = insertMarkup(out.html, out.css);
      if (!n) throw new Error('Claude returned a section with no elements. Try again.');
      setLog([{ prompt, summary: out.summary }, ...log]);
      setPrompt('');
      toast('Section added. Undo with Ctrl+Z if it is not right.');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ready = target.kind === 'remote' && target.hasAiKey;
  return (
    <div className="lp">
      <div className="lp-head"><h3><Sparkles size={13} /> Claude</h3></div>
      <div className="ai-panel">
        {target.kind === 'local' ? (
          <p className="muted">AI features need the Blockyard server. Run it with <code>npm run dev</code>, sign in, and connect Claude in your workspace settings.</p>
        ) : !target.hasAiKey ? (
          <p className="muted">Claude isn't connected for this workspace yet. <Link to={`/w/${target.orgId}/settings#claude`}>Add an Anthropic API key</Link> to generate sections, rewrite text and fill your CMS.</p>
        ) : null}
        <label className="ai-label">Generate a section</label>
        <textarea className="f-input" rows={5} disabled={!ready || busy} placeholder="Describe the section: content, layout, style…"
          value={prompt} onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate(); }} />
        <button className="btn primary" disabled={!ready || busy || !prompt.trim()} onClick={generate}>
          <Sparkles size={12} /> {busy ? 'Claude is designing…' : 'Generate section'}
        </button>
        {ready && !log.length && (
          <div className="ai-examples">
            {EXAMPLES.map((x) => <button key={x} onClick={() => setPrompt(x)}>{x}</button>)}
          </div>
        )}
        {log.map((l, i) => <div key={i} className="ai-log"><b>{l.summary}</b><span className="muted small">{l.prompt}</span></div>)}
        <p className="muted small">Sections are added after the selected section. Their styles become normal classes you can edit, and every breakpoint is included.
          Select text and use Settings → <b>Rewrite with Claude</b> to edit copy.</p>

        <hr />
        <button className="btn" onClick={() => setPaste({ ...paste, open: !paste.open })}><ClipboardPaste size={12} /> Import HTML &amp; CSS</button>
        {paste.open && <>
          <textarea className="f-input code" rows={6} placeholder="<section class=&quot;hero&quot;>…</section>" value={paste.html} onChange={(e) => setPaste({ ...paste, html: e.target.value })} />
          <textarea className="f-input code" rows={4} placeholder=".hero { padding-top: 80px; }" value={paste.css} onChange={(e) => setPaste({ ...paste, css: e.target.value })} />
          <button className="btn primary" disabled={!paste.html.trim()} onClick={() => {
            const n = insertMarkup(paste.html, paste.css);
            toast(n ? `Imported ${n} element${n > 1 ? 's' : ''}` : 'Nothing to import');
            if (n) setPaste({ open: false, html: '', css: '' });
          }}>Import</button>
        </>}
      </div>
    </div>
  );
}
