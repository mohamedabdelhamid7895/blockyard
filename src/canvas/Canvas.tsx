/* The design canvas: an iframe rendered imperatively from the project, with selection overlays,
 * drag and drop and inline text editing. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BASE_CSS, BREAKPOINTS, GOOGLE_FONTS_URL } from '../constants';
import { bodyHTML, generateCSS, renderNode } from '../codegen';
import { animationValue, IX_KEYFRAMES } from '../interactions';
import { currentPage, currentRoot, findNode, isContainer, nodeLabel } from '../model';
import { getState, toast, useStore } from '../store';
import { dropIsValid, editComponent, performDrop, select, setNodeText, updateNode, type Drop, type DragSource } from '../actions';
import { onKeyDown } from '../keyboard';
import { pickImage } from '../files';
import type { Interaction } from '../types';

const EDITOR_CSS = `
body { min-height: 100vh; }
[data-nid] { cursor: default; }
iframe[data-nid] { pointer-events: none; }
.__empty { min-height: 72px; outline: 1px dashed #9ab8f0; outline-offset: -4px;
  background-image: repeating-linear-gradient(45deg, rgba(20,110,245,.05) 0 10px, transparent 10px 20px); }
.__cms-empty, .__missing { padding: 24px; text-align: center; font: 13px/1.4 Inter, system-ui, sans-serif; color: #6b7280;
  background: #f3f4f6; border: 1px dashed #c7cbd4; border-radius: 6px; grid-column: 1 / -1; }
[contenteditable="true"] { outline: 2px solid #146ef5 !important; outline-offset: 2px; cursor: text; }
.__ov { position: fixed; pointer-events: none; z-index: 2147483646; display: none; box-sizing: border-box; }
#__hover { border: 1px solid #5e9ffc; }
#__sel { border: 1px solid #146ef5; }
#__sel.sym { border-color: #2fbf71; }
#__lbl { background: #146ef5; color: #fff; font: 500 11px/1 Inter, system-ui, sans-serif; padding: 4px 6px; border-radius: 2px 2px 0 0; white-space: nowrap; }
#__lbl.sym { background: #2fbf71; }
#__drop { background: #146ef5; border-radius: 2px; }
#__dropbox { border: 2px solid #146ef5; background: rgba(20,110,245,.08); }
`;

const DESKTOP_MIN = 992;
const OVERLAYS = ['__hover', '__sel', '__lbl', '__drop', '__dropbox'];

/** What is being dragged right now (from the Add panel, Navigator, Components panel or canvas). */
export const dragState: { current: DragSource | null } = { current: null };

let canvasDoc: Document | null = null;

export function elFor(id: string | null) {
  return canvasDoc && id ? (canvasDoc.querySelector(`[data-nid="${id}"]:not([data-rep])`) as HTMLElement | null) : null;
}

