/* Small shared UI controls. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** A text input that keeps its own draft and commits on blur or Enter, like Webflow's panel fields. */
export function CommitInput(props: {
  value: string | undefined;
  onCommit: (v: string) => void;
  placeholder?: string;
  className?: string;
  list?: string;
  multiline?: boolean;
  rows?: number;
  title?: string;
  disabled?: boolean;
  type?: string;
  onArrow?: (dir: 1 | -1, e: React.KeyboardEvent) => string | null;
}) {
  const { value, onCommit, multiline, onArrow, ...rest } = props;
  const [draft, setDraft] = useState(value ?? '');
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(value ?? ''); }, [value]);
  const commit = (v = draft) => { if (v !== (value ?? '')) onCommit(v); };
  const common = {
    ...rest,
    className: 'f-input ' + (props.className || ''),
    value: draft,
    spellCheck: false,
    onFocus: () => { focused.current = true; },
    onBlur: () => { focused.current = false; commit(); },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
  };
  if (multiline) return <textarea {...common} rows={props.rows || 3} />;
  return (
    <input
      {...common}
      type={props.type || 'text'}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { setDraft(value ?? ''); requestAnimationFrame(() => (e.target as HTMLInputElement).blur()); }
        if (onArrow && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          const next = onArrow(e.key === 'ArrowUp' ? 1 : -1, e);
          if (next != null) { setDraft(next); onCommit(next); }
        }
      }}
    />
  );
}

export function Select(props: { value: string; onChange: (v: string) => void; options: (string | [string, string])[]; placeholder?: string; className?: string; title?: string }) {
  return (
    <select className={'f-input ' + (props.className || '')} value={props.value} title={props.title} onChange={(e) => props.onChange(e.target.value)}>
      {props.placeholder != null && <option value="">{props.placeholder}</option>}
      {props.options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  );
}

export function Section({ title, open, onToggle, children, right }: { title: string; open: boolean; onToggle?: () => void; children: ReactNode; right?: ReactNode }) {
  return (
    <div className={'sec' + (open ? '' : ' collapsed')}>
      <div className="sec-head" onClick={onToggle} role={onToggle ? 'button' : undefined}>
        <span>{title}</span>
        <span className="sec-right" onClick={(e) => e.stopPropagation()}>{right}</span>
        {onToggle && <ChevronDown size={12} className="chev" />}
      </div>
      {open && <div className="sec-body">{children}</div>}
    </div>
  );
}

/** A dropdown menu anchored under its trigger button. */
export function Menu({ trigger, children, align = 'left', className }: { trigger: (open: boolean) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div className={'menu-wrap ' + (className || '')} ref={ref}>
      <div onClick={() => setOpen(!open)}>{trigger(open)}</div>
      {open && <div className={'menu ' + align}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-hint">{children}</div>;
}
