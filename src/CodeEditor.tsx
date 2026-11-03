/* A Webflow-style code editor modal used for Code Embeds and for site and page custom code. */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CodeXml, Sparkles, X } from 'lucide-react';
import { api } from './api';
import { useTarget } from './store';

export type CodeKind = 'embed' | 'head' | 'body';
export const CODE_LIMIT = 50_000;

const HINTS: Record<CodeKind, string> = {
  embed: 'HTML, CSS in a <style> tag, or JavaScript in a <script> tag. Scripts run on the published site and in Preview, not in the Designer.',
  head: 'Added inside <head> on every page it applies to: meta tags, fonts, analytics, and styles.',
  body: 'Added before </body>: scripts that run after the page has loaded.',
};

export function CodeEditor({ title, value, kind, onSave, onClose }: {
  title: string; value: string; kind: CodeKind; onSave: (v: string) => void; onClose: () => void;
}) {
  const [code, setCode] = useState(value);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<{ text: string; error?: boolean } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const target = useTarget();
  const lines = code.split('\n').length;
  const over = code.length > CODE_LIMIT;
  const save = () => { if (!over) { onSave(code); onClose(); } };

  useEffect(() => { area.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: t } = el;
      const next = code.slice(0, s) + '  ' + code.slice(t);
      setCode(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
    }
  };

  const generate = async () => {
    if (!aiPrompt.trim() || !target.projectId) return;
    setAiBusy(true);
    setAiNote(null);
    try {
      const out = await api<{ code: string; explanation: string }>(`/ai/${target.projectId}/code`, { body: { prompt: aiPrompt, kind, current: code } });
      setCode(out.code);
      setAiNote({ text: out.explanation });
      setAiPrompt('');
    } catch (e) {
      setAiNote({ text: (e as Error).message, error: true });
    } finally {
      setAiBusy(false);
    }
  };

  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal code-modal">
        <div className="modal-head">
          <h3><CodeXml size={15} /> {title}</h3>
          <div className="spacer" />
          <button className="icon-btn" onClick={onClose} title="Close"><X size={16} /></button>
        </div>
        <div className="code-hint">{HINTS[kind]}</div>
        <div className="code-area">
          <div className="code-gutter" ref={gutter}>{Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}</div>
          <textarea ref={area} value={code} spellCheck={false} wrap="off" placeholder={kind === 'embed' ? '<div>Your code here</div>' : '<!-- Your code here -->'}
            onChange={(e) => setCode(e.target.value)} onKeyDown={onKeyDown}
            onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }} />
        </div>
        {target.kind === 'remote' && (
          <div className="code-ai">
            <Sparkles size={14} />
            <input className="f-input" placeholder={target.hasAiKey ? 'Ask Claude to write or change this code…' : 'Connect Claude in Workspace settings to generate code'}
              disabled={!target.hasAiKey || aiBusy} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && generate()} />
            <button className="btn" disabled={!target.hasAiKey || aiBusy || !aiPrompt.trim()} onClick={generate}>{aiBusy ? 'Writing…' : 'Generate'}</button>
          </div>
        )}
        {aiNote && <div className={'code-note' + (aiNote.error ? ' error' : '')}>{aiNote.text}</div>}
        <div className="code-foot">
          <span className={'code-count' + (over ? ' over' : '')}>{code.length.toLocaleString()} / {CODE_LIMIT.toLocaleString()} characters</span>
          <div className="spacer" />
          <span className="muted small">⌘S to save</span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={over}>Save &amp; Close</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A compact preview of some code with a button that opens the editor. */
export function CodeField({ label, value, kind, onSave }: { label: string; value: string; kind: CodeKind; onSave: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="code-field">
      <div className="code-field-head"><span>{label}</span><button className="btn small" onClick={() => setOpen(true)}>{value ? 'Edit code' : 'Add code'}</button></div>
      <pre className={'code-preview' + (value ? '' : ' empty')} onClick={() => setOpen(true)}>{value ? value.slice(0, 400) : 'No code yet'}</pre>
      {open && <CodeEditor title={label} value={value} kind={kind} onSave={onSave} onClose={() => setOpen(false)} />}
    </div>
  );
}