export function scrollToNode(id: string) {
  const el = elFor(id);
  if (el && el !== canvasDoc?.body) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** Plays an interaction's animation on the canvas so it can be previewed while designing. */
export function playInteraction(nodeId: string, x: Interaction) {
  const el = elFor(nodeId);
  if (!el) return;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = animationValue(x);
  el.addEventListener('animationend', () => { el.style.animation = ''; }, { once: true });
}

export function endDrag() {
  dragState.current = null;
  hideDrop();
  document.querySelectorAll('.nav-row').forEach((r) => r.classList.remove('drop-before', 'drop-after', 'drop-inside'));
}

function hideDrop() {
  ['__drop', '__dropbox'].forEach((id) => { const e = canvasDoc?.getElementById(id); if (e) e.style.display = 'none'; });
}

function placeBox(box: HTMLElement | null, el: Element | null) {
  if (!box) return;
  if (!el) { box.style.display = 'none'; return; }
  const r = el.getBoundingClientRect();
  Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
}

export function updateOverlays() {
  const doc = canvasDoc;
  if (!doc) return;
  const { ui, hoverId, project } = getState();
  const root = currentRoot(project, ui);
  const selEl = elFor(ui.selectedId) || (ui.selectedId === root.id && !ui.editingComponentId ? doc.body : null);
  const hovEl = hoverId !== ui.selectedId ? elFor(hoverId) : null;
  placeBox(doc.getElementById('__hover'), hovEl);
  const selBox = doc.getElementById('__sel');
  placeBox(selBox, selEl);
  const lbl = doc.getElementById('__lbl');
  if (!lbl || !selBox) return;
  const found = ui.selectedId ? findNode(root, ui.selectedId) : null;
  const sym = found?.node.type === 'symbol';
  selBox.classList.toggle('sym', sym);
  lbl.classList.toggle('sym', sym);
  if (selEl && found && !editing) {
    const n = found.node;
    lbl.textContent = sym ? `◆ ${nodeLabel(n, project)}` : n.classes.length ? n.classes.join('.') : nodeLabel(n);
    const r = selEl.getBoundingClientRect();
    lbl.style.display = 'block';
    lbl.style.left = Math.max(0, r.left) + 'px';
    lbl.style.top = (r.top > 20 ? r.top - 19 : r.top) + 'px';
  } else lbl.style.display = 'none';
}

let editing: { el: HTMLElement; id: string; original: string; cancel?: boolean } | null = null;

function isHorizontalFlow(el: Element | null) {
  if (!el || !canvasDoc) return false;
  const cs = canvasDoc.defaultView!.getComputedStyle(el);
  if (cs.display.includes('flex')) return !cs.flexDirection.startsWith('column');
  if (cs.display.includes('grid')) return cs.gridTemplateColumns.split(' ').length > 1;
  return false;
}

type CanvasDrop = Drop & { box?: Element; line?: { el: Element; before: boolean; horiz: boolean } };

/** Works out where a drop at (x, y) over `target` would land. */
function computeDrop(target: EventTarget | null, x: number, y: number): CanvasDrop | null {
  const { project, ui } = getState();
  const root = currentRoot(project, ui);
  let el = (target as Element)?.closest?.('[data-nid]:not([data-rep])') || null;
  if (!el) el = elFor(root.id) || canvasDoc!.body;
  const found = findNode(root, (el as HTMLElement).dataset.nid || root.id);
  if (!found) return null;
  const { node, parent } = found;

  const insideAt = (containerEl: Element, containerNode: typeof node): CanvasDrop => {
    const horiz = isHorizontalFlow(containerEl);
    const kids = containerNode.children || [];
    let index = kids.length;
    for (let i = 0; i < kids.length; i++) {
      const kEl = elFor(kids[i].id);
      if (!kEl) continue;
      const r = kEl.getBoundingClientRect();
      if (horiz ? x < r.left + r.width / 2 && y < r.bottom : y < r.top + r.height / 2) { index = i; break; }
    }
    return { parentId: containerNode.id, index, box: containerEl };
  };

  if (!parent) return insideAt(el, node);
  const r = el.getBoundingClientRect();
  const horiz = isHorizontalFlow(el.parentElement);
  const f = horiz ? (x - r.left) / Math.max(r.width, 1) : (y - r.top) / Math.max(r.height, 1);
  const idx = parent.children!.indexOf(node);
  const edge = (before: boolean): CanvasDrop => ({ parentId: parent.id, index: before ? idx : idx + 1, line: { el, before, horiz } });
  if (isContainer(node) && node.type !== 'collectionlist') {
    if (f < 0.2) return edge(true);
    if (f > 0.8) return edge(false);
    return insideAt(el, node);
  }
  return edge(f < 0.5);
}

function showDrop(drop: CanvasDrop | null) {
  hideDrop();
  if (!drop || !canvasDoc) return;
  if (drop.box) { placeBox(canvasDoc.getElementById('__dropbox'), drop.box); return; }
  const line = canvasDoc.getElementById('__drop')!;
  const r = drop.line!.el.getBoundingClientRect();
  const s = line.style;
  s.display = 'block';
  if (drop.line!.horiz) Object.assign(s, { top: r.top + 'px', height: r.height + 'px', width: '2px', left: (drop.line!.before ? r.left - 1 : r.right - 1) + 'px' });
  else Object.assign(s, { left: r.left + 'px', width: r.width + 'px', height: '2px', top: (drop.line!.before ? r.top - 1 : r.bottom - 1) + 'px' });
}

function startEdit(el: HTMLElement, id: string, original: string) {
  const doc = canvasDoc!;
  select(id);
  editing = { el, id, original };
  el.draggable = false;
  el.contentEditable = 'true';
  el.focus();
  doc.getSelection()?.selectAllChildren(el);
  updateOverlays();
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); editing!.cancel = true; el.blur(); }
    e.stopPropagation();
  };
  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    doc.execCommand('insertText', false, e.clipboardData?.getData('text/plain') || '');
  };
  el.addEventListener('keydown', onKey);
  el.addEventListener('paste', onPaste);
  el.addEventListener('blur', () => {
    el.removeEventListener('keydown', onKey);
    el.removeEventListener('paste', onPaste);
    const ed = editing!;
    editing = null;
    el.contentEditable = 'false';
    const text = el.innerText.replace(/\n$/, '');
    if (!ed.cancel && text !== ed.original) setNodeText(ed.id, text);
    renderCanvas(true); // restores the original text after Esc
  }, { once: true });
}

