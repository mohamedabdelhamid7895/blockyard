/* Blockyard — a visual website builder.
 * Data model:
 *   project = { pages: [{id, name, slug, title, description, root}], classes: { name: {desktop:{}, tablet:{}, mobile:{}} } }
 *   node    = { id, type, tag, cls, text?, html?, attrs?, children? }
 * Styles live on classes (shared by every element that uses the class) and cascade
 * desktop → tablet → mobile, exactly like the exported media queries.
 */
'use strict';

/* ======================================================================
 * Constants
 * ==================================================================== */
const STORAGE_KEY = 'blockyard.project.v1';

const BREAKPOINTS = {
  desktop: { label: 'Desktop', width: null, media: null },
  tablet:  { label: 'Tablet',  width: 768,  media: '(max-width: 991px)' },
  mobile:  { label: 'Mobile',  width: 375,  media: '(max-width: 479px)' },
};
const BP_ORDER = ['desktop', 'tablet', 'mobile'];

const PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e0e7ff"/><stop offset="1" stop-color="#c4b5fd"/></linearGradient></defs>' +
  '<rect width="1200" height="675" fill="url(#g)"/><g fill="#6366f1" opacity=".55"><circle cx="470" cy="260" r="52"/>' +
  '<path d="M330 500l170-190 110 120 80-80 180 150z"/></g></svg>');

const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;700&family=Poppins:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;700&family=Playfair+Display:wght@400;700&display=swap';
const GOOGLE_FONT_NAMES = ['Inter', 'DM Sans', 'Poppins', 'Space Grotesk', 'Playfair Display'];

const BASE_CSS = `*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1b1f; line-height: 1.5; }
img { max-width: 100%; vertical-align: middle; }
`;

const EDITOR_CSS = `
body { min-height: 100vh; }
[data-nid] { cursor: default; }
iframe[data-nid] { pointer-events: none; }
.__empty { min-height: 72px; outline: 1px dashed #a5b4fc; outline-offset: -4px;
  background-image: repeating-linear-gradient(45deg, rgba(99,102,241,.05) 0 10px, transparent 10px 20px); }
[contenteditable="true"] { outline: 2px solid #f59e0b !important; outline-offset: 2px; cursor: text; }
.__ov { position: fixed; pointer-events: none; z-index: 2147483646; display: none; box-sizing: border-box; }
#__hover { border: 1px solid #818cf8; }
#__sel { border: 2px solid #4f46e5; }
#__lbl { background: #4f46e5; color: #fff; font: 600 11px/1 system-ui, sans-serif; padding: 4px 7px; border-radius: 3px; white-space: nowrap; }
#__drop { background: #22c55e; border-radius: 2px; }
#__dropbox { border: 2px solid #22c55e; background: rgba(34,197,94,.08); }
`;

const TEXT_TYPES = new Set(['heading', 'paragraph', 'link', 'button', 'listitem', 'formbutton', 'textblock', 'quote']);
const VOID_TAGS = new Set(['img', 'input', 'hr', 'br']);
const BLOCK_TAGS = ['div', 'section', 'header', 'footer', 'nav', 'main', 'article', 'aside'];

/* Element library. `style` = default class styles created with a new element. */
const ELEMENTS = {
  body:      { label: 'Body', icon: '⬚', tag: 'body', container: true, hidden: true },
  section:   { label: 'Section', icon: '▭', tag: 'section', container: true, group: 'Layout', tags: BLOCK_TAGS,
               style: { 'padding-top': '80px', 'padding-bottom': '80px' } },
  container: { label: 'Container', icon: '▣', tag: 'div', container: true, group: 'Layout', tags: BLOCK_TAGS,
               style: { 'max-width': '1140px', 'margin-left': 'auto', 'margin-right': 'auto', 'padding-left': '24px', 'padding-right': '24px' } },
  div:       { label: 'Div Block', icon: '□', tag: 'div', container: true, group: 'Layout', tags: BLOCK_TAGS, cls: 'div-block' },
  flex:      { label: 'Flex Row', icon: '⇹', tag: 'div', container: true, group: 'Layout', tags: BLOCK_TAGS, cls: 'flex-row',
               style: { display: 'flex', gap: '20px', 'align-items': 'center' } },
  grid:      { label: 'Grid', icon: '⊞', tag: 'div', container: true, group: 'Layout', tags: BLOCK_TAGS,
               style: { display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '20px' },
               children: () => [make('div'), make('div')] },
  columns:   { label: '3 Columns', icon: '⫼', tag: 'div', container: true, group: 'Layout', tags: BLOCK_TAGS,
               style: { display: 'grid', 'grid-template-columns': '1fr 1fr 1fr', gap: '24px' },
               mobile: { 'grid-template-columns': '1fr' },
               children: () => [make('div'), make('div'), make('div')] },
  heading:   { label: 'Heading', icon: 'H', tag: 'h2', text: 'Heading', group: 'Basic', tags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
               style: { 'margin-top': '0px', 'margin-bottom': '16px' } },
  paragraph: { label: 'Paragraph', icon: '¶', tag: 'p', group: 'Basic', tags: ['p', 'div', 'span'],
               text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse varius enim in eros elementum tristique.',
               style: { 'margin-top': '0px', 'margin-bottom': '16px' } },
  link:      { label: 'Text Link', icon: '↗', tag: 'a', text: 'Text link', attrs: { href: '#' }, group: 'Basic', cls: 'text-link',
               style: { color: '#4f46e5' } },
  button:    { label: 'Button', icon: '⬭', tag: 'a', text: 'Button', attrs: { href: '#' }, group: 'Basic',
               style: { display: 'inline-block', 'padding-top': '12px', 'padding-bottom': '12px', 'padding-left': '22px', 'padding-right': '22px',
                        'background-color': '#4f46e5', color: '#ffffff', 'border-radius': '8px', 'text-decoration': 'none', 'font-weight': '600' } },
  quote:     { label: 'Quote', icon: '❝', tag: 'blockquote', text: 'Design is not just what it looks like — design is how it works.', group: 'Basic', cls: 'block-quote',
               style: { 'margin-top': '0px', 'margin-bottom': '16px', 'margin-left': '0px', 'margin-right': '0px', 'padding-left': '20px',
                        'border-left-width': '4px', 'border-left-style': 'solid', 'border-left-color': '#4f46e5', 'font-size': '20px' } },
  list:      { label: 'List', icon: '☰', tag: 'ul', container: true, group: 'Basic', tags: ['ul', 'ol'],
               children: () => [make('listitem'), make('listitem'), make('listitem')] },
  listitem:  { label: 'List Item', icon: '•', tag: 'li', text: 'List item', hidden: true, cls: 'list-item' },
  divider:   { label: 'Divider', icon: '—', tag: 'hr', group: 'Basic',
               style: { 'border-style': 'solid', 'border-width': '0px', 'border-top-width': '1px', 'border-color': '#e5e7eb', 'margin-top': '24px', 'margin-bottom': '24px' } },
  image:     { label: 'Image', icon: '◩', tag: 'img', attrs: { src: PLACEHOLDER_IMG, alt: '' }, group: 'Media',
               style: { 'max-width': '100%', display: 'block' } },
  video:     { label: 'Video', icon: '▶', tag: 'iframe', group: 'Media',
               attrs: { src: 'https://www.youtube.com/embed/aqz-KE-bpKQ', allowfullscreen: 'true', title: 'Video' },
               style: { width: '100%', 'aspect-ratio': '16 / 9', 'border-width': '0px', 'border-radius': '12px', display: 'block' } },
  embed:     { label: 'Custom Code', icon: '</>', tag: 'div', html: '<p style="padding:16px;background:#f3f4f6;margin:0">Custom HTML embed</p>', group: 'Media', cls: 'html-embed' },
  form:      { label: 'Form', icon: '▤', tag: 'form', container: true, group: 'Forms', attrs: { action: '', method: 'post' },
               style: { display: 'flex', 'flex-direction': 'column', gap: '12px', 'max-width': '480px' },
               children: () => [make('input'), make('textarea'), make('formbutton')] },
  input:     { label: 'Input', icon: '▁', tag: 'input', group: 'Forms', cls: 'text-field', attrs: { type: 'text', name: 'name', placeholder: 'Your name' },
               style: { 'padding-top': '10px', 'padding-bottom': '10px', 'padding-left': '12px', 'padding-right': '12px', 'border-width': '1px',
                        'border-style': 'solid', 'border-color': '#d1d5db', 'border-radius': '8px', 'font-size': '15px', width: '100%' } },
  textarea:  { label: 'Text Area', icon: '▭', tag: 'textarea', group: 'Forms', cls: 'text-area', attrs: { name: 'message', placeholder: 'Your message', rows: '4' },
               style: { 'padding-top': '10px', 'padding-bottom': '10px', 'padding-left': '12px', 'padding-right': '12px', 'border-width': '1px',
                        'border-style': 'solid', 'border-color': '#d1d5db', 'border-radius': '8px', 'font-size': '15px', width: '100%', 'font-family': 'inherit' } },
  formbutton:{ label: 'Submit', icon: '⏎', tag: 'button', text: 'Submit', group: 'Forms', cls: 'submit-button', attrs: { type: 'submit' },
               style: { 'padding-top': '12px', 'padding-bottom': '12px', 'padding-left': '22px', 'padding-right': '22px', 'background-color': '#14151a',
                        color: '#ffffff', 'border-width': '0px', 'border-radius': '8px', 'font-weight': '600', 'font-size': '15px', cursor: 'pointer' } },
};

/* ======================================================================
 * Utilities
 * ==================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => 'n' + Math.random().toString(36).slice(2, 10);
const clone = (o) => JSON.parse(JSON.stringify(o));
const escHTML = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escHTML(s).replace(/"/g, '&quot;');
const textToHTML = (t) => escHTML(t).replace(/\n/g, '<br>');
const pretty = (p) => p.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}

function sanitizeClass(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').replace(/^(\d)/, 'c-$1');
}
function sanitizeSlug(s) {
  return String(s || '').trim().toLowerCase().replace(/\.html$/, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

const colorCtx = document.createElement('canvas').getContext('2d');
function toHex(v) {
  if (!v) return null;
  v = String(v).trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) return '#' + [...v.slice(1)].map((c) => c + c).join('').toLowerCase();
  colorCtx.fillStyle = '#000000';
  colorCtx.fillStyle = v;
  const out = colorCtx.fillStyle;
  if (/^#[0-9a-f]{6}$/i.test(out)) return out;
  const m = out.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('') : null;
}

/* ======================================================================
 * Project model
 * ==================================================================== */
let project;
const ui = {
  pageId: null, selectedId: null, hoverId: null, bp: 'desktop',
  leftTab: 'add', rightTab: 'style',
  collapsedNav: new Set(), collapsedSecs: new Set(['Position', 'Effects', 'Flex child']),
};

function stylesFor(cls) {
  const c = project.classes[cls] || (project.classes[cls] = {});
  for (const b of BP_ORDER) c[b] = c[b] || {};
  return c;
}

function uniqueClassName(base) {
  base = sanitizeClass(base) || 'element';
  if (!project.classes[base]) return base;
  let i = 2;
  while (project.classes[`${base}-${i}`]) i++;
  return `${base}-${i}`;
}

