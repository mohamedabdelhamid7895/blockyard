/* Editor actions. Each one records a single undo step. */
import {
  bodyNode, clone, contains, currentRoot, ensureClass, findNode, isContainer, make, nodeLabel, reId,
  sanitizeClass, sanitizeSlug, selectorKey, selectorUsage, uid, uniqueClassName, uniquePageSlug, variantKey, walkAll, walkTree,
} from './model';
import { getState, live, mutate, persistNow, setUI, toast, useStore } from './store';
import { buildSections, PAGE_TEMPLATES } from './templates';
import type { Collection, Field, FieldType, Interaction, Node, Project, UIState } from './types';

const sel = () => {
  const { project, ui } = getState();
  return ui.selectedId ? findNode(currentRoot(project, ui), ui.selectedId) : null;
};
/** Inside `mutate`: the selected node and its parent on the draft. */
const draftSel = (p: Project, ui: UIState) => (ui.selectedId ? findNode(currentRoot(p, ui), ui.selectedId) : null);

/* ---- Selection ---- */
export function select(id: string | null) {
  setUI({ selectedId: id, pstate: 'none' });
}
export function selectParent() {
  const s = sel();
  if (s?.parent) select(s.parent.id);
}

/* ---- Inserting ---- */
/** Where a click-to-add lands: inside the selected container, or after the selected element. */
function insertionPoint(p: Project, ui: UIState): { parent: Node; index: number } {
  const root = currentRoot(p, ui);
  const s = draftSel(p, ui);
  if (!s) return { parent: root, index: root.children!.length };
  if (isContainer(s.node) && s.node.type !== 'collectionlist') return { parent: s.node, index: s.node.children.length };
  if (!s.parent) return { parent: root, index: root.children!.length };
  return { parent: s.parent, index: s.parent.children!.indexOf(s.node) + 1 };
}

const scrollToSelection = () => useStore.setState({ scrollTarget: getState().ui.selectedId });

export function addElement(type: string) {
  mutate((p, ui) => {
    const node = make(p, type);
    const { parent, index } = insertionPoint(p, ui);
    parent.children!.splice(index, 0, node);
    ui.selectedId = node.id;
  });
  scrollToSelection();
}

export function insertComponent(componentId: string) {
  if (getState().ui.editingComponentId === componentId) { toast("A component can't contain itself"); return; }
  mutate((p, u) => {
    const node: Node = { id: uid(), type: 'symbol', tag: 'div', classes: [], componentId };
    const { parent, index } = insertionPoint(p, u);
    parent.children!.splice(index, 0, node);
    u.selectedId = node.id;
  });
  scrollToSelection();
}

export function insertSection(templateId: string) {
  mutate((p, ui) => {
    const nodes = buildSections(p, [templateId]);
    const root = currentRoot(p, ui);
    // Sections go into the body: after the top-level ancestor of the selection, or at the end (above a footer).
    const isFooter = (n: Node) => (n.type === 'symbol' ? p.components[n.componentId || '']?.root.tag : n.tag) === 'footer';
    let index = root.children!.length;
    while (index > 0 && isFooter(root.children![index - 1])) index--;
    if (ui.selectedId && ui.selectedId !== root.id) {
      const top = root.children!.findIndex((c) => contains(c, ui.selectedId!));
      if (top >= 0) index = top + 1;
    }
    root.children!.splice(index, 0, ...nodes);
    ui.selectedId = nodes[0].id;
  });
  scrollToSelection();
}

export type DragSource = { kind: 'new'; type: string } | { kind: 'move'; id: string } | { kind: 'component'; componentId: string };
export interface Drop { parentId: string; index: number }

export function dropIsValid(drag: DragSource | null, drop: Drop | null) {
  if (!drag || !drop) return false;
  const { project, ui } = getState();
  const root = currentRoot(project, ui);
  const target = findNode(root, drop.parentId);
  if (!target || !isContainer(target.node)) return false;
  if (target.node.type === 'collectionlist') return false; // the list holds exactly one item template
  if (drag.kind === 'move') {
    const moving = findNode(root, drag.id);
    if (!moving || contains(moving.node, drop.parentId)) return false;
  }
  if (drag.kind === 'component' && ui.editingComponentId === drag.componentId) return false;
  return true;
}