/* ---- Rendering ---- */
let lastRender = '';

function renderCanvas(force = false) {
  const doc = canvasDoc;
  if (!doc || editing) return;
  const { project, ui } = getState();
  const page = currentPage(project, ui);
  const comp = ui.editingComponentId ? project.components[ui.editingComponentId] : null;
  const item = page.collectionId ? project.collections.find((c) => c.id === page.collectionId)?.items.find((i) => i.id === ui.cmsItemId) || null : null;
  const html = comp ? renderNode(comp.root, { p: project, editor: true }) : bodyHTML(project, page, item, true);
  const css = generateCSS(project, { editor: true });
  const key = `${css}\u0000${html}\u0000${page.root.classes.join(' ')}\u0000${page.root.id}\u0000${!!comp}`;
  if (!force && key === lastRender) return;
  lastRender = key;
  doc.getElementById('__user')!.textContent = css;
  const body = doc.body;
  body.className = page.root.classes.join(' ');
  if (comp) delete body.dataset.nid; else body.dataset.nid = page.root.id;
  body.innerHTML = html;
  if (!comp && !page.root.children!.length) body.classList.add('__empty');
  for (const id of OVERLAYS) {
    const ov = doc.createElement('div');
    ov.id = id;
    ov.className = '__ov';
    body.append(ov);
  }
  applyForcedState();
  updateOverlays();
}

/** Shows the selected element in the hover/pressed/focused state being styled. */
function applyForcedState() {
  const doc = canvasDoc;
  if (!doc) return;
  doc.querySelectorAll('.__force-hover, .__force-pressed, .__force-focused').forEach((e) => e.classList.remove('__force-hover', '__force-pressed', '__force-focused'));
  const { ui } = getState();
  if (ui.pstate !== 'none') elFor(ui.selectedId)?.classList.add(`__force-${ui.pstate}`);
}

function bindEvents(doc: Document, win: Window) {
  const nidOf = (t: EventTarget | null) => ((t as Element)?.closest?.('[data-nid]') as HTMLElement | null)?.dataset.nid || null;

  doc.addEventListener('mouseover', (e) => {
    if (dragState.current) return;
    const id = nidOf(e.target);
    if (id !== getState().hoverId) useStore.setState({ hoverId: id });
  });
  doc.addEventListener('mouseleave', () => useStore.setState({ hoverId: null }));
  doc.addEventListener('click', (e) => {
    if (editing && editing.el.contains(e.target as Node)) return;
    e.preventDefault();
    const { project, ui } = getState();
    select(nidOf(e.target) || currentRoot(project, ui).id);
  });
  doc.addEventListener('dblclick', (e) => {
    const el = (e.target as Element).closest?.('[data-nid]') as HTMLElement | null;
    if (!el) return;
    const { project, ui } = getState();
    const found = findNode(currentRoot(project, ui), el.dataset.nid!);
    if (!found) return;
    const n = found.node;
    if (n.type === 'symbol') { if (n.componentId && project.components[n.componentId]) editComponent(n.componentId); return; }
    if (n.bind?.text) { toast('This text comes from a CMS field. Edit it in the CMS panel.'); return; }
    if (n.text != null && !el.dataset.rep) { e.preventDefault(); startEdit(el, n.id, n.text); return; }
    if (n.type === 'image' && !n.bind?.src) {
      select(n.id);
      pickImage().then((src) => src && updateNode((x) => { x.attrs = { ...(x.attrs || {}), src }; }));
    }
  });
  doc.addEventListener('submit', (e) => e.preventDefault());
  doc.addEventListener('keydown', (e) => { if (!editing) onKeyDown(e); });
  win.addEventListener('scroll', updateOverlays, { passive: true });
  win.addEventListener('resize', updateOverlays);
  doc.addEventListener('load', updateOverlays, true); // images, fonts
  new (win as unknown as typeof globalThis).ResizeObserver(() => updateOverlays()).observe(doc.documentElement);

  let lastDrop: CanvasDrop | null = null;
  doc.addEventListener('dragstart', (e) => {
    const el = (e.target as Element).closest?.('[data-nid]') as HTMLElement | null;
    if (!el || editing || el === doc.body || el.dataset.rep) { e.preventDefault(); return; }
    const { project, ui } = getState();
    if (el.dataset.nid === currentRoot(project, ui).id) { e.preventDefault(); return; }
    dragState.current = { kind: 'move', id: el.dataset.nid! };
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', el.dataset.nid!);
    select(el.dataset.nid!);
  });
  doc.addEventListener('dragover', (e) => {
    const drag = dragState.current;
    if (!drag) return;
    const drop = computeDrop(e.target, e.clientX, e.clientY);
    if (!dropIsValid(drag, drop)) { hideDrop(); lastDrop = null; return; }
    e.preventDefault();
    e.dataTransfer!.dropEffect = drag.kind === 'move' ? 'move' : 'copy';
    lastDrop = drop;
    showDrop(drop);
  });
  doc.addEventListener('dragleave', (e) => { if (!e.relatedTarget) hideDrop(); });
  doc.addEventListener('drop', (e) => {
    e.preventDefault();
    hideDrop();
    const drag = dragState.current;
    const drop = computeDrop(e.target, e.clientX, e.clientY) || lastDrop;
    if (drag && drop) performDrop(drag, drop);
    dragState.current = null;
  });
  doc.addEventListener('dragend', endDrag);
}