function newClass(base, desktop = {}, tablet = {}, mobile = {}) {
  const name = uniqueClassName(base);
  project.classes[name] = { desktop: { ...desktop }, tablet: { ...tablet }, mobile: { ...mobile } };
  return name;
}

/** Create a node of a given type with a fresh class carrying the default styles. */
function make(type) {
  const def = ELEMENTS[type];
  const node = { id: uid(), type, tag: def.tag, cls: newClass(def.cls || type, def.style, def.tablet, def.mobile) };
  if (def.text != null) node.text = def.text;
  if (def.html != null) node.html = def.html;
  if (def.attrs) node.attrs = { ...def.attrs };
  if (def.container) node.children = def.children ? def.children() : [];
  return node;
}

const isContainer = (n) => !!n && Array.isArray(n.children) && n.html == null;
const currentPage = () => project.pages.find((p) => p.id === ui.pageId) || project.pages[0];

function findNode(id, node = currentPage().root, parent = null) {
  if (node.id === id) return { node, parent };
  for (const c of node.children || []) {
    const r = findNode(id, c, node);
    if (r) return r;
  }
  return null;
}
const getSel = () => (ui.selectedId ? findNode(ui.selectedId) : null);

function contains(ancestor, id) {
  if (ancestor.id === id) return true;
  return (ancestor.children || []).some((c) => contains(c, id));
}

function pathTo(id) {
  const out = [];
  const walk = (n) => {
    out.push(n);
    if (n.id === id) return true;
    for (const c of n.children || []) if (walk(c)) return true;
    out.pop();
    return false;
  };
  walk(currentPage().root);
  return out;
}

function reId(node) {
  node.id = uid();
  (node.children || []).forEach(reId);
  return node;
}

function walkAll(fn) {
  const walk = (n) => { fn(n); (n.children || []).forEach(walk); };
  project.pages.forEach((p) => walk(p.root));
}

function classUsage(cls) {
  let n = 0;
  walkAll((node) => { if (node.cls === cls) n++; });
  return n;
}

function nodeLabel(n) {
  return (ELEMENTS[n.type] || { label: n.type }).label;
}

/* ======================================================================
 * History & persistence
 * ==================================================================== */
const history = { past: [], future: [] };
let liveSnap = null; // snapshot taken before a live (uncommitted) color drag

function snapshot() { return JSON.stringify(project); }

function mutate(fn, preSnap) {
  history.past.push(preSnap || snapshot());
  if (history.past.length > 150) history.past.shift();
  history.future = [];
  fn();
  afterChange();
}

function undo() {
  if (!history.past.length) return;
  history.future.push(snapshot());
  project = JSON.parse(history.past.pop());
  afterChange();
}
function redo() {
  if (!history.future.length) return;
  history.past.push(snapshot());
  project = JSON.parse(history.future.pop());
  afterChange();
}

function afterChange() {
  if (!project.pages.some((p) => p.id === ui.pageId)) ui.pageId = project.pages[0].id;
  if (ui.selectedId && !findNode(ui.selectedId)) ui.selectedId = null;
  renderAll();
  schedulePersist();
}

let persistTimer;
function schedulePersist() {
  $('#save-state').textContent = 'Saving…';
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, 400);
}
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    $('#save-state').textContent = 'Saved';
  } catch (e) {
    $('#save-state').textContent = 'Not saved (storage full)';
  }
}
function loadProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.pages) && p.pages.length && p.classes) return p;
    }
  } catch (e) { /* ignore */ }
  return starterProject();
}

/* ======================================================================
 * CSS / HTML generation
 * ==================================================================== */
function cssDecl(obj, pad) {
  return Object.entries(obj || {})
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${pad}${k}: ${v};`).join('\n');
}

function generateCSS(onlyUsed) {
  let used = null;
  if (onlyUsed) { used = new Set(); walkAll((n) => n.cls && used.add(n.cls)); }
  let out = '';
  for (const bp of BP_ORDER) {
    const media = BREAKPOINTS[bp].media;
    const pad = media ? '    ' : '  ';
    let block = '';
    for (const [name, st] of Object.entries(project.classes)) {
      if (used && !used.has(name)) continue;
      const d = cssDecl(st[bp], pad);
      if (!d) continue;
      block += `${media ? '  ' : ''}.${name} {\n${d}\n${media ? '  ' : ''}}\n`;
    }
    if (!block) continue;
    out += media ? `\n@media screen and ${media} {\n${block}}\n` : block;
  }
  return out;
}

function usesGoogleFonts(css) {
  return GOOGLE_FONT_NAMES.some((f) => css.includes(f));
}

function nodeToHTML(n, depth) {
  const pad = '  '.repeat(depth);
  let attrs = n.cls ? ` class="${n.cls}"` : '';
  for (const [k, v] of Object.entries(n.attrs || {})) {
    if (v === '' || v == null) continue;
    attrs += v === true || v === 'true' && (k === 'allowfullscreen' || k === 'required') ? ` ${k}` : ` ${k}="${escAttr(v)}"`;
  }
  if (VOID_TAGS.has(n.tag)) return `${pad}<${n.tag}${attrs}>`;
  if (n.html != null) return `${pad}<${n.tag}${attrs}>\n${n.html}\n${pad}</${n.tag}>`;
  if (n.text != null) return `${pad}<${n.tag}${attrs}>${textToHTML(n.text)}</${n.tag}>`;
  if (!n.children || !n.children.length) return `${pad}<${n.tag}${attrs}></${n.tag}>`;
  return `${pad}<${n.tag}${attrs}>\n${n.children.map((c) => nodeToHTML(c, depth + 1)).join('\n')}\n${pad}</${n.tag}>`;
}

function siteCSS() {
  return `/* Generated by Blockyard */\n${BASE_CSS}\n${generateCSS(true)}`;
}

function pageHTML(page, { inlineCSS = false, extraHead = '' } = {}) {
  const css = siteCSS();
  const fonts = usesGoogleFonts(css)
    ? `  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="stylesheet" href="${GOOGLE_FONTS_URL}">\n` : '';
  const styleTag = inlineCSS ? `  <style>\n${css}  </style>\n` : `  <link rel="stylesheet" href="css/styles.css">\n`;
  const desc = page.description ? `  <meta name="description" content="${escAttr(page.description)}">\n` : '';
  const body = page.root.children.map((c) => nodeToHTML(c, 1)).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHTML(page.title || page.name)}</title>
${desc}${fonts}${styleTag}${extraHead}</head>
<body class="${page.root.cls}">
${body}
</body>
</html>
`;
}

/* ---- Minimal ZIP writer (stored, no compression) ---- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function makeZip(files) {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [], central = [];
  let offset = 0, cdSize = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = enc.encode(f.content), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(lh, name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(ch, name);
    offset += 30 + name.length + data.length;
    cdSize += 46 + name.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

function download(name, blobOrText, type = 'text/plain') {
  const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ======================================================================
 * Canvas (iframe) rendering
 * ==================================================================== */
const frame = $('#canvas');
let cdoc = null;
let editing = null;     // { el, id, original }
let drag = null;        // { kind: 'new'|'move', type?, id? }
let lastDrop = null;

