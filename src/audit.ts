/* Audit: accessibility, SEO and performance checks for the page open in the Designer. */
import { currentPage, walkTree } from './model';
import type { Node, Project, UIState } from './types';

export type Severity = 'error' | 'warning' | 'info';
export interface Issue { severity: Severity; category: 'Accessibility' | 'SEO' | 'Performance'; message: string; nodeId?: string; fix?: string }

const GENERIC_LINK = /^(click here|here|read more|more|learn more|link)$/i;

function parseColor(c: string): [number, number, number, number] | null {
  const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
  return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null;
}
const lum = ([r, g, b]: number[]) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const contrastRatio = (a: number[], b: number[]) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

/** The solid background behind an element, or null when it sits on an image or gradient. */
function backgroundOf(el: Element, win: Window): number[] | null {
  for (let e: Element | null = el; e; e = e.parentElement) {
    const cs = win.getComputedStyle(e);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
    const c = parseColor(cs.backgroundColor);
    if (c && c[3] > 0.95) return c.slice(0, 3);
  }
  return [255, 255, 255];
}

export function runAudit(p: Project, ui: Pick<UIState, 'pageId'>, doc: Document | null): Issue[] {
  const issues: Issue[] = [];
  const page = currentPage(p, ui);
  const add = (i: Issue) => issues.push(i);

  // Page nodes, with component instances expanded (their issues point at the instance).
  const nodes: { n: Node; at: string }[] = [];
  const visit = (root: Node, at?: string) => walkTree(root, (n) => {
    nodes.push({ n, at: at || n.id });
    if (n.type === 'symbol' && p.components[n.componentId || '']) visit(p.components[n.componentId!].root, at || n.id);
  });
  visit(page.root);

  /* Accessibility */
  const ids = new Set(nodes.map(({ n }) => n.attrs?.id).filter(Boolean));
  const labelled = new Set(nodes.filter(({ n }) => n.type === 'label').map(({ n }) => n.attrs?.for).filter(Boolean));
  let h1 = 0, lastLevel = 0;
  for (const { n, at } of nodes) {
    const a = n.attrs || {};
    if (n.type === 'image' && !n.bind?.src && !a.alt && a['data-decorative'] !== 'true' && a['aria-hidden'] !== 'true') {
      add({ severity: 'error', category: 'Accessibility', message: 'Image has no alt text', nodeId: at, fix: 'Settings → Image: add alt text or mark it decorative.' });
    }
    if ((n.type === 'input' || n.type === 'textarea' || n.type === 'select') && !a['aria-label'] && !(a.id && labelled.has(a.id))) {
      add({ severity: 'error', category: 'Accessibility', message: `${n.type === 'select' ? 'Select' : 'Field'} “${a.name || a.placeholder || 'unnamed'}” has no label`, nodeId: at,
        fix: 'Add a Label element pointing at it, or set an ARIA label. Placeholders are not labels.' });
    }
    if ((n.tag === 'a' || n.tag === 'button') && n.type !== 'navbutton') {
      const text = n.text?.trim() || '';
      const inner = !text && n.children?.some((c) => walkHasName(c));
      if (!text && !a['aria-label'] && !inner && !n.bind?.text) add({ severity: 'error', category: 'Accessibility', message: `${n.tag === 'a' ? 'Link' : 'Button'} has no accessible name`, nodeId: at, fix: 'Give it visible text or an ARIA label.' });
      else if (GENERIC_LINK.test(text) && !a['aria-label']) add({ severity: 'warning', category: 'Accessibility', message: `“${text}” doesn't say where the link goes`, nodeId: at, fix: 'Use descriptive link text, or add an ARIA label like “Read more about pricing”.' });
      if (a.href === '#' && n.tag === 'a') add({ severity: 'info', category: 'Accessibility', message: `“${text || 'Link'}” points to #`, nodeId: at, fix: 'Set a real URL in Settings → Link.' });
    }
    if (n.type === 'heading' || /^h[1-6]$/.test(n.tag)) {
      const level = Number(n.tag.slice(1));
      if (level === 1) h1++;
      if (lastLevel && level > lastLevel + 1) add({ severity: 'warning', category: 'Accessibility', message: `Heading jumps from H${lastLevel} to H${level}`, nodeId: at, fix: `Use H${lastLevel + 1}, or style a lower level to look the way you want.` });
      lastLevel = level;
    }
    if (n.type === 'video' && !a.title) add({ severity: 'warning', category: 'Accessibility', message: 'Video embed has no title', nodeId: at, fix: 'Settings → Accessibility → Tooltip (title) describes the video to screen readers.' });
    if (a['aria-describedby'] && !ids.has(a['aria-describedby'])) add({ severity: 'warning', category: 'Accessibility', message: `“Described by” points to a missing ID (${a['aria-describedby']})`, nodeId: at });
    if (a['aria-hidden'] === 'true' && (n.tag === 'a' || n.tag === 'button' || n.type === 'input')) add({ severity: 'error', category: 'Accessibility', message: 'A focusable element is hidden from screen readers', nodeId: at, fix: 'Remove “Hide from screen readers”, or take it out of the tab order.' });
  }
  if (h1 === 0) add({ severity: 'warning', category: 'Accessibility', message: 'The page has no H1 heading', fix: 'Make the main page title an H1 (Settings → Tag).' });
  if (h1 > 1) add({ severity: 'warning', category: 'SEO', message: `The page has ${h1} H1 headings`, fix: 'Use one H1 for the page title and H2–H6 below it.' });
  if (!nodes.some(({ n }) => n.tag === 'main' || n.attrs?.role === 'main')) add({ severity: 'info', category: 'Accessibility', message: 'No main landmark', fix: 'Add a Main Landmark (Add → Accessibility) around the page content, plus a Skip Link to it.' });
  if (!p.settings?.lang) add({ severity: 'info', category: 'Accessibility', message: 'Site language is not set (defaults to English)', fix: 'Site settings → Language.' });

  // Color contrast from the rendered canvas.
  if (doc?.defaultView) {
    const win = doc.defaultView;
    const reported = new Set<string>();
    doc.querySelectorAll('[data-nid]').forEach((el) => {
      const id = (el as HTMLElement).dataset.nid!;
      if (reported.has(id) || !el.textContent?.trim() || el.children.length > 0 && !Array.from(el.childNodes).some((c) => c.nodeType === 3 && c.textContent?.trim())) return;
      const cs = win.getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[data-editor-sr]')) return;
      const fg = parseColor(cs.color);
      const bg = backgroundOf(el, win);
      if (!fg || !bg) return;
      const ratio = contrastRatio(fg.slice(0, 3), bg);
      const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      const min = large ? 3 : 4.5;
      if (ratio < min) {
        reported.add(id);
        add({ severity: 'error', category: 'Accessibility', message: `Low contrast text (${ratio.toFixed(2)}:1, needs ${min}:1): “${el.textContent!.trim().slice(0, 40)}”`, nodeId: id,
          fix: 'Darken the text or change the background in Style → Typography / Backgrounds.' });
      }
    });
  }

  /* SEO */
  if (!page.collectionId && !page.variantOf) {
    const tl = (page.title || '').length, dl = (page.description || '').length;
    if (!tl) add({ severity: 'error', category: 'SEO', message: 'Page has no SEO title', fix: 'Page settings → SEO title.' });
    else if (tl > 60) add({ severity: 'warning', category: 'SEO', message: `SEO title is ${tl} characters (search engines show about 60)` });
    if (!dl) add({ severity: 'warning', category: 'SEO', message: 'Page has no meta description', fix: 'Page settings → Description (about 150 characters).' });
    else if (dl > 160) add({ severity: 'info', category: 'SEO', message: `Meta description is ${dl} characters (about 160 are shown)` });
    if (!page.seo?.ogImage && !p.settings?.ogImage) add({ severity: 'info', category: 'SEO', message: 'No social share image', fix: 'Page settings → OG image, or a default in Site settings.' });
    if (page.slug === 'index' && page.seo?.noindex) add({ severity: 'error', category: 'SEO', message: 'The home page is hidden from search engines' });
  }

  /* Performance */
  for (const { n, at } of nodes) {
    const src = n.attrs?.src || n.attrs?.href || '';
    if (src.startsWith('data:') && src.length > 150_000) {
      add({ severity: 'warning', category: 'Performance', message: `Image embedded in the page (${Math.round(src.length / 1365)} KB)`, nodeId: at, fix: 'Re-upload it while signed in so it is stored as a cached asset, or use an image URL.' });
    }
    if (n.type === 'embed' && /<script[^>]+src=/i.test(n.html || '')) add({ severity: 'info', category: 'Performance', message: 'Code embed loads an external script', nodeId: at, fix: 'Add async or defer to third-party scripts when you can.' });
  }
  const fonts = new Set(Object.values(p.classes).flatMap((c) => Object.values(c).map((st) => st['font-family']).filter(Boolean)));
  if (fonts.size > 3) add({ severity: 'warning', category: 'Performance', message: `${fonts.size} font families are used`, fix: 'Two or three families load faster and look more consistent.' });
  const rank = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function walkHasName(n: Node): boolean {
  let named = false;
  walkTree(n, (x) => { if (x.text?.trim() || x.attrs?.alt || x.attrs?.['aria-label']) named = true; });
  return named;
}