export function Canvas() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const project = useStore((s) => s.project);
  const pageId = useStore((s) => s.ui.pageId);
  const compId = useStore((s) => s.ui.editingComponentId);
  const cmsItemId = useStore((s) => s.ui.cmsItemId);
  const selectedId = useStore((s) => s.ui.selectedId);
  const hoverId = useStore((s) => s.hoverId);
  const pstate = useStore((s) => s.ui.pstate);
  const bp = useStore((s) => s.ui.bp);

  useEffect(() => {
    const frame = frameRef.current!;
    frame.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <link rel="stylesheet" href="${GOOGLE_FONTS_URL}">
      <style>${BASE_CSS}${IX_KEYFRAMES}${EDITOR_CSS}</style><style id="__user"></style></head><body></body></html>`;
    const onLoad = () => {
      canvasDoc = frame.contentDocument;
      lastRender = '';
      bindEvents(canvasDoc!, frame.contentWindow!);
      setReady(true);
    };
    frame.addEventListener('load', onLoad, { once: true });
    return () => { frame.removeEventListener('load', onLoad); canvasDoc = null; };
  }, []);

  const scrollTarget = useStore((s) => s.scrollTarget);
  useLayoutEffect(() => { if (ready) renderCanvas(); }, [ready, project, pageId, compId, cmsItemId]);
  useEffect(() => {
    if (!ready || !scrollTarget) return;
    scrollToNode(scrollTarget);
    useStore.setState({ scrollTarget: null });
  }, [ready, scrollTarget, project]);
  useLayoutEffect(() => { if (ready) { applyForcedState(); updateOverlays(); } }, [ready, selectedId, hoverId, pstate]);
  useEffect(() => {
    const t = setTimeout(updateOverlays, 220); // after the width transition
    return () => clearTimeout(t);
  }, [bp]);

  // The canvas is at least as wide as its breakpoint (992px for desktop, so no media query
  // matches) and is scaled down to fit when the stage is narrower.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 1200, h: 800 });
  useEffect(() => {
    const el = scrollRef.current!;
    const ro = new ResizeObserver(() => setAvail({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const bpWidth = BREAKPOINTS[bp].width;
  const width = bpWidth || Math.max(avail.w, DESKTOP_MIN);
  const scale = Math.min(1, avail.w / width);
  useEffect(() => { useStore.setState({ canvasScale: scale }); }, [scale]);
  return (
    <div className="canvas-scroll" ref={scrollRef}>
      <div className={'canvas-wrap' + (bpWidth ? ' framed' : '')}
        style={{ width, height: avail.h / scale, transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: 'top center', flex: 'none' }}>
        <iframe ref={frameRef} title="Canvas" className="canvas-frame" />
      </div>
    </div>
  );
}
