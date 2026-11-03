/* Converts HTML + CSS (from Claude or pasted by a user) into Blockyard elements and classes.
 * Works with any DOM Document: the browser's (an inert one) or linkedom's on the server. */
import { reId, sanitizeClass, uid, uniqueClassName, variantKey, walkTree } from './model';
import type { BP, ClassStyles, Node, Project, PseudoState, StyleMap } from './types';

const MEDIA_TO_BP: [number, BP][] = [[479, 'mobile'], [767, 'landscape'], [991, 'tablet']];
const STATE_OF: Record<string, PseudoState> = { '': 'none', ':hover': 'hover', ':active': 'pressed', ':focus': 'focused' };

function parseDecls(body: string): StyleMap {
  const out: StyleMap = {};
  for (const part of body.split(/;(?![^(]*\))/)) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    const value = part.slice(i + 1).trim().replace(/\s*!important$/, '');
    if (prop && value && /^[a-z-]+$/.test(prop)) out[prop] = value;
  }
  return out;
}

/** Splits a stylesheet into class rules per breakpoint and state. Other selectors are ignored. */
export function parseCSS(css: string): Record<string, ClassStyles> {
  const out: Record<string, ClassStyles> = {};
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const addRules = (text: string, bp: BP) => {
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const decls = parseDecls(m[2]);
      for (const raw of m[1].split(',')) {
        const sel = raw.trim();
        const sm = sel.match(/^((?:\.[A-Za-z_][\w-]*)+)(:hover|:active|:focus)?$/);
        const key = sm ? sm[1].slice(1).split('.').map(sanitizeClass).join('.') : sel === 'body' ? 'body' : null;
        if (!key) continue;
        const vk = variantKey(bp, STATE_OF[sm?.[2] || '']);
        const cls = out[key] || (out[key] = {});
        cls[vk] = { ...(cls[vk] || {}), ...decls };
      }
    }
  };
  // Pull out @media blocks (one level of nesting), then the rest is desktop.
  let rest = '';
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf('@media', i);
    if (at < 0) { rest += css.slice(i); break; }
    rest += css.slice(i, at);
    const open = css.indexOf('{', at);
    if (open < 0) break;
    let depth = 1, j = open + 1;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const query = css.slice(at, open);
    const max = query.match(/max-width:\s*(\d+)px/);
    if (max) {
      const n = +max[1];
      const bp = MEDIA_TO_BP.find(([limit]) => n <= limit)?.[1];
      if (bp) addRules(css.slice(open + 1, j - 1), bp);
    }
    i = j;
  }
  addRules(rest, 'desktop');
  return out;
}