export function performDrop(drag: DragSource, drop: Drop) {
  if (!dropIsValid(drag, drop)) return;
  mutate((p, ui) => {
    const root = currentRoot(p, ui);
    let node: Node;
    let index = drop.index;
    if (drag.kind === 'new') node = make(p, drag.type);
    else if (drag.kind === 'component') node = { id: uid(), type: 'symbol', tag: 'div', classes: [], componentId: drag.componentId };
    else {
      const r = findNode(root, drag.id)!;
      const oldIdx = r.parent!.children!.indexOf(r.node);
      r.parent!.children!.splice(oldIdx, 1);
      if (r.parent!.id === drop.parentId && oldIdx < index) index--;
      node = r.node;
    }
    findNode(root, drop.parentId)!.node.children!.splice(index, 0, node);
    ui.selectedId = node.id;
  });
}

/* ---- Structure ---- */
const isFixedChild = (n: Node, parent: Node | null) => n.type === 'collectionitem' || !parent;

export function deleteSelected() {
  const s = sel();
  if (!s || isFixedChild(s.node, s.parent)) return;
  mutate((p, ui) => {
    const d = draftSel(p, ui)!;
    const kids = d.parent!.children!;
    const i = kids.indexOf(d.node);
    kids.splice(i, 1);
    ui.selectedId = (kids[i] || kids[i - 1] || d.parent!).id;
  });
}

export function duplicateSelected() {
  const s = sel();
  if (!s || isFixedChild(s.node, s.parent)) return;
  mutate((p, ui) => {
    const d = draftSel(p, ui)!;
    const copy = reId(clone(d.node));
    d.parent!.children!.splice(d.parent!.children!.indexOf(d.node) + 1, 0, copy);
    ui.selectedId = copy.id;
  });
}

export function copySelected() {
  const s = sel();
  if (!s || isFixedChild(s.node, s.parent)) return;
  useStore.setState({ clipboard: clone(s.node) });
  toast(`Copied ${nodeLabel(s.node, getState().project)}`);
}

export function paste() {
  const { clipboard } = getState();
  if (!clipboard) return;
  mutate((p, ui) => {
    const copy = reId(clone(clipboard));
    walkTree(copy, (n) => { if (n.classes.length) ensureClass(p, selectorKey(n.classes)); });
    const root = currentRoot(p, ui);
    const d = draftSel(p, ui);
    if (!d) root.children!.push(copy);
    else if (!d.parent || (isContainer(d.node) && !d.node.children.length && d.node.type !== 'collectionlist')) d.node.children!.push(copy);
    else d.parent.children!.splice(d.parent.children!.indexOf(d.node) + 1, 0, copy);
    ui.selectedId = copy.id;
  });
}

export function wrapSelected() {
  const s = sel();
  if (!s || isFixedChild(s.node, s.parent)) return;
  mutate((p, ui) => {
    const d = draftSel(p, ui)!;
    const wrapper = make(p, 'div');
    const i = d.parent!.children!.indexOf(d.node);
    d.parent!.children!.splice(i, 1, wrapper);
    wrapper.children!.push(d.node);
    ui.selectedId = wrapper.id;
  });
}

export function moveSelected(dir: -1 | 1) {
  const s = sel();
  if (!s || !s.parent) return;
  const kids = s.parent.children!;
  const i = kids.indexOf(s.node), j = i + dir;
  if (j < 0 || j >= kids.length) return;
  mutate((p, ui) => {
    const k = draftSel(p, ui)!.parent!.children!;
    [k[i], k[j]] = [k[j], k[i]];
  });
}

export function updateNode(fn: (n: Node) => void) {
  if (!sel()) return;
  mutate((p, ui) => fn(draftSel(p, ui)!.node));
}

export function setNodeText(id: string, text: string) {
  mutate((p, ui) => {
    const f = findNode(currentRoot(p, ui), id);
    if (f) f.node.text = text;
  });
}

/* ---- Styles ---- */
function styleTarget(p: Project, ui: UIState) {
  const d = draftSel(p, ui);
  if (!d || !d.node.classes.length) return null;
  return ensureClass(p, selectorKey(d.node.classes));
}

/** Sets (or with '' removes) a style on the selected element's selector at the current breakpoint and state. */
export function setStyle(prop: string, value: string) {
  const s = sel();
  if (!s) return;
  if (!s.node.classes.length) { toast('Add a class to style this element'); return; }
  value = String(value ?? '').trim();
  mutate((p, ui) => {
    const cls = styleTarget(p, ui)!;
    const vk = variantKey(ui.bp, ui.pstate);
    const st = cls[vk] || (cls[vk] = {});
    if (value === '') delete st[prop]; else st[prop] = value;
    if (!Object.keys(st).length) delete cls[vk];
  });
}

