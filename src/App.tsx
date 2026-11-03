import { useEffect } from 'react';
import {
  Box, ChevronDown, CodeXml, Database, Ellipsis, Eye, FileText, Keyboard, Layers, LayoutTemplate, Monitor, Plus, Redo2,
  Smartphone, Tablet, Undo2, X,
} from 'lucide-react';
import { BP_ORDER, BREAKPOINTS } from './constants';
import { currentPage, migrate } from './model';
import { getState, openModal, redo, setUI, toast, undo, usePage, useStore } from './store';
import { cleanupClasses, exitComponent, openPage, replaceProject } from './actions';
import { Canvas, endDrag } from './canvas/Canvas';
import { RightPanel } from './panels/RightPanel';
import { AddPanel, Breadcrumbs, CmsPanel, ComponentsPanel, NavigatorPanel, PagesPanel, TemplatesPanel } from './panels/LeftPanels';
import { Modals } from './Modals';
import { onKeyDown } from './keyboard';
import { blankProject, starterProject } from './templates';
import { download } from './zip';
import { pickFile } from './files';
import { Menu } from './ui';
import type { BP, LeftPanel } from './types';

const RAIL: { id: LeftPanel; icon: typeof Plus; label: string }[] = [
  { id: 'add', icon: Plus, label: 'Add elements' },
  { id: 'navigator', icon: Layers, label: 'Navigator' },
  { id: 'components', icon: Box, label: 'Components' },
  { id: 'pages', icon: FileText, label: 'Pages' },
  { id: 'cms', icon: Database, label: 'CMS' },
  { id: 'templates', icon: LayoutTemplate, label: 'Templates' },
];

const BP_ICONS: Record<BP, React.ReactNode> = {
  desktop: <Monitor size={15} />, tablet: <Tablet size={15} />, landscape: <Smartphone size={15} className="rot" />, mobile: <Smartphone size={15} />,
};

function TopBar() {
  const project = useStore((s) => s.project);
  const page = usePage();
  const bp = useStore((s) => s.ui.bp);
  const cmsItemId = useStore((s) => s.ui.cmsItemId);
  const saveState = useStore((s) => s.saveState);
  const scale = useStore((s) => s.canvasScale);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const coll = page.collectionId ? project.collections.find((c) => c.id === page.collectionId) : null;

  const openJSON = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const p = migrate(JSON.parse(await f.text()));
      if (!p) throw new Error('bad');
      replaceProject(p, `Opened ${f.name}`);
    } catch { toast('That file is not a Blockyard project'); }
  };

  return (
    <header className="topbar">
      <div className="brand" title="Blockyard"><span className="logo-mark">B</span></div>
      <Menu className="page-menu" trigger={(open) => (
        <button className={'tb-btn page-btn' + (open ? ' on' : '')}>
          <span className="muted">Page:</span> {page.name} <ChevronDown size={12} />
        </button>
      )}>
        {(close) => (<>
          {project.pages.map((p) => (
            <button key={p.id} className={p.id === page.id ? 'on' : ''} onClick={() => { close(); openPage(p.id); }}>
              {p.collectionId ? <Database size={12} /> : <FileText size={12} />} {p.name}
            </button>
          ))}
          <hr />
          <button onClick={() => { close(); setUI({ left: 'pages' }); }}>Manage pages…</button>
        </>)}
      </Menu>
      {coll && (
        <select className="tb-select" value={cmsItemId || ''} title="Item shown on the template page" onChange={(e) => setUI({ cmsItemId: e.target.value })}>
          {coll.items.map((i) => <option key={i.id} value={i.id}>{i.data.name}</option>)}
          {!coll.items.length && <option value="">No items</option>}
        </select>
      )}

      <div className="spacer" />
      <div className="bp-group">
        {BP_ORDER.map((b) => (
          <button key={b} className={bp === b ? 'on' : ''} title={`${BREAKPOINTS[b].label}${BREAKPOINTS[b].media ? ' · ' + BREAKPOINTS[b].media!.slice(1, -1) : ' · base styles'}`}
            onClick={() => setUI({ bp: b })}>{BP_ICONS[b]}</button>
        ))}
        <span className="bp-width">{BREAKPOINTS[bp].width ? `${BREAKPOINTS[bp].width} px` : 'Base'}{scale < 1 ? ` · ${Math.round(scale * 100)}%` : ''}</span>
      </div>
      <div className="spacer" />

      <span className={'save-state ' + saveState}>{saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : 'Not saved (storage full)'}</span>
      <button className="tb-icon" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}><Undo2 size={15} /></button>
      <button className="tb-icon" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}><Redo2 size={15} /></button>
      <Menu align="right" trigger={() => <button className="tb-icon" title="Project"><Ellipsis size={16} /></button>}>
        {(close) => (<>
          <button onClick={() => { close(); if (confirm('Start a new blank site? (You can undo this.)')) replaceProject(blankProject(), 'New blank site'); }}>New blank site</button>
          <button onClick={() => { close(); if (confirm('Replace the current site with the starter template? (You can undo this.)')) replaceProject(starterProject(), 'Starter template loaded'); }}>Load starter site</button>
          <hr />
          <button onClick={() => { close(); download('blockyard-project.json', JSON.stringify(getState().project, null, 2), 'application/json'); }}>Download project (.json)</button>
          <button onClick={() => { close(); openJSON(); }}>Open project (.json)…</button>
          <hr />
          <button onClick={() => { close(); cleanupClasses(); }}>Remove unused classes</button>
          <button onClick={() => { close(); openModal('shortcuts'); }}><Keyboard size={12} /> Keyboard shortcuts</button>
        </>)}
      </Menu>
      <button className="tb-icon" title="Preview (P)" onClick={() => openModal('preview')}><Eye size={16} /></button>
      <button className="tb-icon" title="Export code" onClick={() => openModal('export')}><CodeXml size={16} /></button>
      <button className="publish" onClick={() => openModal('export')}>Export</button>
    </header>
  );
}