function initCanvas() {
  frame.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <link rel="stylesheet" href="${GOOGLE_FONTS_URL}">
    <style>${BASE_CSS}${EDITOR_CSS}</style><style id="__user"></style></head><body></body></html>`;
  frame.addEventListener('load', () => {
    cdoc = frame.contentDocument;
    bindCanvasEvents();
    renderAll();
  }, { once: true });
}

function buildEl(n) {
  const el = cdoc.createElement(n.tag);
  if (n.cls) el.className = n.cls;
  for (const [k, v] of Object.entries(n.attrs || {})) {
    if (v === '' || v == null) continue;
    if (k === 'type' && n.tag === 'button') { el.setAttribute('type', 'button'); continue; } // never submit inside the editor
    el.setAttribute(k, v);
  }
  el.dataset.nid = n.id;
  if (n.type !== 'body') el.draggable = true;
  if (VOID_TAGS.has(n.tag)) return el;
  if (n.html != null) el.innerHTML = n.html;
  else if (n.text != null) el.innerHTML = textToHTML(n.text);
  else (n.children || []).forEach((c) => el.appendChild(buildEl(c)));
  if (isContainer(n) && !n.children.length) el.classList.add('__empty');
  return el;
}

function renderCanvasCSS() {
  if (cdoc) cdoc.getElementById('__user').textContent = generateCSS(false);
}

function renderCanvas() {
  if (!cdoc || editing) return;
  renderCanvasCSS();
  const page = currentPage();
  const body = cdoc.body;
  body.className = page.root.cls;
  body.dataset.nid = page.root.id;
  body.replaceChildren(...page.root.children.map(buildEl));
  if (!page.root.children.length) body.classList.add('__empty');
  for (const id of ['__hover', '__sel', '__lbl', '__drop', '__dropbox']) {
    const ov = cdoc.createElement('div');
    ov.id = id; ov.className = '__ov';
    body.append(ov);
  }
  updateOverlays();
}

const elFor = (id) => (cdoc && id ? cdoc.querySelector(`[data-nid="${id}"]`) : null);

function placeBox(box, el) {
  if (!box) return;
  if (!el) { box.style.display = 'none'; return; }
  const r = el.getBoundingClientRect();
  Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
}

function updateOverlays() {
  if (!cdoc) return;
  const selEl = elFor(ui.selectedId);
  const hovEl = ui.hoverId !== ui.selectedId ? elFor(ui.hoverId) : null;
  placeBox(cdoc.getElementById('__hover'), hovEl);
  placeBox(cdoc.getElementById('__sel'), selEl);
  const lbl = cdoc.getElementById('__lbl');
  if (lbl) {
    if (selEl && !editing) {
      const s = getSel();
      lbl.textContent = `${nodeLabel(s.node)}${s.node.cls ? ' · .' + s.node.cls : ''}`;
      const r = selEl.getBoundingClientRect();
      lbl.style.display = 'block';
      lbl.style.left = Math.max(0, r.left) + 'px';
      lbl.style.top = (r.top > 22 ? r.top - 21 : r.top + 2) + 'px';
    } else lbl.style.display = 'none';
  }
}

function hideDropIndicator() {
  if (!cdoc) return;
  ['__drop', '__dropbox'].forEach((id) => { const e = cdoc.getElementById(id); if (e) e.style.display = 'none'; });
}

function isHorizontalFlow(parentEl) {
  if (!parentEl) return false;
  const cs = cdoc.defaultView.getComputedStyle(parentEl);
  if (cs.display.includes('flex')) return !cs.flexDirection.startsWith('column');
  if (cs.display.includes('grid')) return cs.gridTemplateColumns.split(' ').length > 1;
  return false;
}

/** Work out where a drop at (x, y) over `target` would land. */
function computeCanvasDrop(target, x, y) {
  const page = currentPage();
  let el = target && target.closest ? target.closest('[data-nid]') : null;
  if (!el) el = cdoc.body;
  const id = el.dataset.nid;
  const found = findNode(id);
  if (!found) return null;
  const { node, parent } = found;

  const insideAt = (containerEl, containerNode) => {
    const horiz = isHorizontalFlow(containerEl);
    const kids = containerNode.children;
    let index = kids.length;
    for (let i = 0; i < kids.length; i++) {
      const kEl = elFor(kids[i].id);
      if (!kEl) continue;
      const r = kEl.getBoundingClientRect();
      if (horiz ? x < r.left + r.width / 2 && y < r.bottom : y < r.top + r.height / 2) { index = i; break; }
    }
    return { parentId: containerNode.id, index, box: containerEl };
  };

  if (node.type === 'body' || !parent) return insideAt(el, node);

  const r = el.getBoundingClientRect();
  const horiz = isHorizontalFlow(el.parentElement);
  const f = horiz ? (x - r.left) / Math.max(r.width, 1) : (y - r.top) / Math.max(r.height, 1);
  const idx = parent.children.indexOf(node);
  const edge = (before) => ({ parentId: parent.id, index: before ? idx : idx + 1, line: { el, before, horiz } });

  if (isContainer(node)) {
    if (f < 0.2) return edge(true);
    if (f > 0.8) return edge(false);
    return insideAt(el, node);
  }
  return edge(f < 0.5);
}

function showDropIndicator(drop) {
  hideDropIndicator();
  if (!drop) return;
  if (drop.box) { placeBox(cdoc.getElementById('__dropbox'), drop.box); return; }
  const line = cdoc.getElementById('__drop');
  const r = drop.line.el.getBoundingClientRect();
  const s = line.style;
  s.display = 'block';
  if (drop.line.horiz) {
    Object.assign(s, { top: r.top + 'px', height: r.height + 'px', width: '3px', left: (drop.line.before ? r.left - 2 : r.right - 1) + 'px' });
  } else {
    Object.assign(s, { left: r.left + 'px', width: r.width + 'px', height: '3px', top: (drop.line.before ? r.top - 2 : r.bottom - 1) + 'px' });
  }
}

function dropIsValid(drop) {
  if (!drop || !drag) return false;
  if (drag.kind === 'move') {
    const moving = findNode(drag.id);
    if (!moving) return false;
    if (contains(moving.node, drop.parentId)) return false; // can't drop into itself
  }
  return true;
}

function performDrop(drop) {
  if (!dropIsValid(drop)) return;
  const d = drag;
  mutate(() => {
    let node;
    let index = drop.index;
    if (d.kind === 'new') node = make(d.type);
    else {
      const r = findNode(d.id);
      const oldIdx = r.parent.children.indexOf(r.node);
      r.parent.children.splice(oldIdx, 1);
      if (r.parent.id === drop.parentId && oldIdx < index) index--;
      node = r.node;
    }
    findNode(drop.parentId).node.children.splice(index, 0, node);
    ui.selectedId = node.id;
  });
}

function bindCanvasEvents() {
  const win = frame.contentWindow;
  cdoc.addEventListener('mouseover', (e) => {
    if (drag) return;
    const el = e.target.closest && e.target.closest('[data-nid]');
    const id = el ? el.dataset.nid : null;
    if (id !== ui.hoverId) { ui.hoverId = id; updateOverlays(); }
  });
  cdoc.addEventListener('mouseleave', () => { ui.hoverId = null; updateOverlays(); });
  cdoc.addEventListener('click', (e) => {
    if (editing && editing.el.contains(e.target)) return;
    e.preventDefault();
    const el = e.target.closest && e.target.closest('[data-nid]');
    select(el ? el.dataset.nid : currentPage().root.id);
  });
  cdoc.addEventListener('dblclick', (e) => {
    const el = e.target.closest && e.target.closest('[data-nid]');
    if (!el) return;
    const found = findNode(el.dataset.nid);
    if (found && found.node.text != null) { e.preventDefault(); startEdit(el, found.node); }
    else if (found && found.node.type === 'image') { select(found.node.id); $('#file-image').click(); }
  });
  cdoc.addEventListener('submit', (e) => e.preventDefault());
  cdoc.addEventListener('keydown', onKeyDown);
  win.addEventListener('scroll', updateOverlays, { passive: true });
  win.addEventListener('resize', updateOverlays);
  cdoc.addEventListener('load', updateOverlays, true); // images, fonts
  new win.ResizeObserver(() => updateOverlays()).observe(cdoc.documentElement);

  // Drag & drop inside the canvas
  cdoc.addEventListener('dragstart', (e) => {
    const el = e.target.closest && e.target.closest('[data-nid]');
    if (!el || editing || el === cdoc.body) { e.preventDefault(); return; }
    drag = { kind: 'move', id: el.dataset.nid };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', el.dataset.nid);
    select(el.dataset.nid);
  });
  cdoc.addEventListener('dragover', (e) => {
    if (!drag) return;
    const drop = computeCanvasDrop(e.target, e.clientX, e.clientY);
    if (!dropIsValid(drop)) { hideDropIndicator(); lastDrop = null; return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = drag.kind === 'new' ? 'copy' : 'move';
    lastDrop = drop;
    showDropIndicator(drop);
  });
  cdoc.addEventListener('dragleave', (e) => { if (!e.relatedTarget) hideDropIndicator(); });
  cdoc.addEventListener('drop', (e) => {
    e.preventDefault();
    hideDropIndicator();
    const drop = computeCanvasDrop(e.target, e.clientX, e.clientY) || lastDrop;
    performDrop(drop);
    drag = null;
  });
  cdoc.addEventListener('dragend', endDrag);
}

function endDrag() {
  drag = null; lastDrop = null;
  hideDropIndicator();
  $$('.nav-row').forEach((r) => r.classList.remove('drop-before', 'drop-after', 'drop-inside'));
}

/* ---- Inline text editing ---- */
function startEdit(el, node) {
  select(node.id);
  editing = { el, id: node.id, original: node.text };
  el.draggable = false;
  el.contentEditable = 'true';
  el.focus();
  const sel = cdoc.getSelection();
  sel.selectAllChildren(el);
  updateOverlays();
  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); editing.cancel = true; el.blur(); }
    e.stopPropagation();
  };
  const onPaste = (e) => {
    e.preventDefault();
    cdoc.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  };
  el.addEventListener('keydown', onKey);
  el.addEventListener('paste', onPaste);
  el.addEventListener('blur', () => {
    el.removeEventListener('keydown', onKey);
    el.removeEventListener('paste', onPaste);
    const ed = editing;
    editing = null;
    el.contentEditable = 'false';
    const text = el.innerText.replace(/\n$/, '');
    if (!ed.cancel && text !== ed.original) {
      mutate(() => { const f = findNode(ed.id); if (f) f.node.text = text; });
    } else renderAll();
  }, { once: true });
}

/* ======================================================================
 * Structural actions
 * ==================================================================== */
function select(id, { scroll = false } = {}) {
  ui.selectedId = id;
  renderNavigator();
  renderPanel();
  renderCrumbs();
  updateOverlays();
  if (scroll) {
    const el = elFor(id);
    if (el && el !== cdoc.body) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function insertNew(type, parentId, index) {
  mutate(() => {
    const node = make(type);
    findNode(parentId).node.children.splice(index, 0, node);
    ui.selectedId = node.id;
  });
  const el = elFor(ui.selectedId);
  if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function addElement(type) {
  const sel = getSel();
  const root = currentPage().root;
  if (!sel) return insertNew(type, root.id, root.children.length);
  if (isContainer(sel.node)) return insertNew(type, sel.node.id, sel.node.children.length);
  return insertNew(type, sel.parent.id, sel.parent.children.indexOf(sel.node) + 1);
}

function deleteSelected() {
  const sel = getSel();
  if (!sel || !sel.parent) return;
  mutate(() => {
    const s = getSel();
    const kids = s.parent.children;
    const i = kids.indexOf(s.node);
    kids.splice(i, 1);
    ui.selectedId = (kids[i] || kids[i - 1] || s.parent).id;
  });
}

function duplicateSelected() {
  const sel = getSel();
  if (!sel || !sel.parent) return;
  mutate(() => {
    const s = getSel();
    const copy = reId(clone(s.node));
    s.parent.children.splice(s.parent.children.indexOf(s.node) + 1, 0, copy);
    ui.selectedId = copy.id;
  });
}

let clipboard = null;
function copySelected() {
  const sel = getSel();
  if (!sel || !sel.parent) return;
  clipboard = clone(sel.node);
  toast(`Copied ${nodeLabel(sel.node)}`);
}
function paste() {
  if (!clipboard) return;
  const sel = getSel();
  const root = currentPage().root;
  mutate(() => {
    const copy = reId(clone(clipboard));
    // Ensure classes exist (pasting after the class was cleaned up)
    const ensure = (n) => { if (n.cls) stylesFor(n.cls); (n.children || []).forEach(ensure); };
    ensure(copy);
    const s = sel && findNode(sel.node.id);
    if (!s) root.children.push(copy);
    else if (!s.parent || (isContainer(s.node) && !s.node.children.length)) s.node.children.push(copy);
    else s.parent.children.splice(s.parent.children.indexOf(s.node) + 1, 0, copy);
    ui.selectedId = copy.id;
  });
}

function wrapSelected() {
  const sel = getSel();
  if (!sel || !sel.parent) return;
  mutate(() => {
    const s = getSel();
    const wrapper = make('div');
    const i = s.parent.children.indexOf(s.node);
    s.parent.children.splice(i, 1, wrapper);
    wrapper.children.push(s.node);
    ui.selectedId = wrapper.id;
  });
}

function moveSelected(dir) {
  const sel = getSel();
  if (!sel || !sel.parent) return;
  const kids = sel.parent.children;
  const i = kids.indexOf(sel.node);
  const j = i + dir;
  if (j < 0 || j >= kids.length) return;
  mutate(() => {
    const s = getSel();
    const k = s.parent.children;
    [k[i], k[j]] = [k[j], k[i]];
  });
}

function assignClass(raw) {
  const sel = getSel();
  if (!sel || sel.node.type === 'body') return;
  const name = sanitizeClass(raw);
  if (!name || name === sel.node.cls) { renderPanel(true); return; }
  mutate(() => {
    const n = getSel().node;
    if (!project.classes[name]) project.classes[name] = clone(stylesFor(n.cls));
    n.cls = name;
  });
  toast(project.classes[name] ? `Class “${name}” applied` : `Created class “${name}”`);
}

function renameClass() {
  const sel = getSel();
  if (!sel || sel.node.type === 'body') return;
  const old = sel.node.cls;
  const name = sanitizeClass(prompt(`Rename class “${old}” everywhere it's used:`, old));
  if (!name || name === old) return;
  if (project.classes[name]) { toast(`A class named “${name}” already exists`); return; }
  mutate(() => {
    project.classes[name] = project.classes[old];
    delete project.classes[old];
    walkAll((n) => { if (n.cls === old) n.cls = name; });
  });
}

function cleanupClasses() {
  const used = new Set();
  walkAll((n) => n.cls && used.add(n.cls));
  const unused = Object.keys(project.classes).filter((c) => !used.has(c));
  if (!unused.length) { toast('No unused classes'); return; }
  mutate(() => unused.forEach((c) => delete project.classes[c]));
  toast(`Removed ${unused.length} unused class${unused.length > 1 ? 'es' : ''}`);
}

/* ---- Styles ---- */
const ownStyle = () => { const s = getSel(); return s ? stylesFor(s.node.cls)[ui.bp] : {}; };
function inheritedStyle() {
  const s = getSel();
  if (!s) return {};
  const c = stylesFor(s.node.cls), out = {};
  for (const b of BP_ORDER) { if (b === ui.bp) break; Object.assign(out, c[b]); }
  return out;
}
const effStyle = () => ({ ...inheritedStyle(), ...ownStyle() });