/** Shows a style immediately without an undo step (color picker drags); commit with setStyle. */
export function liveStyle(prop: string, value: string) {
  const { ui } = getState();
  if (!sel()?.node.classes.length) return;
  live((p) => {
    const cls = styleTarget(p, ui)!;
    const vk = variantKey(ui.bp, ui.pstate);
    (cls[vk] || (cls[vk] = {}))[prop] = value;
  });
}

/* ---- Classes ---- */
/** Adds a class: the first one becomes the base class, later ones are combo classes. */
export function addClass(raw: string) {
  const s = sel();
  if (!s || s.node.type === 'body' || s.node.type === 'symbol') return;
  const name = sanitizeClass(raw);
  if (!name) return;
  if (s.node.classes.includes(name)) { toast(`“${name}” is already applied`); return; }
  mutate((p, ui) => {
    const n = draftSel(p, ui)!.node;
    n.classes.push(name);
    ensureClass(p, name);
    ensureClass(p, selectorKey(n.classes));
  });
}

export function removeClass(index: number) {
  const s = sel();
  if (!s || s.node.type === 'body') return;
  mutate((p, ui) => {
    const n = draftSel(p, ui)!.node;
    // Removing the base class removes its combo classes too, as in Webflow.
    n.classes = index === 0 ? [] : n.classes.filter((_, i) => i !== index);
  });
}

/** Gives the selected element a copy of its current selector under a new class name, so it can be styled on its own. */
export function duplicateClass() {
  const s = sel();
  if (!s || !s.node.classes.length || s.node.type === 'body') return;
  mutate((p, ui) => {
    const n = draftSel(p, ui)!.node;
    const name = uniqueClassName(p, n.classes[n.classes.length - 1]);
    const merged: Record<string, Record<string, string>> = {};
    for (let i = 1; i <= n.classes.length; i++) {
      for (const [vk, st] of Object.entries(p.classes[selectorKey(n.classes.slice(0, i))] || {})) {
        merged[vk] = { ...(merged[vk] || {}), ...st };
      }
    }
    p.classes[name] = merged;
    n.classes = [name];
  });
  toast('Class duplicated — this element now has its own styles');
}

export function renameClass(oldName: string) {
  const name = sanitizeClass(prompt(`Rename class “${oldName}” everywhere it's used:`, oldName) || '');
  if (!name || name === oldName) return;
  const { project } = getState();
  if (Object.keys(project.classes).some((k) => k.split('.').includes(name))) { toast(`A class named “${name}” already exists`); return; }
  mutate((p) => {
    for (const key of Object.keys(p.classes)) {
      const parts = key.split('.');
      if (!parts.includes(oldName)) continue;
      const nk = parts.map((c) => (c === oldName ? name : c)).join('.');
      p.classes[nk] = p.classes[key];
      delete p.classes[key];
    }
    walkAll(p, (n) => { n.classes = n.classes.map((c) => (c === oldName ? name : c)); });
  });
}

export function cleanupClasses() {
  const { project } = getState();
  const unused = Object.keys(project.classes).filter((k) => k !== 'body' && selectorUsage(project, k) === 0);
  if (!unused.length) { toast('No unused classes'); return; }
  mutate((p) => unused.forEach((k) => delete p.classes[k]));
  toast(`Removed ${unused.length} unused class${unused.length > 1 ? 'es' : ''}`);
}

/* ---- Pages ---- */
export function openPage(id: string) {
  setUI({ pageId: id, selectedId: null, editingComponentId: null, cmsItemId: null });
}

export function addPage(templateId = 'blank') {
  const tpl = PAGE_TEMPLATES.find((t) => t.id === templateId)!;
  const name = prompt('Page name:', tpl.id === 'blank' ? `Page ${getState().project.pages.length + 1}` : tpl.name);
  if (!name) return;
  mutate((p, ui) => {
    const root = bodyNode();
    if (!p.classes.body) p.classes.body = {};
    root.children = buildSections(p, tpl.sections);
    const page = { id: uid(), name, slug: uniquePageSlug(p, name), title: name, description: '', root };
    p.pages.push(page);
    Object.assign(ui, { pageId: page.id, selectedId: null, editingComponentId: null });
  });
}

export function duplicatePage(id: string) {
  mutate((p, ui) => {
    const src = p.pages.find((x) => x.id === id)!;
    const page = clone(src);
    page.id = uid();
    page.name = src.name + ' copy';
    page.slug = uniquePageSlug(p, src.slug + '-copy');
    reId(page.root);
    p.pages.splice(p.pages.indexOf(src) + 1, 0, page);
    Object.assign(ui, { pageId: page.id, selectedId: null, editingComponentId: null });
  });
}

