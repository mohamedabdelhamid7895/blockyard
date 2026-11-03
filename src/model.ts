/* Blockyard data model helpers.
 *   project = { pages, classes, components, collections }
 *   node    = { id, type, tag, classes, text?, html?, attrs?, children?, componentId?, collectionId?, bind?, ix? }
 * Styles live on selectors (a class, or a base class plus combo classes) and cascade
 * desktop → tablet → landscape → mobile, exactly like the exported media queries.
 * Every function here works on plain objects and on immer drafts alike.
 */
import { BP_ORDER, ELEMENTS, type KidSpec } from './constants';
import type { BP, ClassStyles, Collection, Item, Node, Page, Project, PseudoState, StyleMap, UIState } from './types';

export const uid = () => 'n' + Math.random().toString(36).slice(2, 10);
export const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

export function sanitizeClass(s: string) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').replace(/^(\d)/, 'c-$1');
}
export function sanitizeSlug(s: string) {
  return String(s || '').trim().toLowerCase().replace(/\.html$/, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

/* ---- Selectors & styles ---- */
export const selectorKey = (classes: string[]) => classes.join('.');
export const variantKey = (bp: BP, state: PseudoState) => (state === 'none' ? bp : `${bp}:${state}`);

export function ensureClass(p: Project, key: string): ClassStyles {
  return p.classes[key] || (p.classes[key] = {});
}

export function uniqueClassName(p: Project, base: string) {
  base = sanitizeClass(base) || 'element';
  const taken = (n: string) => Object.keys(p.classes).some((k) => k.split('.')[0] === n || k === n);
  if (!taken(base)) return base;
  let i = 2;
  while (taken(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/**
 * Own and inherited styles for the selector chain at a breakpoint/state.
 * Inherited = everything that applies before the variant being edited: base classes,
 * larger breakpoints and (when editing a state) the stateless styles.
 */
export function cascade(p: Project, classes: string[], bp: BP, state: PseudoState) {
  const own: StyleMap = (classes.length && p.classes[selectorKey(classes)]?.[variantKey(bp, state)]) || {};
  const inherited: StyleMap = {};
  const bps = BP_ORDER.slice(0, BP_ORDER.indexOf(bp) + 1);
  for (let i = 1; i <= classes.length; i++) {
    const st = p.classes[selectorKey(classes.slice(0, i))] || {};
    for (const b of bps) {
      const last = i === classes.length && b === bp;
      if (!(last && state === 'none')) Object.assign(inherited, st[b]);
      if (state !== 'none' && !last) Object.assign(inherited, st[variantKey(b, state)]);
    }
  }
  return { own, inherited, effective: { ...inherited, ...own } };
}

/* ---- Tree helpers ---- */
export const isContainer = (n: Node | null | undefined): n is Node & { children: Node[] } =>
  !!n && Array.isArray(n.children) && n.html == null && n.type !== 'symbol';

export function findNode(root: Node, id: string, parent: Node | null = null): { node: Node; parent: Node | null } | null {
  if (root.id === id) return { node: root, parent };
  for (const c of root.children || []) {
    const r = findNode(c, id, root);
    if (r) return r;
  }
  return null;
}

export function pathTo(root: Node, id: string): Node[] {
  const out: Node[] = [];
  const walk = (n: Node): boolean => {
    out.push(n);
    if (n.id === id) return true;
    for (const c of n.children || []) if (walk(c)) return true;
    out.pop();
    return false;
  };
  walk(root);
  return out;
}

export const contains = (ancestor: Node, id: string): boolean =>
  ancestor.id === id || (ancestor.children || []).some((c) => contains(c, id));

export function reId(node: Node): Node {
  node.id = uid();
  (node.children || []).forEach(reId);
  (node.ix || []).forEach((x) => (x.id = uid()));
  return node;
}

export function walkTree(n: Node, fn: (n: Node) => void) {
  fn(n);
  (n.children || []).forEach((c) => walkTree(c, fn));
}
export function walkAll(p: Project, fn: (n: Node) => void) {
  p.pages.forEach((pg) => walkTree(pg.root, fn));
  Object.values(p.components).forEach((c) => walkTree(c.root, fn));
}

export function selectorUsage(p: Project, key: string) {
  let n = 0;
  walkAll(p, (node) => { if (selectorKey(node.classes) === key) n++; });
  return n;
}

export function currentPage(p: Project, ui: Pick<UIState, 'pageId'>): Page {
  return p.pages.find((pg) => pg.id === ui.pageId) || p.pages[0];
}
/** The tree being edited: a component's root while editing a component, otherwise the page body. */
export function currentRoot(p: Project, ui: Pick<UIState, 'pageId' | 'editingComponentId'>): Node {
  const comp = ui.editingComponentId ? p.components[ui.editingComponentId] : null;
  return comp ? comp.root : currentPage(p, ui).root;
}

export function nodeLabel(n: Node, p?: Project) {
  if (n.type === 'symbol') return p?.components[n.componentId || '']?.name || 'Missing component';
  return ELEMENTS[n.type]?.label || n.type;
}

/* ---- Creating elements ---- */
export function make(p: Project, type: string, spec: Exclude<KidSpec, string> | null = null): Node {
  const def = ELEMENTS[type];
  const cls = uniqueClassName(p, def.cls || type);
  const st: ClassStyles = {};
  if (def.style) st.desktop = { ...def.style };
  if (def.tablet) st.tablet = { ...def.tablet };
  if (def.mobile) st.mobile = { ...def.mobile };
  p.classes[cls] = st;
  const node: Node = { id: uid(), type, tag: spec?.tag || def.tag, classes: [cls] };
  if (def.text != null) node.text = def.text;
  if (def.html != null) node.html = def.html;
  if (def.attrs) node.attrs = { ...def.attrs };
  if (spec?.bind) node.bind = { ...spec.bind };
  if (def.container) node.children = (def.kids || []).map((k) => (typeof k === 'string' ? make(p, k) : make(p, k.type, k)));
  if (type === 'collectionlist') node.collectionId = p.collections[0]?.id;
  return node;
}

/* ---- CMS ---- */
export const itemPageFile = (c: Collection, item: Item) => `${c.slug}-${item.data.slug}.html`;
export const templatePageFor = (p: Project, collectionId: string) => p.pages.find((pg) => pg.collectionId === collectionId);

/** The collection whose fields an element can bind to: from a parent Collection List or a template page. */
export function bindingCollection(p: Project, ui: Pick<UIState, 'pageId' | 'editingComponentId'>, id: string): Collection | null {
  const path = pathTo(currentRoot(p, ui), id);
  for (let i = path.length - 2; i >= 0; i--) {
    if (path[i].type === 'collectionlist') return p.collections.find((c) => c.id === path[i].collectionId) || null;
  }
  const page = currentPage(p, ui);
  if (!ui.editingComponentId && page.collectionId) return p.collections.find((c) => c.id === page.collectionId) || null;
  return null;
}

export function uniquePageSlug(p: Project, base: string) {
  base = sanitizeSlug(base) || 'page';
  let s = base, i = 2;
  while (p.pages.some((pg) => pg.slug === s)) s = `${base}-${i++}`;
  return s;
}

export const bodyNode = (): Node => ({ id: uid(), type: 'body', tag: 'body', classes: ['body'], children: [] });

/* ---- Loading & migrating ---- */
type LegacyNode = Omit<Node, 'classes' | 'children'> & { cls?: string; classes?: string[]; children?: LegacyNode[] };

/** Accepts a v2 project or a v1 (single-class, 3 breakpoints) project and returns a v2 project, or null. */
export function migrate(raw: unknown): Project | null {
  const p = raw as Record<string, unknown> | null;
  if (!p || !Array.isArray(p.pages) || !p.pages.length || typeof p.classes !== 'object') return null;
  if (p.version === 2) {
    const v2 = p as unknown as Project;
    v2.components = v2.components || {};
    v2.collections = v2.collections || [];
    return v2;
  }
  const fix = (n: LegacyNode): Node => {
    const { cls, ...rest } = n;
    return { ...rest, classes: n.classes || (cls ? [cls] : []), children: n.children?.map(fix) } as Node;
  };
  return {
    version: 2,
    pages: (p.pages as (Omit<Page, 'root'> & { root: LegacyNode })[]).map((pg) => ({ ...pg, root: fix(pg.root) })),
    classes: p.classes as Record<string, ClassStyles>,
    components: {},
    collections: [],
  };
}