function setStyle(prop, value) {
  const s = getSel();
  if (!s) return;
  value = String(value ?? '').trim();
  const pre = liveSnap;
  liveSnap = null;
  const cur = stylesFor(s.node.cls)[ui.bp][prop] ?? '';
  if (cur === value && !pre) return;
  mutate(() => {
    const st = stylesFor(getSel().node.cls)[ui.bp];
    if (value === '') delete st[prop]; else st[prop] = value;
  }, pre);
}

/** Apply a style instantly without recording history (used while dragging a color picker). */
function liveStyle(prop, value) {
  const s = getSel();
  if (!s) return;
  if (!liveSnap) liveSnap = snapshot();
  stylesFor(s.node.cls)[ui.bp][prop] = value;
  renderCanvasCSS();
  updateOverlays();
}

function updateNode(fn) {
  if (!getSel()) return;
  mutate(() => fn(getSel().node));
}

/* ======================================================================
 * Left panel: Add / Navigator / Pages
 * ==================================================================== */
function renderAddPanel() {
  const root = $('#tab-add');
  root.replaceChildren();
  const groups = {};
  for (const [type, def] of Object.entries(ELEMENTS)) {
    if (def.hidden) continue;
    (groups[def.group] = groups[def.group] || []).push([type, def]);
  }
  for (const [group, items] of Object.entries(groups)) {
    const grid = h('div', { class: 'add-grid' });
    for (const [type, def] of items) {
      const tile = h('div', { class: 'add-tile', draggable: 'true', title: `Drag onto the canvas, or click to add ${def.label}` },
        h('span', { class: 'ico' }, def.icon), def.label);
      tile.addEventListener('dragstart', (e) => {
        drag = { kind: 'new', type };
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', type);
      });
      tile.addEventListener('dragend', endDrag);
      tile.addEventListener('click', () => addElement(type));
      grid.append(tile);
    }
    root.append(h('div', { class: 'add-group' }, h('h4', {}, group), grid));
  }
  root.append(h('div', { class: 'add-hint' },
    'Drag elements onto the canvas or into the Navigator. Clicking a tile adds it inside the selected container (or after the selected element). Double-click text on the canvas to edit it.'));
}

function renderNavigator() {
  const tree = $('#nav-tree');
  if (!tree) return;
  tree.replaceChildren();
  const walk = (n, depth) => {
    const hasKids = isContainer(n) && n.children.length > 0;
    const closed = ui.collapsedNav.has(n.id);
    const preview = n.text != null ? ` “${n.text.slice(0, 24)}${n.text.length > 24 ? '…' : ''}”` : '';
    const row = h('div', {
      class: 'nav-row' + (n.id === ui.selectedId ? ' selected' : ''),
      'data-nid': n.id, draggable: n.type !== 'body' ? 'true' : 'false',
      style: `padding-left:${6 + depth * 14}px`, title: preview.trim(),
    },
      h('span', { class: 'caret', 'data-caret': hasKids ? '1' : null }, hasKids ? (closed ? '▸' : '▾') : ''),
      h('span', { class: 'nav-icon' }, (ELEMENTS[n.type] || {}).icon || '□'),
      h('span', { class: 'nav-name' }, nodeLabel(n)),
      n.cls && n.type !== 'body' ? h('span', { class: 'nav-cls' }, '.' + n.cls) : null);
    tree.append(row);
    if (hasKids && !closed) n.children.forEach((c) => walk(c, depth + 1));
  };
  walk(currentPage().root, 0);
  const selRow = tree.querySelector('.nav-row.selected');
  if (selRow && ui.leftTab === 'navigator') selRow.scrollIntoView({ block: 'nearest' });
}

function navDropFor(row, y) {
  const found = findNode(row.dataset.nid);
  if (!found) return null;
  const { node, parent } = found;
  if (!parent) return { parentId: node.id, index: node.children.length, mode: 'inside' };
  const r = row.getBoundingClientRect();
  const f = (y - r.top) / r.height;
  const idx = parent.children.indexOf(node);
  if (isContainer(node)) {
    if (f < 0.3) return { parentId: parent.id, index: idx, mode: 'before' };
    if (f > 0.7 && (!node.children.length || ui.collapsedNav.has(node.id))) return { parentId: parent.id, index: idx + 1, mode: 'after' };
    if (f > 0.7) return { parentId: node.id, index: 0, mode: 'inside' };
    return { parentId: node.id, index: node.children.length, mode: 'inside' };
  }
  return f < 0.5 ? { parentId: parent.id, index: idx, mode: 'before' } : { parentId: parent.id, index: idx + 1, mode: 'after' };
}

function bindNavigator() {
  const tree = $('#nav-tree');
  tree.addEventListener('click', (e) => {
    const row = e.target.closest('.nav-row');
    if (!row) return;
    if (e.target.dataset.caret) {
      const id = row.dataset.nid;
      ui.collapsedNav.has(id) ? ui.collapsedNav.delete(id) : ui.collapsedNav.add(id);
      renderNavigator();
      return;
    }
    select(row.dataset.nid, { scroll: true });
  });
  tree.addEventListener('mouseover', (e) => {
    const row = e.target.closest('.nav-row');
    const id = row ? row.dataset.nid : null;
    if (id !== ui.hoverId) { ui.hoverId = id; updateOverlays(); }
  });
  tree.addEventListener('mouseleave', () => { ui.hoverId = null; updateOverlays(); });
  tree.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.nav-row');
    if (!row || row.getAttribute('draggable') !== 'true') return;
    drag = { kind: 'move', id: row.dataset.nid };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.dataset.nid);
  });
  tree.addEventListener('dragover', (e) => {
    if (!drag) return;
    const row = e.target.closest('.nav-row');
    $$('.nav-row', tree).forEach((r) => r.classList.remove('drop-before', 'drop-after', 'drop-inside'));
    if (!row) return;
    const drop = navDropFor(row, e.clientY);
    if (!dropIsValid(drop)) return;
    e.preventDefault();
    row.classList.add('drop-' + drop.mode);
  });
  tree.addEventListener('drop', (e) => {
    const row = e.target.closest('.nav-row');
    if (!row || !drag) return;
    e.preventDefault();
    const drop = navDropFor(row, e.clientY);
    performDrop(drop);
    endDrag();
  });
  tree.addEventListener('dragend', endDrag);
}

function renderPages() {
  const list = $('#pages-list');
  list.replaceChildren();
  for (const p of project.pages) {
    const row = h('div', { class: 'page-row' + (p.id === currentPage().id ? ' on' : ''), title: 'Open page' },
      h('span', {}, '📄'),
      h('span', { class: 'pname' }, p.name),
      h('span', { class: 'pslug' }, `/${p.slug === 'index' ? '' : p.slug}`),
      h('button', { class: 'icon-btn', title: 'Page settings', onclick: (e) => { e.stopPropagation(); openPage(p.id); select(currentPage().root.id); setRightTab('settings'); } }, '⚙'),
      h('button', { class: 'icon-btn', title: 'Duplicate page', onclick: (e) => { e.stopPropagation(); duplicatePage(p.id); } }, '⧉'),
      project.pages.length > 1 ? h('button', { class: 'icon-btn', title: 'Delete page', onclick: (e) => { e.stopPropagation(); deletePage(p.id); } }, '✕') : null);
    row.addEventListener('click', () => openPage(p.id));
    list.append(row);
  }
  const sel = $('#page-select');
  sel.replaceChildren(...project.pages.map((p) => h('option', { value: p.id }, p.name)));
  sel.value = currentPage().id;
  // Link suggestions
  $('#link-list').replaceChildren(
    ...project.pages.map((p) => h('option', { value: `${p.slug}.html` }, p.name)),
    ...collectIds().map((id) => h('option', { value: '#' + id }, 'Section anchor')));
}

function collectIds() {
  const ids = [];
  const walk = (n) => { if (n.attrs && n.attrs.id) ids.push(n.attrs.id); (n.children || []).forEach(walk); };
  walk(currentPage().root);
  return ids;
}

function openPage(id) {
  if (ui.pageId === id) return;
  ui.pageId = id;
  ui.selectedId = null;
  ui.hoverId = null;
  renderAll();
  frame.contentWindow && frame.contentWindow.scrollTo(0, 0);
}

function uniqueSlug(base) {
  base = sanitizeSlug(base) || 'page';
  let s = base, i = 2;
  while (project.pages.some((p) => p.slug === s)) s = `${base}-${i++}`;
  return s;
}

function addPage() {
  const name = prompt('Page name:', `Page ${project.pages.length + 1}`);
  if (!name) return;
  mutate(() => {
    const page = { id: uid(), name, slug: uniqueSlug(name), title: name, description: '', root: { id: uid(), type: 'body', tag: 'body', cls: 'body', children: [] } };
    stylesFor('body');
    project.pages.push(page);
    ui.pageId = page.id;
    ui.selectedId = null;
  });
}

function duplicatePage(id) {
  const src = project.pages.find((p) => p.id === id);
  mutate(() => {
    const page = clone(src);
    page.id = uid();
    page.name = src.name + ' copy';
    page.slug = uniqueSlug(src.slug + '-copy');
    reId(page.root);
    project.pages.splice(project.pages.indexOf(src) + 1, 0, page);
    ui.pageId = page.id;
    ui.selectedId = null;
  });
}

function deletePage(id) {
  const p = project.pages.find((x) => x.id === id);
  if (!p || project.pages.length < 2) return;
  if (!confirm(`Delete page “${p.name}”? You can undo this.`)) return;
  mutate(() => {
    project.pages = project.pages.filter((x) => x.id !== id);
    if (!project.pages.some((x) => x.slug === 'index')) project.pages[0].slug = 'index';
    if (ui.pageId === id) { ui.pageId = project.pages[0].id; ui.selectedId = null; }
  });
}

/* ======================================================================
 * Right panel: Style & Settings
 * ==================================================================== */
const isFlex = (s) => /flex/.test(s.display || '');
const isGrid = (s) => /grid/.test(s.display || '');
const isFlexOrGrid = (s) => isFlex(s) || isGrid(s);
const FONTS = [
  ['Inter, system-ui, sans-serif', 'Inter'], ['"DM Sans", sans-serif', 'DM Sans'], ['Poppins, sans-serif', 'Poppins'],
  ['"Space Grotesk", sans-serif', 'Space Grotesk'], ['"Playfair Display", serif', 'Playfair Display'],
  ['Georgia, serif', 'Georgia'], ['system-ui, sans-serif', 'System UI'], ['ui-monospace, Menlo, monospace', 'Monospace'],
];
const WEIGHTS = [['100', '100 Thin'], ['200', '200 Extra light'], ['300', '300 Light'], ['400', '400 Normal'], ['500', '500 Medium'],
  ['600', '600 Semibold'], ['700', '700 Bold'], ['800', '800 Extra bold'], ['900', '900 Black']];