export function deletePage(id: string) {
  const { project } = getState();
  const pg = project.pages.find((x) => x.id === id);
  if (!pg || project.pages.filter((x) => !x.collectionId).length < 2 && !pg.collectionId) return;
  if (!confirm(`Delete page “${pg.name}”? You can undo this.`)) return;
  mutate((p) => {
    p.pages = p.pages.filter((x) => x.id !== id);
    if (!p.pages.some((x) => x.slug === 'index')) {
      const first = p.pages.find((x) => !x.collectionId);
      if (first) first.slug = 'index';
    }
  });
}

export function updatePage(id: string, patch: Partial<{ name: string; slug: string; title: string; description: string }>) {
  mutate((p) => {
    const pg = p.pages.find((x) => x.id === id)!;
    if (patch.slug != null) {
      if (pg.slug === 'index') { toast('The home page slug is always “index”'); delete patch.slug; }
      else patch.slug = uniquePageSlug({ ...p, pages: p.pages.filter((x) => x.id !== id) } as Project, patch.slug || pg.name);
    }
    Object.assign(pg, patch);
  });
}

/* ---- Components ---- */
export function createComponent() {
  const s = sel();
  if (!s || !s.parent || s.node.type === 'body' || s.node.type === 'collectionitem') return;
  if (s.node.type === 'symbol') { toast('This is already a component'); return; }
  let hasCms = false;
  walkTree(s.node, (n) => { if (n.type === 'collectionlist' || n.bind) hasCms = true; });
  if (hasCms) { toast("Elements with CMS bindings can't become components"); return; }
  const name = prompt('Component name:', nodeLabel(s.node));
  if (!name) return;
  mutate((p, ui) => {
    const d = draftSel(p, ui)!;
    const comp = { id: uid(), name, root: d.node };
    p.components[comp.id] = comp;
    const inst: Node = { id: uid(), type: 'symbol', tag: 'div', classes: [], componentId: comp.id };
    d.parent!.children!.splice(d.parent!.children!.indexOf(d.node), 1, inst);
    ui.selectedId = inst.id;
  });
  toast(`Created component “${name}”`);
}

export function editComponent(id: string) {
  setUI({ editingComponentId: id, selectedId: getState().project.components[id]?.root.id || null });
}
export function exitComponent() {
  setUI({ editingComponentId: null, selectedId: null });
}

export function detachInstance() {
  const s = sel();
  if (!s || s.node.type !== 'symbol') return;
  mutate((p, ui) => {
    const d = draftSel(p, ui)!;
    const comp = p.components[d.node.componentId!];
    if (!comp) return;
    const copy = reId(clone(comp.root));
    d.parent!.children!.splice(d.parent!.children!.indexOf(d.node), 1, copy);
    ui.selectedId = copy.id;
  });
}

export function renameComponent(id: string) {
  const comp = getState().project.components[id];
  const name = prompt('Component name:', comp?.name);
  if (!name) return;
  mutate((p) => { p.components[id].name = name; });
}

/** Deletes a component; its instances become ordinary (detached) elements. */
export function deleteComponent(id: string) {
  const { project } = getState();
  let count = 0;
  walkAll(project, (n) => { if (n.type === 'symbol' && n.componentId === id) count++; });
  if (!confirm(`Delete component “${project.components[id].name}”?${count ? ` Its ${count} instance${count > 1 ? 's' : ''} will be detached.` : ''}`)) return;
  mutate((p, ui) => {
    const comp = p.components[id];
    const detach = (n: Node) => {
      n.children = n.children?.map((c) => (c.type === 'symbol' && c.componentId === id ? reId(clone(comp.root)) : c));
      n.children?.forEach(detach);
    };
    p.pages.forEach((pg) => detach(pg.root));
    Object.values(p.components).forEach((c) => c.id !== id && detach(c.root));
    delete p.components[id];
    if (ui.editingComponentId === id) { ui.editingComponentId = null; ui.selectedId = null; }
  });
}

/* ---- CMS ---- */
const slugField = (name: string): Field => ({ id: uid(), name, slug: sanitizeSlug(name), type: 'plaintext' });

export function addCollection(name: string) {
  let id = '';
  mutate((p) => {
    const base = sanitizeSlug(name) || 'collection';
    let slug = base, i = 2;
    while (p.collections.some((c) => c.slug === slug)) slug = `${base}-${i++}`;
    const c: Collection = { id: uid(), name, slug, fields: [slugField('Name'), slugField('Slug')], items: [] };
    id = c.id;
    p.collections.push(c);
  });
  return id;
}