function LeftRail() {
  const left = useStore((s) => s.ui.left);
  return (
    <nav className="rail">
      {RAIL.map((r) => (
        <button key={r.id} title={r.label} className={left === r.id ? 'on' : ''} onClick={() => setUI({ left: left === r.id ? null : r.id })}>
          <r.icon size={17} strokeWidth={1.75} />
        </button>
      ))}
      <div className="spacer" />
      <button title="Keyboard shortcuts" onClick={() => openModal('shortcuts')}><Keyboard size={16} strokeWidth={1.75} /></button>
    </nav>
  );
}

function LeftFlyout() {
  const left = useStore((s) => s.ui.left);
  if (!left) return null;
  const Panel = { add: AddPanel, navigator: NavigatorPanel, components: ComponentsPanel, pages: PagesPanel, cms: CmsPanel, templates: TemplatesPanel }[left];
  return <aside className="left panel"><Panel /></aside>;
}

function ComponentBanner() {
  const comp = useStore((s) => (s.ui.editingComponentId ? s.project.components[s.ui.editingComponentId] : null));
  const pageName = useStore((s) => currentPage(s.project, s.ui).name);
  if (!comp) return null;
  return (
    <div className="comp-banner">
      <Box size={13} /> Editing component <b>{comp.name}</b>. Changes apply to every instance.
      <div className="spacer" />
      <button className="btn small" onClick={exitComponent}><X size={12} /> Back to {pageName}</button>
    </div>
  );
}

function Toast() {
  const t = useStore((s) => s.toast);
  return t ? <div className="toast" key={t.key}>{t.msg}</div> : null;
}

export function App() {
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('dragend', endDrag);
    return () => { window.removeEventListener('keydown', onKeyDown); document.removeEventListener('dragend', endDrag); };
  }, []);
  return (
    <div className="app">
      <TopBar />
      <div className="workspace">
        <LeftRail />
        <LeftFlyout />
        <main className="stage">
          <ComponentBanner />
          <Canvas />
          <Breadcrumbs />
        </main>
        <RightPanel />
      </div>
      <Modals />
      <Toast />
    </div>
  );
}