const STYLE_SECTIONS = [
  { title: 'Layout', fields: [
    { p: 'display', type: 'seg', options: [['block', 'Block'], ['flex', 'Flex'], ['grid', 'Grid'], ['inline-block', 'Inline'], ['none', 'None']] },
    { p: 'flex-direction', label: 'Direction', type: 'seg', options: [['row', 'Row →'], ['column', 'Column ↓']], when: isFlex },
    { p: 'justify-content', label: 'Justify', type: 'select', when: isFlexOrGrid,
      options: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'] },
    { p: 'align-items', label: 'Align', type: 'select', when: isFlexOrGrid, options: ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'] },
    { p: 'flex-wrap', label: 'Wrap', type: 'seg', options: [['nowrap', "Don't wrap"], ['wrap', 'Wrap']], when: isFlex },
    { p: 'grid-template-columns', label: 'Columns', type: 'text', ph: '1fr 1fr', when: isGrid },
    { p: 'grid-template-rows', label: 'Rows', type: 'text', ph: 'auto', when: isGrid },
    { p: 'gap', type: 'unit', when: isFlexOrGrid },
  ] },
  { title: 'Spacing', box: true },
  { title: 'Size', fields: [
    { p: 'width', type: 'unit', ph: 'auto' }, { p: 'height', type: 'unit', ph: 'auto' },
    { p: 'min-width', label: 'Min W', type: 'unit' }, { p: 'min-height', label: 'Min H', type: 'unit' },
    { p: 'max-width', label: 'Max W', type: 'unit', ph: 'none' }, { p: 'max-height', label: 'Max H', type: 'unit', ph: 'none' },
    { p: 'overflow', type: 'select', options: ['visible', 'hidden', 'auto', 'scroll'] },
    { p: 'object-fit', label: 'Fit', type: 'select', options: ['fill', 'contain', 'cover', 'none'], only: ['image', 'video'] },
    { p: 'aspect-ratio', label: 'Ratio', type: 'text', ph: 'e.g. 16 / 9' },
  ] },
  { title: 'Position', fields: [
    { p: 'position', type: 'select', options: ['static', 'relative', 'absolute', 'fixed', 'sticky'] },
    ...['top', 'right', 'bottom', 'left'].map((p) => ({ p, type: 'unit', when: (s) => s.position && s.position !== 'static' })),
    { p: 'z-index', label: 'Z-index', type: 'text' },
  ] },
  { title: 'Typography', fields: [
    { p: 'font-family', label: 'Font', type: 'select', options: FONTS },
    { p: 'font-size', label: 'Size', type: 'unit' },
    { p: 'font-weight', label: 'Weight', type: 'select', options: WEIGHTS },
    { p: 'line-height', label: 'Height', type: 'text', ph: 'e.g. 1.5' },
    { p: 'letter-spacing', label: 'Spacing', type: 'unit' },
    { p: 'color', type: 'color' },
    { p: 'text-align', label: 'Align', type: 'seg', options: [['left', '⇤'], ['center', '↔'], ['right', '⇥'], ['justify', '☰']] },
    { p: 'font-style', label: 'Style', type: 'seg', options: [['normal', 'Normal'], ['italic', 'Italic']] },
    { p: 'text-transform', label: 'Case', type: 'select', options: ['none', 'uppercase', 'lowercase', 'capitalize'] },
    { p: 'text-decoration', label: 'Decoration', type: 'select', options: ['none', 'underline', 'line-through'] },
  ] },
  { title: 'Backgrounds', fields: [
    { p: 'background-color', label: 'Color', type: 'color' },
    { p: 'background-image', label: 'Image', type: 'bgimg', ph: 'URL or gradient' },
    { p: 'background-size', label: 'Size', type: 'select', options: ['auto', 'cover', 'contain'] },
    { p: 'background-position', label: 'Position', type: 'select', options: ['center', 'top', 'bottom', 'left', 'right'] },
    { p: 'background-repeat', label: 'Repeat', type: 'select', options: ['no-repeat', 'repeat', 'repeat-x', 'repeat-y'] },
  ] },
  { title: 'Borders', fields: [
    { p: 'border-radius', label: 'Radius', type: 'unit' },
    { p: 'border-width', label: 'Width', type: 'unit' },
    { p: 'border-style', label: 'Style', type: 'select', options: ['none', 'solid', 'dashed', 'dotted'] },
    { p: 'border-color', label: 'Color', type: 'color' },
  ] },
  { title: 'Effects', fields: [
    { p: 'opacity', type: 'text', ph: '1' },
    { p: 'box-shadow', label: 'Shadow', type: 'text', list: 'shadow-list', ph: 'none' },
    { p: 'transform', type: 'text', ph: 'e.g. rotate(3deg)' },
    { p: 'transition', type: 'text', ph: 'all 0.2s ease' },
    { p: 'cursor', type: 'select', options: ['auto', 'pointer', 'default', 'text', 'not-allowed'] },
  ] },
  { title: 'Flex child', fields: [
    { p: 'flex', label: 'Grow/shrink', type: 'text', ph: '0 1 auto' },
    { p: 'align-self', label: 'Align self', type: 'select', options: ['auto', 'flex-start', 'center', 'flex-end', 'stretch'] },
    { p: 'order', type: 'text', ph: '0' },
  ] },
];

function normUnit(v) {
  v = String(v).trim();
  return /^-?\d*\.?\d+$/.test(v) && v !== '0' ? v + 'px' : v === '0' ? '0px' : v;
}

let panelKey = null;
let panelFields = [];

function renderPanel(force) {
  const sel = getSel();
  const key = sel ? [sel.node.id, sel.node.cls, sel.node.type, sel.node.tag, ui.bp, ui.rightTab, ui.pageId].join('|') : 'none';
  if (!force && key === panelKey) { panelFields.forEach((f) => f.update()); return; }
  const body = $('#right-body');
  const scroll = body.scrollTop;
  panelKey = key;
  panelFields = [];
  body.replaceChildren();
  if (!sel) {
    body.append(h('div', { class: 'empty-hint' }, 'Select an element on the canvas or in the Navigator to style it.',
      h('br'), h('br'), 'Tip: drag elements in from the ', h('b', {}, 'Add'), ' panel.'));
    return;
  }
  if (ui.rightTab === 'style') buildStylePanel(body, sel.node);
  else buildSettingsPanel(body, sel.node);
  panelFields.forEach((f) => f.update());
  body.scrollTop = scroll;
}

function buildStylePanel(root, node) {
  const isBody = node.type === 'body';
  const usage = classUsage(node.cls);
  $('#class-list').replaceChildren(...Object.keys(project.classes).map((c) => h('option', { value: c })));
  const clsInput = h('input', { class: 'cls-input', list: 'class-list', value: node.cls, spellcheck: 'false',
    title: isBody ? 'The body class is shared by every page' : 'Type a new name to create a class, or an existing name to apply it',
    disabled: isBody });
  clsInput.addEventListener('change', () => assignClass(clsInput.value));
  clsInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') clsInput.blur(); });
  panelFields.push({ update: () => { if (document.activeElement !== clsInput) clsInput.value = getSel().node.cls; } });

  const head = h('div', { class: 'sel-head' },
    h('div', { class: 'sel-type' }, nodeLabel(node), ' ', h('span', { class: 'muted' }, `<${node.tag}>`)),
    h('div', { class: 'cls-row' }, h('span', { class: 'cls-dot' }, '.'), clsInput,
      isBody ? null : h('button', { class: 'icon-btn', title: 'Rename this class everywhere', onclick: renameClass }, '✎')),
    h('div', { class: 'muted small' }, isBody ? 'Body styles apply to every page.'
      : usage > 1 ? `⚠ Shared by ${usage} elements — style changes affect all of them. Type a new class name to split it off.`
      : 'Used by 1 element.'));
  if (ui.bp !== 'desktop') {
    head.append(h('div', { class: 'bp-note' },
      `Editing ${BREAKPOINTS[ui.bp].label} styles, ${BREAKPOINTS[ui.bp].media.slice(1, -1)}. Orange values are inherited from larger breakpoints.`));
  }
  root.append(head);

  for (const sec of STYLE_SECTIONS) {
    const secEl = h('div', { class: 'sec' + (ui.collapsedSecs.has(sec.title) ? ' collapsed' : '') });
    const content = h('div', { class: 'sec-body' });
    secEl.append(h('button', {
      class: 'sec-head',
      onclick: () => {
        ui.collapsedSecs.has(sec.title) ? ui.collapsedSecs.delete(sec.title) : ui.collapsedSecs.add(sec.title);
        secEl.classList.toggle('collapsed');
      },
    }, h('span', {}, sec.title), h('span', { class: 'chev' }, '▾')), content);
    if (sec.box) content.append(boxModel());
    else for (const f of sec.fields) {
      if (f.only && !f.only.includes(node.type)) continue;
      content.append(fieldRow(f));
    }
    root.append(secEl);
  }
}

function fieldRow(spec) {
  const label = h('label', { class: 'f-label', title: spec.p }, spec.label || pretty(spec.p));
  const ctrl = { unit: inputControl, text: inputControl, bgimg: inputControl, select: selectControl, color: colorControl, seg: segControl }[spec.type](spec);
  const row = h('div', { class: 'f-row' }, label, ctrl.el);
  label.addEventListener('click', () => { if (ownStyle()[spec.p] != null) setStyle(spec.p, ''); });
  panelFields.push({
    update() {
      const own = ownStyle()[spec.p], inh = inheritedStyle()[spec.p];
      label.classList.toggle('set', own != null);
      label.classList.toggle('inherited', own == null && inh != null);
      label.title = own != null ? `${spec.p} — click to reset` : spec.p;
      ctrl.update(own, inh);
      if (spec.when) row.hidden = !spec.when(effStyle());
    },
  });
  return row;
}

function inputControl(spec) {
  const inp = h('input', { class: 'f-input', 'data-key': spec.p, spellcheck: 'false', list: spec.list || null });
  const fromStore = (v) => (spec.type === 'bgimg' && v ? v.replace(/^url\((["']?)(.*)\1\)$/, '$2') : v);
  const toStore = (v) => {
    v = v.trim();
    if (spec.type === 'unit') return normUnit(v);
    if (spec.type === 'bgimg' && v && !/^(url\(|[a-z-]*gradient\(|none$)/i.test(v)) return `url("${v}")`;
    return v;
  };
  const commit = () => setStyle(spec.p, toStore(inp.value));
  inp.addEventListener('change', commit);
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') inp.blur();
    if (spec.type === 'unit' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const m = (inp.value || inp.placeholder || '0px').match(/^(-?\d*\.?\d+)([a-z%]*)$/i);
      if (!m) return;
      const step = (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
      inp.value = Math.round((parseFloat(m[1]) + step) * 100) / 100 + (m[2] || 'px');
      commit();
    }
  });
  return {
    el: inp,
    update(own, inh) {
      if (document.activeElement !== inp) inp.value = fromStore(own) ?? '';
      inp.placeholder = fromStore(inh) ?? spec.ph ?? '';
    },
  };
}

function selectControl(spec) {
  const sel = h('select', { class: 'f-input', 'data-key': spec.p });
  const first = h('option', { value: '' }, '—');
  sel.append(first);
  const labels = {};
  for (const o of spec.options) {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    labels[v] = l;
    sel.append(h('option', { value: v }, l));
  }
  sel.addEventListener('change', () => setStyle(spec.p, sel.value));
  return {
    el: sel,
    update(own, inh) {
      first.textContent = inh != null ? `${labels[inh] || inh} (inherited)` : '—';
      if (own != null && !(own in labels)) { labels[own] = own; sel.append(h('option', { value: own }, own)); }
      sel.value = own ?? '';
    },
  };
}

function colorControl(spec) {
  const pick = h('input', { type: 'color' });
  const txt = h('input', { class: 'f-input', 'data-key': spec.p, spellcheck: 'false' });
  pick.addEventListener('input', () => { txt.value = pick.value; liveStyle(spec.p, pick.value); });
  pick.addEventListener('change', () => setStyle(spec.p, pick.value));
  txt.addEventListener('change', () => setStyle(spec.p, txt.value));
  txt.addEventListener('keydown', (e) => { if (e.key === 'Enter') txt.blur(); });
  return {
    el: h('div', { class: 'f-color' }, pick, txt),
    update(own, inh) {
      if (document.activeElement !== txt) txt.value = own ?? '';
      txt.placeholder = inh ?? '';
      pick.value = toHex(own ?? inh) || '#000000';
    },
  };
}

function segControl(spec) {
  const wrap = h('div', { class: 'seg f-seg' });
  const btns = spec.options.map(([v, l]) => {
    const b = h('button', { title: v, onclick: () => setStyle(spec.p, ownStyle()[spec.p] === v ? '' : v) }, l);
    b.dataset.v = v;
    wrap.append(b);
    return b;
  });
  return {
    el: wrap,
    update(own, inh) {
      btns.forEach((b) => {
        b.classList.toggle('on', own === b.dataset.v);
        b.classList.toggle('inh', own == null && inh === b.dataset.v);
      });
    },
  };
}

function boxModel() {
  const mk = (p, pos) => {
    const c = inputControl({ p, type: 'unit' });
    c.el.className = 'bm-in ' + pos;
    c.el.title = p + ' (↑/↓ to nudge, Shift for ×10)';
    panelFields.push({
      update() {
        const own = ownStyle()[p], inh = inheritedStyle()[p];
        c.update(own, inh ?? '0');
        c.el.classList.toggle('set', own != null);
      },
    });
    return c.el;
  };
  const padding = h('div', { class: 'bm bm-padding c' },
    h('span', { class: 'bm-tag' }, 'PADDING'),
    mk('padding-top', 't'), mk('padding-left', 'l'), h('div', { class: 'bm-core c' }), mk('padding-right', 'r'), mk('padding-bottom', 'b'));
  return h('div', { class: 'bm bm-margin' },
    h('span', { class: 'bm-tag' }, 'MARGIN'),
    mk('margin-top', 't'), mk('margin-left', 'l'), padding, mk('margin-right', 'r'), mk('margin-bottom', 'b'));
}

/* ---- Settings tab ---- */
function buildSettingsPanel(root, node) {
  const def = ELEMENTS[node.type] || {};
  const sec = (title, ...kids) => h('div', { class: 'sec' }, h('div', { class: 'sec-head' }, h('span', {}, title)), h('div', { class: 'sec-body' }, ...kids));
  const row = (label, ctrl) => h('div', { class: 'f-row' }, h('label', { class: 'f-label' }, label), ctrl);
  const bind = (el, get, set) => {
    el.addEventListener('change', () => set(el.type === 'checkbox' ? el.checked : el.value));
    if (el.tagName === 'INPUT' && el.type !== 'checkbox') el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
    panelFields.push({
      update() {
        const n = getSel() && getSel().node;
        if (!n || document.activeElement === el) return;
        const v = get(n);
        if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? '';
      },
    });
    return el;
  };
  const attrInput = (label, key, opts = {}) => row(label, bind(
    h('input', { class: 'f-input', spellcheck: 'false', placeholder: opts.ph || '', list: opts.list || null }),
    (n) => (n.attrs || {})[key],
    (v) => updateNode((n) => { n.attrs = n.attrs || {}; v = opts.transform ? opts.transform(v) : v; if (v === '') delete n.attrs[key]; else n.attrs[key] = v; })));

  if (node.type === 'body') {
    const page = currentPage();
    const pageField = (label, key, ph, multiline) => {
      const el = multiline ? h('textarea', { class: 'f-input', placeholder: ph }) : h('input', { class: 'f-input', placeholder: ph });
      return row(label, bind(el, () => currentPage()[key], (v) => mutate(() => {
        const p = currentPage();
        if (key === 'slug') {
          if (p.slug === 'index') { toast('The home page slug is always “index”'); return; }
          v = uniqueSlug(v || p.name);
        }
        p[key] = v;
      })));
    };
    root.append(sec('Page settings',
      pageField('Name', 'name', 'Page name'),
      pageField('Slug', 'slug', 'about'),
      h('div', { class: 'muted small' }, page.slug === 'index' ? 'This is the home page (index.html).' : `Exports as ${page.slug}.html`),
      pageField('SEO title', 'title', 'Shown in the browser tab'),
      pageField('Description', 'description', 'Meta description for search engines', true)));
    return;
  }

  const general = [];
  if (def.tags) {
    const s = h('select', { class: 'f-input' }, ...def.tags.map((t) => h('option', { value: t }, t)));
    general.push(row('Tag', bind(s, (n) => n.tag, (v) => updateNode((n) => { n.tag = v; }))));
  }
  if (node.text != null) {
    general.push(row('Text', bind(h('textarea', { class: 'f-input' }), (n) => n.text, (v) => updateNode((n) => { n.text = v; }))));
  }
  general.push(attrInput('ID', 'id', { ph: 'for #anchor links', transform: sanitizeSlug }));
  root.append(sec('Element', ...general));

  if (node.type === 'link' || node.type === 'button') {
    root.append(sec('Link',
      attrInput('URL', 'href', { ph: 'https://… or about.html', list: 'link-list' }),
      row('', bind(h('input', { type: 'checkbox' }), (n) => (n.attrs || {}).target === '_blank',
        (v) => updateNode((n) => { n.attrs = n.attrs || {}; if (v) { n.attrs.target = '_blank'; n.attrs.rel = 'noopener'; } else { delete n.attrs.target; delete n.attrs.rel; } }))),
      h('div', { class: 'muted small', style: 'margin-top:-26px;margin-left:110px' }, 'Open in new tab')));
  }
  if (node.type === 'image') {
    root.append(sec('Image',
      attrInput('Source', 'src', { ph: 'https://…' }),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: () => $('#file-image').click() }, '⬆ Upload image…')),
      attrInput('Alt text', 'alt', { ph: 'Describe the image' })));
  }
  if (node.type === 'video') {
    root.append(sec('Video', attrInput('YouTube / embed URL', 'src', { transform: toEmbedUrl, ph: 'https://youtube.com/watch?v=…' })));
  }
  if (node.type === 'input') {
    const t = h('select', { class: 'f-input' }, ...['text', 'email', 'tel', 'number', 'password', 'url', 'date'].map((x) => h('option', { value: x }, x)));
    root.append(sec('Input',
      row('Type', bind(t, (n) => (n.attrs || {}).type, (v) => updateNode((n) => { n.attrs.type = v; }))),
      attrInput('Name', 'name'), attrInput('Placeholder', 'placeholder'),
      row('Required', bind(h('input', { type: 'checkbox' }), (n) => (n.attrs || {}).required,
        (v) => updateNode((n) => { if (v) n.attrs.required = 'true'; else delete n.attrs.required; })))));
  }
  if (node.type === 'textarea') root.append(sec('Text area', attrInput('Name', 'name'), attrInput('Placeholder', 'placeholder'), attrInput('Rows', 'rows')));
  if (node.type === 'form') {
    const m = h('select', { class: 'f-input' }, h('option', { value: 'post' }, 'POST'), h('option', { value: 'get' }, 'GET'));
    root.append(sec('Form',
      attrInput('Action URL', 'action', { ph: 'https://formspree.io/f/…' }),
      row('Method', bind(m, (n) => (n.attrs || {}).method || 'post', (v) => updateNode((n) => { n.attrs.method = v; })))));
  }
  if (node.type === 'embed') {
    root.append(sec('Custom code',
      bind(h('textarea', { class: 'f-input code', spellcheck: 'false' }), (n) => n.html, (v) => updateNode((n) => { n.html = v; })),
      h('div', { class: 'muted small' }, 'Scripts run in the exported site and in Preview, not on the canvas.')));
  }

  const sel = getSel();
  const idx = sel.parent.children.indexOf(node);
  root.append(sec('Actions', h('div', { class: 'btn-row' },
    h('button', { class: 'btn', onclick: () => moveSelected(-1), disabled: idx === 0 }, '↑ Move up'),
    h('button', { class: 'btn', onclick: () => moveSelected(1), disabled: idx === sel.parent.children.length - 1 }, '↓ Move down'),
    h('button', { class: 'btn', onclick: () => select(sel.parent.id) }, '⤒ Select parent'),
    h('button', { class: 'btn', onclick: wrapSelected }, '▣ Wrap in Div'),
    h('button', { class: 'btn', onclick: duplicateSelected }, '⧉ Duplicate'),
    h('button', { class: 'btn danger', onclick: deleteSelected }, '✕ Delete'))));
}

function toEmbedUrl(v) {
  const m = String(v).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  const vm = String(v).match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return v;
}

/* ======================================================================
 * Crumbs, toolbar, breakpoints
 * ==================================================================== */
function renderCrumbs() {
  const c = $('#crumbs');
  c.replaceChildren();
  if (!ui.selectedId) { c.append(h('span', { class: 'muted' }, 'Nothing selected')); return; }
  const path = pathTo(ui.selectedId);
  path.forEach((n, i) => {
    if (i) c.append(h('span', { class: 'sep' }, '›'));
    c.append(h('button', { class: i === path.length - 1 ? 'last' : '', onclick: () => select(n.id, { scroll: true }) },
      nodeLabel(n) + (n.type !== 'body' && n.cls ? ` .${n.cls}` : '')));
  });
}

function setBreakpoint(bp) {
  ui.bp = bp;
  $$('#bp-group button').forEach((b) => b.classList.toggle('on', b.dataset.bp === bp));
  const w = BREAKPOINTS[bp].width;
  const wrap = $('#canvas-wrap');
  wrap.style.width = w ? w + 'px' : '100%';
  wrap.style.minWidth = w ? '' : '992px';
  renderPanel(true);
  setTimeout(updateOverlays, 250);
}

function setLeftTab(tab) {
  ui.leftTab = tab;
  $$('#left-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  ['add', 'navigator', 'pages'].forEach((t) => ($('#tab-' + t).hidden = t !== tab));
  if (tab === 'navigator') renderNavigator();
}
function setRightTab(tab) {
  ui.rightTab = tab;
  $$('#right-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  renderPanel(true);
}

function renderAll() {
  renderCanvas();
  renderNavigator();
  renderPages();
  renderPanel();
  renderCrumbs();
  $('#btn-undo').disabled = !history.past.length;
  $('#btn-redo').disabled = !history.future.length;
}

/* ======================================================================
 * Modals: export, preview, shortcuts
 * ==================================================================== */
function openModal(title, body, actions = []) {
  const close = () => back.remove();
  const back = h('div', { class: 'modal-back' },
    h('div', { class: 'modal' },
      h('div', { class: 'modal-head' }, h('h3', {}, title), ...actions, h('button', { class: 'btn', onclick: () => close() }, 'Close')),
      h('div', { class: 'modal-body' }, body)));
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  $('#modal-root').append(back);
  return close;
}

function exportFiles() {
  return [
    ...project.pages.map((p) => ({ name: `${p.slug}.html`, content: pageHTML(p) })),
    { name: 'css/styles.css', content: siteCSS() },
  ];
}

function openExport() {
  const page = currentPage();
  const html = pageHTML(page), css = siteCSS();
  const view = h('textarea', { class: 'code-view', readonly: true, spellcheck: 'false' });
  view.value = html;
  let mode = 'html';
  const tabs = h('div', { class: 'seg', style: 'display:inline-flex' },
    h('button', { class: 'on', onclick: (e) => setMode('html', e.target) }, `${page.slug}.html`),
    h('button', { onclick: (e) => setMode('css', e.target) }, 'css/styles.css'));
  function setMode(m, btn) {
    mode = m;
    view.value = m === 'html' ? html : css;
    $$('button', tabs).forEach((b) => b.classList.toggle('on', b === btn));
  }
  const body = h('div', { style: 'display:flex;flex-direction:column;gap:12px' },
    h('div', { class: 'muted' }, `Clean, hand-editable HTML & CSS. The ZIP contains ${project.pages.length} page${project.pages.length > 1 ? 's' : ''} plus css/styles.css — upload it to any static host (Netlify, Vercel, GitHub Pages, S3…).`),
    tabs, view);
  openModal('Export code', body, [
    h('button', { class: 'btn', onclick: () => { navigator.clipboard.writeText(view.value).then(() => toast('Copied to clipboard'), () => { view.select(); toast('Press Ctrl+C to copy'); }); } }, 'Copy'),
    h('button', { class: 'btn', onclick: () => download(`${page.slug}.html`, pageHTML(page, { inlineCSS: true }), 'text/html') }, 'Download page (single file)'),
    h('button', { class: 'btn primary', onclick: () => { download('website.zip', makeZip(exportFiles())); toast('Downloading website.zip'); } }, 'Download site .zip'),
  ]);
  void mode;
}

const PREVIEW_NAV_SCRIPT = `<script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a');if(!a)return;var href=a.getAttribute('href')||'';if(/^[\\w-]+\\.html(#.*)?$/.test(href)){e.preventDefault();parent.postMessage({blockyardNav:href},'*');}else if(href==='#'){e.preventDefault();}});document.addEventListener('submit',function(e){e.preventDefault();alert('Form submitted (preview)');});document.addEventListener('keydown',function(e){if(e.key==='Escape')parent.postMessage({blockyardEsc:1},'*');});<\/script>\n`;

function openPreview() {
  let page = currentPage();
  let bp = ui.bp;
  const iframe = h('iframe', { title: 'Preview' });
  const nameEl = h('span', { style: 'font-weight:600' });
  const load = () => {
    nameEl.textContent = page.name;
    iframe.srcdoc = pageHTML(page, { inlineCSS: true, extraHead: PREVIEW_NAV_SCRIPT });
  };
  const setW = () => {
    iframe.style.width = BREAKPOINTS[bp].width ? BREAKPOINTS[bp].width + 'px' : '100%';
    $$('button[data-pbp]', back).forEach((b) => b.classList.toggle('on', b.dataset.pbp === bp));
  };
  const onMsg = (e) => {
    if (e.data && e.data.blockyardEsc) { close(); return; }
    if (!e.data || !e.data.blockyardNav) return;
    const slug = e.data.blockyardNav.replace(/\.html.*$/, '');
    const target = project.pages.find((p) => p.slug === slug);
    if (target) { page = target; load(); }
  };
  const close = () => { window.removeEventListener('message', onMsg); document.removeEventListener('keydown', onEsc, true); back.remove(); };
  const onEsc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const back = h('div', { class: 'preview-back' },
    h('div', { class: 'preview-bar' },
      h('span', { class: 'muted' }, 'Preview ·'), nameEl,
      h('div', { class: 'seg', style: 'display:flex' },
        ...BP_ORDER.map((b) => h('button', { 'data-pbp': b, onclick: () => { bp = b; setW(); } }, BREAKPOINTS[b].label))),
      h('div', { class: 'spacer' }),
      h('button', { class: 'tb-btn', onclick: () => {
        const w = window.open('', '_blank');
        if (w) { w.document.write(pageHTML(page, { inlineCSS: true })); w.document.close(); }
      } }, 'Open in new tab ↗'),
      h('button', { class: 'tb-btn primary', onclick: close }, 'Exit preview (Esc)')),
    h('div', { class: 'preview-stage' }, iframe));
  window.addEventListener('message', onMsg);
  document.addEventListener('keydown', onEsc, true);
  document.body.append(back);
  setW();
  load();
}

function openShortcuts() {
  const rows = [
    ['Delete / Backspace', 'Delete selected element'], ['Ctrl/⌘ + D', 'Duplicate'], ['Ctrl/⌘ + C / V', 'Copy / paste element'],
    ['Ctrl/⌘ + Z', 'Undo'], ['Ctrl/⌘ + Shift + Z, Ctrl + Y', 'Redo'], ['Esc', 'Select parent'],
    ['Alt + ↑ / ↓', 'Move element up / down'], ['Double-click text', 'Edit text inline (Enter to finish, Shift+Enter for new line)'],
    ['↑ / ↓ in a size field', 'Nudge value (Shift ×10, Alt ×0.1)'], ['Click a blue label', 'Reset that style'],
    ['Ctrl/⌘ + S', 'Save now'], ['P', 'Preview'],
  ];
  openModal('Keyboard shortcuts', h('table', { class: 'kbd-table' },
    ...rows.map(([k, d]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, d)))));
}

/* ======================================================================
 * Keyboard
 * ==================================================================== */
function isTyping(e) {
  const t = e.target;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

function onKeyDown(e) {
  if (editing) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === 's') { e.preventDefault(); persist(); toast('Saved'); return; }
  if (isTyping(e)) return;
  if (document.querySelector('.modal-back, .preview-back')) return;
  if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if ((mod && k === 'z' && e.shiftKey) || (mod && k === 'y')) { e.preventDefault(); redo(); }
  else if (mod && k === 'd') { e.preventDefault(); duplicateSelected(); }
  else if (mod && k === 'c') { copySelected(); }
  else if (mod && k === 'v') { e.preventDefault(); paste(); }
  else if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSelected(); }
  else if (k === 'escape') { const s = getSel(); if (s && s.parent) select(s.parent.id, { scroll: true }); }
  else if (e.altKey && k === 'arrowup') { e.preventDefault(); moveSelected(-1); }
  else if (e.altKey && k === 'arrowdown') { e.preventDefault(); moveSelected(1); }
  else if (k === 'p' && !mod && !e.altKey) { openPreview(); }
}

/* ======================================================================
 * Starter template
 * ==================================================================== */
function starterProject() {
  const S = (desktop, tablet = {}, mobile = {}) => ({ desktop, tablet, mobile });
  const pad = (y, x) => ({ 'padding-top': y, 'padding-bottom': y, 'padding-left': x, 'padding-right': x });
  const m0 = { 'margin-top': '0px', 'margin-bottom': '0px' };
  const btnBase = { display: 'inline-block', ...pad('14px', '26px'), 'border-radius': '10px', 'text-decoration': 'none', 'font-weight': '600', transition: 'all 0.2s ease' };

  const classes = {
    body: S({ 'font-family': 'Inter, system-ui, sans-serif', color: '#14151a', 'background-color': '#ffffff', 'line-height': '1.6' }),
    container: S({ 'max-width': '1140px', 'margin-left': 'auto', 'margin-right': 'auto', 'padding-left': '24px', 'padding-right': '24px' }),
    navbar: S({ ...pad('18px', '0px'), 'background-color': '#ffffff', 'box-shadow': '0 1px 0 #eceef3', position: 'sticky', top: '0px', 'z-index': '10' }),
    'nav-inner': S({ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', gap: '24px' }),
    logo: S({ 'font-size': '22px', 'font-weight': '800', 'letter-spacing': '-0.02em', color: '#14151a', 'text-decoration': 'none' }),
    'nav-links': S({ display: 'flex', 'align-items': 'center', gap: '28px' }, {}, { display: 'none' }),
    'nav-link': S({ color: '#4b5060', 'text-decoration': 'none', 'font-weight': '500', 'font-size': '15px' }),
    'button-small': S({ ...btnBase, ...pad('10px', '18px'), 'border-radius': '8px', 'background-color': '#14151a', color: '#ffffff', 'font-size': '14px' }),
    button: S({ ...btnBase, 'background-color': '#4f46e5', color: '#ffffff', 'box-shadow': '0 10px 24px rgba(79,70,229,.25)' }, {}, { 'text-align': 'center' }),
    'button-secondary': S({ ...btnBase, 'background-color': '#ffffff', color: '#14151a', 'border-width': '1px', 'border-style': 'solid', 'border-color': '#dfe2ea' }, {}, { 'text-align': 'center' }),
    'button-light': S({ ...btnBase, 'background-color': '#ffffff', color: '#14151a' }),
    hero: S({ 'padding-top': '110px', 'padding-bottom': '90px', 'background-image': 'radial-gradient(circle at 50% 0%, #eef0ff 0%, #ffffff 60%)' },
      { 'padding-top': '80px' }, { 'padding-top': '56px', 'padding-bottom': '56px' }),
    'hero-inner': S({ display: 'flex', 'flex-direction': 'column', 'align-items': 'center', 'text-align': 'center' }),
    eyebrow: S({ 'margin-top': '0px', 'margin-bottom': '20px', ...pad('6px', '14px'), 'border-radius': '999px', 'background-color': '#eef0ff', color: '#4f46e5', 'font-size': '13px', 'font-weight': '600', 'letter-spacing': '0.04em' }),
    'hero-title': S({ 'margin-top': '0px', 'margin-bottom': '20px', 'max-width': '820px', 'font-size': '64px', 'line-height': '1.05', 'letter-spacing': '-0.035em', 'font-weight': '800' },
      { 'font-size': '48px' }, { 'font-size': '36px' }),
    'hero-sub': S({ 'margin-top': '0px', 'margin-bottom': '36px', 'max-width': '600px', 'font-size': '19px', color: '#5b6070' }, {}, { 'font-size': '17px' }),
    'hero-actions': S({ display: 'flex', gap: '14px', 'justify-content': 'center' }, {}, { 'flex-direction': 'column', width: '100%' }),
    'hero-image': S({ width: '100%', 'margin-top': '64px', 'border-radius': '18px', 'box-shadow': '0 30px 80px rgba(20,21,26,.15)', display: 'block' }, {}, { 'margin-top': '40px', 'border-radius': '12px' }),
    features: S({ 'padding-top': '100px', 'padding-bottom': '100px' }, {}, { 'padding-top': '64px', 'padding-bottom': '64px' }),
    'section-title': S({ 'margin-top': '0px', 'margin-bottom': '12px', 'font-size': '40px', 'letter-spacing': '-0.02em', 'text-align': 'center', 'line-height': '1.15' }, {}, { 'font-size': '30px' }),
    'section-sub': S({ 'margin-top': '0px', 'margin-bottom': '56px', 'text-align': 'center', color: '#5b6070', 'font-size': '18px' }),
    'feature-grid': S({ display: 'grid', 'grid-template-columns': '1fr 1fr 1fr', gap: '24px' }, { 'grid-template-columns': '1fr 1fr' }, { 'grid-template-columns': '1fr' }),
    card: S({ ...pad('32px', '28px'), 'border-radius': '16px', 'background-color': '#f7f8fb', 'border-width': '1px', 'border-style': 'solid', 'border-color': '#eceef3' }),
    'card-icon': S({ 'margin-top': '0px', 'margin-bottom': '16px', 'font-size': '28px' }),
    'card-title': S({ 'margin-top': '0px', 'margin-bottom': '8px', 'font-size': '20px' }),
    'card-text': S({ ...m0, color: '#5b6070' }),
    cta: S({ 'padding-top': '90px', 'padding-bottom': '90px', 'background-color': '#14151a', color: '#ffffff', 'text-align': 'center' }),
    'cta-title': S({ 'margin-top': '0px', 'margin-bottom': '28px', 'font-size': '40px', 'letter-spacing': '-0.02em', 'line-height': '1.15' }, {}, { 'font-size': '30px' }),
    footer: S({ 'padding-top': '32px', 'padding-bottom': '32px', 'box-shadow': 'inset 0 1px 0 #eceef3' }),
    'footer-inner': S({ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', gap: '16px' }, {}, { 'flex-direction': 'column' }),
    'footer-text': S({ ...m0, color: '#7a7f8f', 'font-size': '14px' }),
    'footer-links': S({ display: 'flex', gap: '20px' }),
    prose: S({ 'max-width': '680px', 'margin-left': 'auto', 'margin-right': 'auto', 'margin-top': '0px', 'margin-bottom': '20px', 'font-size': '18px', color: '#3d4150' }),
    'contact-form': S({ display: 'flex', 'flex-direction': 'column', gap: '12px', 'max-width': '520px', 'margin-left': 'auto', 'margin-right': 'auto', 'margin-top': '40px' }),
    'text-field': S({ ...pad('12px', '14px'), 'border-width': '1px', 'border-style': 'solid', 'border-color': '#d1d5db', 'border-radius': '8px', 'font-size': '15px', width: '100%' }),
    'text-area': S({ ...pad('12px', '14px'), 'border-width': '1px', 'border-style': 'solid', 'border-color': '#d1d5db', 'border-radius': '8px', 'font-size': '15px', width: '100%', 'font-family': 'inherit' }),
    'submit-button': S({ ...pad('14px', '22px'), 'background-color': '#4f46e5', color: '#ffffff', 'border-width': '0px', 'border-radius': '8px', 'font-weight': '600', 'font-size': '15px', cursor: 'pointer' }),
  };

  const N = (type, cls, opts = {}, kids) => {
    const def = ELEMENTS[type];
    const n = { id: uid(), type, tag: opts.tag || def.tag, cls };
    if (opts.text != null || def.text != null) n.text = opts.text ?? def.text;
    if (def.attrs || opts.attrs) n.attrs = { ...(def.attrs || {}), ...(opts.attrs || {}) };
    if (def.container) n.children = kids || [];
    return n;
  };
  const navbar = () => N('section', 'navbar', { tag: 'nav' }, [
    N('container', 'container', {}, [N('flex', 'nav-inner', {}, [
      N('link', 'logo', { text: 'Northwind', attrs: { href: 'index.html' } }),
      N('flex', 'nav-links', {}, [
        N('link', 'nav-link', { text: 'Features', attrs: { href: 'index.html#features' } }),
        N('link', 'nav-link', { text: 'About', attrs: { href: 'about.html' } }),
        N('link', 'nav-link', { text: 'Contact', attrs: { href: 'about.html#contact' } }),
      ]),
      N('button', 'button-small', { text: 'Get started', attrs: { href: '#' } }),
    ])]),
  ]);
  const footer = () => N('section', 'footer', { tag: 'footer' }, [
    N('container', 'container', {}, [N('flex', 'footer-inner', {}, [
      N('paragraph', 'footer-text', { text: '© 2026 Northwind Studio. All rights reserved.' }),
      N('flex', 'footer-links', {}, [
        N('link', 'nav-link', { text: 'Twitter', attrs: { href: '#' } }),
        N('link', 'nav-link', { text: 'GitHub', attrs: { href: '#' } }),
        N('link', 'nav-link', { text: 'Privacy', attrs: { href: '#' } }),
      ]),
    ])]),
  ]);
  const card = (icon, title, text) => N('div', 'card', {}, [
    N('paragraph', 'card-icon', { text: icon }),
    N('heading', 'card-title', { tag: 'h3', text: title }),
    N('paragraph', 'card-text', { text }),
  ]);

  const home = N('body', 'body', {}, [
    navbar(),
    N('section', 'hero', { tag: 'header' }, [N('container', 'container', {}, [
      N('div', 'hero-inner', {}, [
        N('paragraph', 'eyebrow', { text: 'NEW · VISUAL WEBSITE BUILDER' }),
        N('heading', 'hero-title', { tag: 'h1', text: 'Design and launch beautiful websites — no code required' }),
        N('paragraph', 'hero-sub', { text: 'Drag, drop and style real HTML & CSS visually. Every page is responsive and exports as clean, production-ready code.' }),
        N('flex', 'hero-actions', {}, [
          N('button', 'button', { text: 'Start building', attrs: { href: '#' } }),
          N('button', 'button-secondary', { text: 'See features', attrs: { href: '#features' } }),
        ]),
      ]),
      N('image', 'hero-image', { attrs: { src: PLACEHOLDER_IMG, alt: 'Product screenshot' } }),
    ])]),
    N('section', 'features', { attrs: { id: 'features' } }, [N('container', 'container', {}, [
      N('heading', 'section-title', { text: 'Everything you need to ship' }),
      N('paragraph', 'section-sub', { text: 'A professional toolkit for designers, marketers and developers.' }),
      N('grid', 'feature-grid', {}, [
        card('🎨', 'Visual styling', 'Control layout, spacing, typography and color with a real CSS box model.'),
        card('📱', 'Responsive by default', 'Tweak styles per breakpoint. Desktop styles cascade down to tablet and mobile.'),
        card('⚡', 'Clean code export', 'Download semantic HTML and a single stylesheet. Host it anywhere.'),
        card('🧩', 'Reusable classes', 'Style once, reuse everywhere. Change a class and every element updates.'),
        card('🗂', 'Multiple pages', 'Build full sites with linked pages, SEO titles and descriptions.'),
        card('↩️', 'Unlimited undo', 'Experiment freely with full undo/redo history and autosave.'),
      ]),
    ])]),
    N('section', 'cta', {}, [N('container', 'container', {}, [
      N('heading', 'cta-title', { text: 'Ready to build something great?' }),
      N('button', 'button-light', { text: 'Create your site', attrs: { href: 'about.html#contact' } }),
    ])]),
    footer(),
  ]);

  const about = N('body', 'body', {}, [
    navbar(),
    N('section', 'hero', { tag: 'header' }, [N('container', 'container', {}, [
      N('div', 'hero-inner', {}, [
        N('paragraph', 'eyebrow', { text: 'ABOUT US' }),
        N('heading', 'hero-title', { tag: 'h1', text: 'We help teams build for the web, faster' }),
      ]),
      N('paragraph', 'prose', { text: 'Northwind Studio is a small team of designers and engineers. We believe great websites should be easy to make and easy to own — which is why everything you build exports to plain, standards-based HTML and CSS.' }),
      N('paragraph', 'prose', { text: 'Edit this page, add new sections from the Add panel, or create entirely new pages from the Pages tab.' }),
    ])]),
    N('section', 'features', { attrs: { id: 'contact' } }, [N('container', 'container', {}, [
      N('heading', 'section-title', { text: 'Get in touch' }),
      N('form', 'contact-form', {}, [
        N('input', 'text-field', { attrs: { type: 'text', name: 'name', placeholder: 'Your name' } }),
        N('input', 'text-field', { attrs: { type: 'email', name: 'email', placeholder: 'you@company.com', required: 'true' } }),
        N('textarea', 'text-area', { attrs: { name: 'message', placeholder: 'How can we help?', rows: '5' } }),
        N('formbutton', 'submit-button', { text: 'Send message' }),
      ]),
    ])]),
    footer(),
  ]);

  return {
    pages: [
      { id: uid(), name: 'Home', slug: 'index', title: 'Northwind — Build websites visually', description: 'A visual website builder demo.', root: home },
      { id: uid(), name: 'About', slug: 'about', title: 'About — Northwind', description: '', root: about },
    ],
    classes,
  };
}

function blankProject() {
  return {
    pages: [{ id: uid(), name: 'Home', slug: 'index', title: 'My website', description: '', root: { id: uid(), type: 'body', tag: 'body', cls: 'body', children: [] } }],
    classes: { body: { desktop: { 'font-family': 'Inter, system-ui, sans-serif', color: '#14151a' }, tablet: {}, mobile: {} } },
  };
}

function replaceProject(p, msg) {
  mutate(() => {
    project = p;
    ui.pageId = p.pages[0].id;
    ui.selectedId = null;
  });
  if (msg) toast(msg);
}

/* ======================================================================
 * Boot
 * ==================================================================== */
function boot() {
  project = loadProject();
  ui.pageId = project.pages[0].id;

  renderAddPanel();
  bindNavigator();

  $$('#left-tabs button').forEach((b) => b.addEventListener('click', () => setLeftTab(b.dataset.tab)));
  $$('#right-tabs button').forEach((b) => b.addEventListener('click', () => setRightTab(b.dataset.tab)));
  $$('#bp-group button').forEach((b) => b.addEventListener('click', () => setBreakpoint(b.dataset.bp)));
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);
  $('#btn-preview').addEventListener('click', openPreview);
  $('#btn-export').addEventListener('click', openExport);
  $('#btn-add-page').addEventListener('click', addPage);
  $('#page-select').addEventListener('change', (e) => openPage(e.target.value));

  const menu = $('#menu');
  $('#btn-menu').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', () => (menu.hidden = true));
  menu.addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    if (!act) return;
    menu.hidden = true;
    if (act === 'new' && confirm('Start a new blank site? (You can undo this.)')) replaceProject(blankProject(), 'New blank site');
    if (act === 'template' && confirm('Replace the current site with the starter template? (You can undo this.)')) replaceProject(starterProject(), 'Starter template loaded');
    if (act === 'save-json') download('blockyard-project.json', JSON.stringify(project, null, 2), 'application/json');
    if (act === 'load-json') $('#file-json').click();
    if (act === 'cleanup') cleanupClasses();
    if (act === 'shortcuts') openShortcuts();
  });

  $('#file-json').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const p = JSON.parse(await f.text());
      if (!Array.isArray(p.pages) || !p.pages.length || !p.classes) throw new Error('bad');
      replaceProject(p, `Opened ${f.name}`);
    } catch { toast('That file is not a Blockyard project'); }
  });
  $('#file-image').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) toast('Large image — consider hosting it and using a URL instead');
    const reader = new FileReader();
    reader.onload = () => updateNode((n) => { if (n.type === 'image') { n.attrs = n.attrs || {}; n.attrs.src = reader.result; } });
    reader.readAsDataURL(f);
  });

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('dragend', endDrag);
  window.addEventListener('resize', updateOverlays);

  setBreakpoint('desktop');
  setLeftTab('add');
  initCanvas();
}

boot();
