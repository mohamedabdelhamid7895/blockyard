/* Audit panel: accessibility, SEO and performance issues on the current page. */
import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, RefreshCw } from 'lucide-react';
import { runAudit, type Issue } from '../audit';
import { getCanvasDoc, scrollToNode } from '../canvas/Canvas';
import { select } from '../actions';
import { getState, useStore } from '../store';

const ICON = { error: AlertCircle, warning: AlertTriangle, info: Info };

export function AuditPanel() {
  const project = useStore((s) => s.project);
  const pageId = useStore((s) => s.ui.pageId);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [filter, setFilter] = useState<'all' | Issue['category']>('all');
  const run = () => setIssues(runAudit(getState().project, getState().ui, getCanvasDoc()));
  useEffect(() => { const t = setTimeout(run, 300); return () => clearTimeout(t); }, [project, pageId]);
  const shown = issues.filter((i) => filter === 'all' || i.category === filter);
  const count = (s: Issue['severity']) => issues.filter((i) => i.severity === s).length;
  return (
    <div className="lp">
      <div className="lp-head"><h3>Audit</h3><button className="icon-btn" title="Run again" onClick={run}><RefreshCw size={13} /></button></div>
      <div className="audit-summary">
        <span className="err"><AlertCircle size={12} /> {count('error')}</span>
        <span className="warn"><AlertTriangle size={12} /> {count('warning')}</span>
        <span className="info"><Info size={12} /> {count('info')}</span>
      </div>
      <div className="chips">
        {(['all', 'Accessibility', 'SEO', 'Performance'] as const).map((c) => <button key={c} className={filter === c ? 'on' : ''} onClick={() => setFilter(c)}>{c === 'all' ? 'All' : c}</button>)}
      </div>
      {!shown.length && <div className="audit-ok"><CheckCircle2 size={20} /> No issues found{filter !== 'all' ? ` for ${filter}` : ''}.</div>}
      {shown.map((i, k) => {
        const Icon = ICON[i.severity];
        return (
          <button key={k} className={'audit-item ' + i.severity} onClick={() => { if (i.nodeId) { select(i.nodeId); scrollToNode(i.nodeId); } }}>
            <Icon size={13} />
            <span><b>{i.message}</b>{i.fix && <small>{i.fix}</small>}<em>{i.category}</em></span>
          </button>
        );
      })}
      <div className="add-hint">Automated checks find many common problems, not all of them. Test with a keyboard and a screen reader too.</div>
    </div>
  );
}