export function updateCollection(id: string, patch: Partial<Pick<Collection, 'name' | 'slug'>>) {
  mutate((p) => {
    const c = p.collections.find((x) => x.id === id)!;
    if (patch.slug != null) patch.slug = sanitizeSlug(patch.slug) || c.slug;
    Object.assign(c, patch);
  });
}

export function deleteCollection(id: string) {
  const c = getState().project.collections.find((x) => x.id === id);
  if (!c || !confirm(`Delete the “${c.name}” collection, its ${c.items.length} items and its template page? You can undo this.`)) return;
  mutate((p) => {
    p.collections = p.collections.filter((x) => x.id !== id);
    p.pages = p.pages.filter((pg) => pg.collectionId !== id);
    walkAll(p, (n) => { if (n.collectionId === id) delete n.collectionId; });
  });
}

export function addField(collectionId: string, name: string, type: FieldType) {
  mutate((p) => {
    const c = p.collections.find((x) => x.id === collectionId)!;
    const base = sanitizeSlug(name) || 'field';
    let slug = base, i = 2;
    while (c.fields.some((f) => f.slug === slug) || slug === '__url') slug = `${base}-${i++}`;
    c.fields.push({ id: uid(), name, slug, type });
  });
}

export function removeField(collectionId: string, fieldId: string) {
  mutate((p) => {
    const c = p.collections.find((x) => x.id === collectionId)!;
    const f = c.fields.find((x) => x.id === fieldId);
    if (!f || f.slug === 'name' || f.slug === 'slug') return;
    c.fields = c.fields.filter((x) => x.id !== fieldId);
    c.items.forEach((it) => delete it.data[f.slug]);
  });
}

export function addItem(collectionId: string) {
  let id = '';
  mutate((p) => {
    const c = p.collections.find((x) => x.id === collectionId)!;
    const n = c.items.length + 1;
    let slug = `item-${n}`, i = n;
    while (c.items.some((it) => it.data.slug === slug)) slug = `item-${++i}`;
    const item = { id: uid(), data: { name: `New item ${n}`, slug } };
    id = item.id;
    c.items.push(item);
  });
  return id;
}

export function updateItem(collectionId: string, itemId: string, field: string, value: string) {
  mutate((p) => {
    const c = p.collections.find((x) => x.id === collectionId)!;
    const it = c.items.find((x) => x.id === itemId)!;
    if (field === 'slug') {
      value = sanitizeSlug(value) || it.data.slug;
      if (c.items.some((x) => x.id !== itemId && x.data.slug === value)) { toast('Another item already uses that slug'); return; }
    }
    it.data[field] = value;
  });
}

export function deleteItem(collectionId: string, itemId: string) {
  mutate((p) => {
    const c = p.collections.find((x) => x.id === collectionId)!;
    c.items = c.items.filter((x) => x.id !== itemId);
  });
}

/** Creates the collection's template page (one exported page per item), or opens it if it exists. */
export function openTemplatePage(collectionId: string) {
  const { project } = getState();
  const existing = project.pages.find((pg) => pg.collectionId === collectionId);
  if (existing) { openPage(existing.id); return; }
  mutate((p, ui) => {
    const c = p.collections.find((x) => x.id === collectionId)!;
    const root = bodyNode();
    const heading = make(p, 'heading');
    heading.tag = 'h1';
    heading.bind = { text: 'name' };
    const container = make(p, 'container');
    container.children = [heading];
    const section = make(p, 'section');
    section.children = [container];
    root.children = [section];
    const page = { id: uid(), name: `${c.name} Template`, slug: uniquePageSlug(p, `${c.slug}-template`), title: c.name, description: '', root, collectionId };
    p.pages.push(page);
    Object.assign(ui, { pageId: page.id, selectedId: null, editingComponentId: null, cmsItemId: c.items[0]?.id || null });
  });
}

/* ---- Interactions ---- */
export function addInteraction(x: Interaction) {
  updateNode((n) => { n.ix = [...(n.ix || []), x]; });
}
export function updateInteraction(id: string, patch: Partial<Interaction>) {
  updateNode((n) => { const x = n.ix?.find((i) => i.id === id); if (x) Object.assign(x, patch); });
}
export function removeInteraction(id: string) {
  updateNode((n) => { n.ix = n.ix?.filter((i) => i.id !== id); if (!n.ix?.length) delete n.ix; });
}

/* ---- Project ---- */
export function replaceProject(p: Project, msg?: string) {
  mutate((d, ui) => {
    Object.assign(d, p);
    Object.assign(ui, { pageId: p.pages[0].id, selectedId: null, editingComponentId: null, cmsItemId: null });
  });
  if (msg) toast(msg);
}

export function saveNow() {
  persistNow();
  toast('Saved');
}