const SECTION_TAGS = new Set(['section', 'header', 'footer', 'nav', 'main', 'article', 'aside']);
const TEXT_ONLY = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'blockquote', 'span', 'label', 'small', 'strong', 'em']);
const SKIP = new Set(['script', 'style', 'link', 'meta', 'title', 'noscript']);
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function convert(el: Element, inline: Record<string, StyleMap>): Node | null {
  const tag = el.tagName.toLowerCase();
  if (SKIP.has(tag)) return null;
  const classes = (el.getAttribute('class') || '').split(/\s+/).map(sanitizeClass).filter(Boolean);
  const node = (type: string, t = tag): Node => ({ id: uid(), type, tag: t, classes: [...classes] });
  const style = el.getAttribute('style');
  const withStyle = (n: Node) => {
    if (style) inline[n.id] = parseDecls(style);
    return n;
  };
  const attr = (n: Node, ...keys: string[]) => {
    for (const k of keys) {
      const v = el.getAttribute(k);
      if (v != null) (n.attrs || (n.attrs = {}))[k] = v;
    }
    return n;
  };
  const hasElementKids = Array.from(el.children).some((c) => !SKIP.has(c.tagName.toLowerCase()));
  const text = clean(el.textContent || '');

  if (/^h[1-6]$/.test(tag)) return withStyle(attr({ ...node('heading'), text }, 'id'));
  if (tag === 'p') return withStyle(attr({ ...node('paragraph'), text }, 'id'));
  if (tag === 'blockquote') return withStyle({ ...node('quote'), text });
  if (tag === 'hr') return withStyle(node('divider'));
  if (tag === 'img') return withStyle(attr(node('image'), 'src', 'alt'));
  if (tag === 'iframe') return withStyle(attr(node('video'), 'src', 'title', 'allowfullscreen'));
  if (tag === 'input') return withStyle(attr(node('input'), 'type', 'name', 'placeholder', 'required'));
  if (tag === 'textarea') return withStyle(attr(node('textarea'), 'name', 'placeholder', 'rows'));
  if (tag === 'button') return withStyle(attr({ ...node('formbutton'), text }, 'type'));
  if (tag === 'li' && !hasElementKids) return withStyle({ ...node('listitem'), text });
  if (tag === 'a' && !hasElementKids) {
    const looksButton = classes.some((c) => /btn|button|cta/.test(c));
    return withStyle(attr({ ...node(looksButton ? 'button' : 'link'), text }, 'href', 'target'));
  }
  if (tag === 'svg' || tag === 'video' || tag === 'canvas' || tag === 'table' || tag === 'select') {
    return withStyle({ ...node('embed', 'div'), classes, html: el.outerHTML });
  }
  if (TEXT_ONLY.has(tag) && !hasElementKids) return withStyle({ ...node('textblock', tag === 'span' ? 'span' : 'div'), text });

  // Containers
  const type = tag === 'ul' || tag === 'ol' ? 'list' : tag === 'form' ? 'form' : SECTION_TAGS.has(tag) ? 'section' : 'div';
  const n = withStyle(attr(node(type, type === 'div' && tag !== 'a' ? 'div' : tag), 'id', ...(tag === 'a' ? ['href'] : []), ...(tag === 'form' ? ['action', 'method'] : [])));
  if (!hasElementKids && text) return { ...n, type: 'textblock', text };
  n.children = [];
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3) {
      const t = clean(child.textContent || '');
      if (t) n.children.push({ id: uid(), type: 'textblock', tag: 'div', classes: [], text: t });
    } else if (child.nodeType === 1) {
      const c = convert(child as Element, inline);
      if (c) n.children.push(c);
    }
  }
  return n;
}

/**
 * Turns HTML + CSS into nodes ready to insert into `p`, adding their classes to `p.classes`.
 * Classes that clash with existing ones (same name, different styles) are renamed.
 */
export function importMarkup(p: Project, doc: Document, html: string, css = ''): Node[] {
  const holder = doc.createElement('div');
  holder.innerHTML = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  const inline: Record<string, StyleMap> = {};
  const nodes: Node[] = [];
  for (const child of Array.from(holder.children)) {
    const n = convert(child, inline);
    if (n) nodes.push(n);
  }
  const rules = parseCSS(css);

  // Rename clashing classes.
  const rename: Record<string, string> = {};
  const allNames = new Set<string>();
  for (const key of Object.keys(rules)) key.split('.').forEach((c) => allNames.add(c));
  nodes.forEach((n) => walkTree(n, (x) => x.classes.forEach((c) => allNames.add(c))));
  allNames.delete('body');
  for (const name of allNames) {
    const existing = p.classes[name];
    if (!existing) continue;
    const incoming = rules[name];
    if (incoming && JSON.stringify(incoming) !== JSON.stringify(existing)) rename[name] = uniqueClassName(p, name);
  }
  const mapKey = (key: string) => key.split('.').map((c) => rename[c] || c).join('.');

  for (const [key, st] of Object.entries(rules)) {
    if (key === 'body') continue; // never let generated CSS restyle the whole site
    const k = mapKey(key);
    if (!p.classes[k]) p.classes[k] = {};
    for (const [vk, decls] of Object.entries(st)) p.classes[k][vk] = { ...(p.classes[k][vk] || {}), ...decls };
  }
  for (const n of nodes) walkTree(n, (x) => {
    x.classes = x.classes.map((c) => rename[c] || c);
    if (inline[x.id]) {
      if (!x.classes.length) x.classes = [uniqueClassName(p, x.type)];
      const k = x.classes.join('.');
      const cls = p.classes[k] || (p.classes[k] = {});
      cls.desktop = { ...(cls.desktop || {}), ...inline[x.id] };
    }
    for (let i = 1; i <= x.classes.length; i++) {
      const k = x.classes.slice(0, i).join('.');
      if (!p.classes[k]) p.classes[k] = {};
    }
  });
  return nodes.map(reId);
}
