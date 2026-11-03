import { useState } from 'react';
import {
  Box, ChevronDown, ChevronRight, Copy, Database, Eye, FileText, LayoutTemplate, Pencil, Plus, Settings, Trash2, Zap,
} from 'lucide-react';
import { ADD_GROUPS, ELEMENTS } from '../constants';
import { iconFor } from '../icons';
import { currentPage, currentRoot, findNode, isContainer, nodeLabel, pathTo } from '../model';
import { getState, openModal, setUI, useRoot, useStore } from '../store';
import {
  addElement, addPage, deleteComponent, deletePage, dropIsValid, duplicatePage, editComponent, insertComponent, insertSection,
  openPage, openTemplatePage, performDrop, renameComponent, select, type Drop,
} from '../actions';
import { dragState, endDrag, scrollToNode } from '../canvas/Canvas';
import { PAGE_TEMPLATES, SECTION_TEMPLATES } from '../templates';
import { Empty } from '../ui';
import type { Node } from '../types';

function PanelHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="lp-head"><h3>{title}</h3>{children}</div>;
}

/* ---- Add ---- */
export function AddPanel() {
  return (
    <div className="lp">
      <PanelHead title="Add elements" />
      {ADD_GROUPS.map((group) => (
        <div key={group} className="add-group">
          <h4>{group}</h4>
          <div className="add-grid">
            {Object.entries(ELEMENTS).filter(([, d]) => !d.hidden && d.group === group).map(([type, def]) => (
              <div key={type} className="add-tile" draggable title={`Drag onto the canvas, or click to add a ${def.label}`}
                onDragStart={(e) => { dragState.current = { kind: 'new', type }; e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', type); }}
                onDragEnd={endDrag}
                onClick={() => addElement(type)}>
                {(() => { const Icon = iconFor(type); return <Icon size={18} strokeWidth={1.5} />; })()}
                <span>{def.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="add-hint">Click a tile to add it inside the selected element, or drag it to an exact spot on the canvas or in the Navigator.</div>
    </div>
  );
}

/* ---- Navigator ---- */
function navDropFor(node: Node, parent: Node | null, rowEl: HTMLElement, y: number, collapsed: string[]): (Drop & { mode: string }) | null {
  if (!parent) return { parentId: node.id, index: node.children!.length, mode: 'inside' };
  const r = rowEl.getBoundingClientRect();
  const f = (y - r.top) / r.height;
  const idx = parent.children!.indexOf(node);
  if (isContainer(node) && node.type !== 'collectionlist') {
    if (f < 0.3) return { parentId: parent.id, index: idx, mode: 'before' };
    if (f > 0.7 && (!node.children.length || collapsed.includes(node.id))) return { parentId: parent.id, index: idx + 1, mode: 'after' };
    if (f > 0.7) return { parentId: node.id, index: 0, mode: 'inside' };
    return { parentId: node.id, index: node.children.length, mode: 'inside' };
  }
  return f < 0.5 ? { parentId: parent.id, index: idx, mode: 'before' } : { parentId: parent.id, index: idx + 1, mode: 'after' };
}

export function NavigatorPanel() {
  const root = useRoot();
  const project = useStore((s) => s.project);
  const selectedId = useStore((s) => s.ui.selectedId);
  const collapsed = useStore((s) => s.ui.collapsedNav);
  const compId = useStore((s) => s.ui.editingComponentId);

  const rows: React.ReactNode[] = [];
  const walk = (n: Node, parent: Node | null, depth: number) => {
    const kids = n.type === 'symbol' ? [] : n.children || [];
    const closed = collapsed.includes(n.id);
    const Icon = iconFor(n.type);
    const text = n.bind?.text ? `⟨${n.bind.text}⟩` : n.text != null ? n.text.slice(0, 28) : '';
    rows.push(
      <div key={n.id} data-nid={n.id}
        className={'nav-row' + (n.id === selectedId ? ' selected' : '') + (n.type === 'symbol' ? ' sym' : '') + (n.bind ? ' bound' : '')}
        style={{ paddingLeft: 6 + depth * 12 }} draggable={!!parent && n.type !== 'collectionitem'}
        onClick={() => { select(n.id); scrollToNode(n.id); }}
        onMouseEnter={() => useStore.setState({ hoverId: n.id })}
        onMouseLeave={() => useStore.setState({ hoverId: null })}
        onDragStart={(e) => { e.stopPropagation(); dragState.current = { kind: 'move', id: n.id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', n.id); }}
        onDragOver={(e) => {
          const drag = dragState.current;
          document.querySelectorAll('.nav-row').forEach((r) => r.classList.remove('drop-before', 'drop-after', 'drop-inside'));
          if (!drag) return;
          const drop = navDropFor(n, parent, e.currentTarget, e.clientY, collapsed);
          if (!dropIsValid(drag, drop)) return;
          e.preventDefault();
          e.currentTarget.classList.add('drop-' + drop!.mode);
        }}
        onDrop={(e) => {
          const drag = dragState.current;
          if (!drag) return;
          e.preventDefault();
          const drop = navDropFor(n, parent, e.currentTarget, e.clientY, collapsed);
          if (drop) performDrop(drag, drop);
          endDrag();
        }}
        onDragEnd={endDrag}>
        <span className="caret" onClick={(e) => {
          if (!kids.length) return;
          e.stopPropagation();
          setUI({ collapsedNav: closed ? collapsed.filter((x) => x !== n.id) : [...collapsed, n.id] });
        }}>{kids.length ? (closed ? <ChevronRight size={11} /> : <ChevronDown size={11} />) : null}</span>
        <Icon size={12} className="nav-icon" />
        <span className="nav-name">{n.type === 'symbol' ? nodeLabel(n, project) : n.classes.length && n.type !== 'body' ? n.classes.join('.') : nodeLabel(n)}</span>
        {text && <span className="nav-text">{text}</span>}
        {n.ix?.length ? <Zap size={10} className="nav-ix" /> : null}
      </div>,
    );
    if (!closed) kids.forEach((c) => walk(c, n, depth + 1));
  };
  walk(root, null, 0);

  return (
    <div className="lp">
      <PanelHead title={compId ? `Navigator · ${project.components[compId]?.name}` : 'Navigator'} />
      <div className="nav-tree">{rows}</div>
    </div>
  );
}

/* ---- Pages ---- */
export function PagesPanel() {
  const pages = useStore((s) => s.project.pages);
  const collections = useStore((s) => s.project.collections);
  const pageId = useStore((s) => s.ui.pageId);
  const staticPages = pages.filter((p) => !p.collectionId);
  const templatePages = pages.filter((p) => p.collectionId);
  const pageRow = (p: (typeof pages)[number]) => (
    <div key={p.id} className={'page-row' + (p.id === pageId ? ' on' : '')} onClick={() => openPage(p.id)}>
      {p.collectionId ? <Database size={13} /> : <FileText size={13} />}
      <span className="pname">{p.name}</span>
      <span className="pslug">{p.collectionId ? `/${collections.find((c) => c.id === p.collectionId)?.slug}-…` : `/${p.slug === 'index' ? '' : p.slug}`}</span>
      <span className="row-actions">
        <button className="icon-btn" title="Page settings" onClick={(e) => { e.stopPropagation(); openPage(p.id); select(p.root.id); setUI({ right: 'settings' }); }}><Settings size={12} /></button>
        {!p.collectionId && <button className="icon-btn" title="Duplicate page" onClick={(e) => { e.stopPropagation(); duplicatePage(p.id); }}><Copy size={12} /></button>}
        {(p.collectionId || staticPages.length > 1) && <button className="icon-btn" title="Delete page" onClick={(e) => { e.stopPropagation(); deletePage(p.id); }}><Trash2 size={12} /></button>}
      </span>
    </div>
  );
  return (
    <div className="lp">
      <PanelHead title="Pages">
        <button className="icon-btn" title="New page" onClick={() => addPage('blank')}><Plus size={14} /></button>
      </PanelHead>
      <h4 className="lp-sub">Static pages</h4>
      {staticPages.map(pageRow)}
      <h4 className="lp-sub">CMS collection pages</h4>
      {templatePages.map(pageRow)}
      {collections.filter((c) => !templatePages.some((p) => p.collectionId === c.id)).map((c) => (
        <div key={c.id} className="page-row ghost" onClick={() => openTemplatePage(c.id)}>
          <Plus size={13} /><span className="pname">Create {c.name} template</span>
        </div>
      ))}
      {!collections.length && <div className="muted small pad">Create a CMS collection to get a template page for its items.</div>}
      <h4 className="lp-sub">New page from a template</h4>
      {PAGE_TEMPLATES.map((t) => (
        <div key={t.id} className="page-row ghost" title={t.description} onClick={() => addPage(t.id)}>
          <LayoutTemplate size={13} /><span className="pname">{t.name}</span>
        </div>
      ))}
    </div>
  );
}

/* ---- Components ---- */
export function ComponentsPanel() {
  const components = useStore((s) => s.project.components);
  const project = useStore((s) => s.project);
  const editing = useStore((s) => s.ui.editingComponentId);
  const usage = (id: string) => {
    let n = 0;
    const walk = (x: Node) => { if (x.type === 'symbol' && x.componentId === id) n++; (x.children || []).forEach(walk); };
    project.pages.forEach((p) => walk(p.root));
    Object.values(project.components).forEach((c) => walk(c.root));
    return n;
  };
  const list = Object.values(components);
  return (
    <div className="lp">
      <PanelHead title="Components" />
      {!list.length && <Empty>No components yet. Select an element, then use <b>Settings → Component</b> to make it reusable.</Empty>}
      {list.map((c) => (
        <div key={c.id} className={'comp-row' + (editing === c.id ? ' on' : '')} draggable
          onDragStart={(e) => { dragState.current = { kind: 'component', componentId: c.id }; e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', c.id); }}
          onDragEnd={endDrag}
          onClick={() => insertComponent(c.id)} title="Click to insert, or drag onto the canvas">
          <Box size={14} />
          <span className="pname">{c.name}</span>
          <span className="pslug">{usage(c.id)}×</span>
          <span className="row-actions">
            <button className="icon-btn" title="Edit component" onClick={(e) => { e.stopPropagation(); editComponent(c.id); }}><Eye size={12} /></button>
            <button className="icon-btn" title="Rename" onClick={(e) => { e.stopPropagation(); renameComponent(c.id); }}><Pencil size={12} /></button>
            <button className="icon-btn" title="Delete" onClick={(e) => { e.stopPropagation(); deleteComponent(c.id); }}><Trash2 size={12} /></button>
          </span>
        </div>
      ))}
      {list.length > 0 && <div className="add-hint">Click to insert an instance, or drag it onto the canvas. Edit a component once and every instance updates.</div>}
    </div>
  );
}

/* ---- CMS ---- */
export function CmsPanel() {
  const collections = useStore((s) => s.project.collections);
  return (
    <div className="lp">
      <PanelHead title="CMS Collections">
        <button className="icon-btn" title="New collection" onClick={() => openModal('cms', 'new')}><Plus size={14} /></button>
      </PanelHead>
      {!collections.length && <Empty>Collections hold structured content such as blog posts, team members or products. Create one, then show it with a <b>Collection List</b>.</Empty>}
      {collections.map((c) => (
        <div key={c.id} className="comp-row" onClick={() => openModal('cms', c.id)}>
          <Database size={14} />
          <span className="pname">{c.name}</span>
          <span className="pslug">{c.items.length} items</span>
        </div>
      ))}
      <div className="btn-row pad"><button className="btn primary" onClick={() => openModal('cms', 'new')}><Plus size={12} /> New collection</button></div>
    </div>
  );
}

/* ---- Templates ---- */
export function TemplatesPanel() {
  const [cat, setCat] = useState('All');
  const cats = ['All', ...new Set(SECTION_TEMPLATES.map((t) => t.category))];
  return (
    <div className="lp">
      <PanelHead title="Templates" />
      <div className="chips">{cats.map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}</div>
      <div className="tpl-list">
        {SECTION_TEMPLATES.filter((t) => cat === 'All' || t.category === cat).map((t) => (
          <button key={t.id} className="tpl-card" onClick={() => {
            const { ui } = getState();
            if (ui.editingComponentId) { exitAndInsert(t.id); return; }
            insertSection(t.id);
          }}>
            <TemplateThumb id={t.id} />
            <span className="tpl-name">{t.name}</span>
            <span className="tpl-cat">{t.category}</span>
          </button>
        ))}
      </div>
      <div className="add-hint">Sections are added after the selected section, or at the end of the page. Their classes are shared, so restyling one updates every copy.</div>
    </div>
  );
}

function exitAndInsert(id: string) {
  setUI({ editingComponentId: null, selectedId: null });
  insertSection(id);
}

/** A tiny wireframe so each template is recognisable at a glance. */
function TemplateThumb({ id }: { id: string }) {
  const bar = (w: number, h = 4, extra: React.CSSProperties = {}) => <i style={{ width: `${w}%`, height: h, ...extra }} />;
  const box = (n: number, h = 22) => <div className="tt-row">{Array.from({ length: n }, (_, i) => <i key={i} style={{ height: h, flex: 1 }} />)}</div>;
  const content: Record<string, React.ReactNode> = {
    navbar: <div className="tt-row between">{bar(18)}<div className="tt-row">{bar(10)}{bar(10)}{bar(10)}</div>{bar(14, 7, { background: '#146ef5' })}</div>,
    'hero-centered': <div className="tt-col center">{bar(30, 3)}{bar(70, 7)}{bar(50)}<div className="tt-row">{bar(16, 7, { background: '#146ef5' })}{bar(16, 7)}</div></div>,
    'hero-split': <div className="tt-row"><div className="tt-col" style={{ flex: 1 }}>{bar(80, 7)}{bar(60)}{bar(30, 7, { background: '#146ef5' })}</div><i style={{ flex: 1, height: 34 }} /></div>,
    logos: <div className="tt-row between">{bar(14)}{bar(14)}{bar(14)}{bar(14)}{bar(14)}</div>,
    features: <div className="tt-col center">{bar(50, 5)}{box(3)}{box(3)}</div>,
    stats: <div className="tt-row between">{[0, 1, 2, 3].map((i) => <div key={i} className="tt-col center" style={{ flex: 1 }}>{bar(60, 7, { background: '#146ef5' })}{bar(80, 3)}</div>)}</div>,
    testimonials: <div className="tt-col center">{bar(40, 5)}{box(2, 30)}</div>,
    pricing: <div className="tt-col center">{bar(50, 5)}<div className="tt-row">{[0, 1, 2].map((i) => <i key={i} style={{ flex: 1, height: 38, outline: i === 1 ? '1px solid #146ef5' : '' }} />)}</div></div>,
    faq: <div className="tt-col center">{bar(50, 5)}{bar(80, 8)}{bar(80, 8)}{bar(80, 8)}</div>,
    blog: <div className="tt-col center">{bar(40, 5)}{box(3, 30)}</div>,
    cta: <div className="tt-col center dark">{bar(60, 7, { background: '#555' })}{bar(20, 7, { background: '#fff' })}</div>,
    contact: <div className="tt-col center">{bar(40, 5)}{bar(50, 6)}{bar(50, 6)}{bar(50, 12)}{bar(20, 6, { background: '#146ef5' })}</div>,
    footer: <div className="tt-row between">{bar(40)}<div className="tt-row">{bar(8)}{bar(8)}{bar(8)}</div></div>,
  };
  return <div className={'tpl-thumb' + (id === 'cta' ? ' dark' : '')}>{content[id]}</div>;
}

/* ---- Breadcrumbs ---- */
export function Breadcrumbs() {
  const project = useStore((s) => s.project);
  const ui = useStore((s) => s.ui);
  const root = currentRoot(project, ui);
  if (!ui.selectedId || !findNode(root, ui.selectedId)) return <div className="crumbs"><span className="muted">{currentPage(project, ui).name}</span></div>;
  const path = pathTo(root, ui.selectedId);
  return (
    <div className="crumbs">
      {path.map((n, i) => (
        <span key={n.id} className="crumb-wrap">
          {i > 0 && <ChevronRight size={10} className="sep" />}
          <button className={i === path.length - 1 ? 'last' : ''} onClick={() => { select(n.id); scrollToNode(n.id); }}>
            {n.type === 'symbol' ? nodeLabel(n, project) : n.type !== 'body' && n.classes.length ? n.classes.join('.') : nodeLabel(n)}
          </button>
        </span>
      ))}
    </div>
  );
}
