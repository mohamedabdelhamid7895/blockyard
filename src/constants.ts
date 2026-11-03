import type { Binding, BP, PseudoState, StyleMap } from './types';

export const STORAGE_KEY = 'blockyard.project.v2';
export const LEGACY_STORAGE_KEY = 'blockyard.project.v1';

export const BREAKPOINTS: Record<BP, { label: string; width: number | null; media: string | null }> = {
  desktop: { label: 'Desktop', width: null, media: null },
  tablet: { label: 'Tablet', width: 768, media: '(max-width: 991px)' },
  landscape: { label: 'Mobile landscape', width: 568, media: '(max-width: 767px)' },
  mobile: { label: 'Mobile portrait', width: 375, media: '(max-width: 479px)' },
};
export const BP_ORDER: BP[] = ['desktop', 'tablet', 'landscape', 'mobile'];

export const STATES: { id: PseudoState; label: string; pseudo: string }[] = [
  { id: 'none', label: 'None', pseudo: '' },
  { id: 'hover', label: 'Hover', pseudo: ':hover' },
  { id: 'pressed', label: 'Pressed', pseudo: ':active' },
  { id: 'focused', label: 'Focused', pseudo: ':focus' },
];

export const PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dbe7fe"/><stop offset="1" stop-color="#b8d0fc"/></linearGradient></defs>' +
  '<rect width="1200" height="675" fill="url(#g)"/><g fill="#146ef5" opacity=".45"><circle cx="470" cy="260" r="52"/>' +
  '<path d="M330 500l170-190 110 120 80-80 180 150z"/></g></svg>');

export const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;700&family=Poppins:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;700&family=Playfair+Display:wght@400;700&display=swap';
export const GOOGLE_FONT_NAMES = ['Inter', 'DM Sans', 'Poppins', 'Space Grotesk', 'Playfair Display'];

export const BASE_CSS = `*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1b1f; line-height: 1.5; }
img { max-width: 100%; vertical-align: middle; }
`;

export const TEXT_TYPES = new Set(['heading', 'paragraph', 'link', 'button', 'listitem', 'formbutton', 'quote', 'textblock']);
export const VOID_TAGS = new Set(['img', 'input', 'hr', 'br']);
const BLOCK_TAGS = ['div', 'section', 'header', 'footer', 'nav', 'main', 'article', 'aside'];

/** A child created along with an element: a type, optionally with a tag and a CMS binding. */
export type KidSpec = string | { type: string; tag?: string; bind?: Binding };

export interface ElementDef {
  label: string;
  tag: string;
  group?: 'Layout' | 'Basic' | 'Media' | 'Forms' | 'CMS';
  container?: boolean;
  hidden?: boolean;
  tags?: string[];
  cls?: string;
  text?: string;
  html?: string;
  attrs?: Record<string, string>;
  style?: StyleMap;
  tablet?: StyleMap;
  mobile?: StyleMap;
  kids?: KidSpec[];
}

const pad = (y: string, x: string) => ({ 'padding-top': y, 'padding-bottom': y, 'padding-left': x, 'padding-right': x });
const field = { ...pad('10px', '12px'), 'border-width': '1px', 'border-style': 'solid', 'border-color': '#d1d5db', 'border-radius': '8px', 'font-size': '15px', width: '100%' };

export const ELEMENTS: Record<string, ElementDef> = {
  body: { label: 'Body', tag: 'body', container: true, hidden: true },
  section: { label: 'Section', tag: 'section', container: true, group: 'Layout', tags: BLOCK_TAGS,
    style: { 'padding-top': '80px', 'padding-bottom': '80px' } },
  container: { label: 'Container', tag: 'div', container: true, group: 'Layout', tags: BLOCK_TAGS,
    style: { 'max-width': '1140px', 'margin-left': 'auto', 'margin-right': 'auto', 'padding-left': '24px', 'padding-right': '24px' } },
  div: { label: 'Div Block', tag: 'div', container: true, group: 'Layout', tags: BLOCK_TAGS, cls: 'div-block' },
  flex: { label: 'Flex Row', tag: 'div', container: true, group: 'Layout', tags: BLOCK_TAGS, cls: 'flex-row',
    style: { display: 'flex', gap: '20px', 'align-items': 'center' } },
  grid: { label: 'Grid', tag: 'div', container: true, group: 'Layout', tags: BLOCK_TAGS,
    style: { display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '20px' }, kids: ['div', 'div'] },
  columns: { label: '3 Columns', tag: 'div', container: true, group: 'Layout', tags: BLOCK_TAGS,
    style: { display: 'grid', 'grid-template-columns': '1fr 1fr 1fr', gap: '24px' }, mobile: { 'grid-template-columns': '1fr' },
    kids: ['div', 'div', 'div'] },
  heading: { label: 'Heading', tag: 'h2', text: 'Heading', group: 'Basic', tags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    style: { 'margin-top': '0px', 'margin-bottom': '16px' } },
  paragraph: { label: 'Paragraph', tag: 'p', group: 'Basic', tags: ['p', 'div', 'span'],
    text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse varius enim in eros elementum tristique.',
    style: { 'margin-top': '0px', 'margin-bottom': '16px' } },
  textblock: { label: 'Text Block', tag: 'div', text: 'This is some text inside of a div block.', group: 'Basic', cls: 'text-block' },
  link: { label: 'Text Link', tag: 'a', text: 'Text link', attrs: { href: '#' }, group: 'Basic', cls: 'text-link',
    style: { color: '#146ef5' } },
  button: { label: 'Button', tag: 'a', text: 'Button', attrs: { href: '#' }, group: 'Basic',
    style: { display: 'inline-block', ...pad('12px', '22px'), 'background-color': '#146ef5', color: '#ffffff', 'border-radius': '8px',
      'text-decoration': 'none', 'font-weight': '600' } },
  quote: { label: 'Block Quote', tag: 'blockquote', text: 'Design is not just what it looks like — design is how it works.',
    group: 'Basic', cls: 'block-quote',
    style: { 'margin-top': '0px', 'margin-bottom': '16px', 'margin-left': '0px', 'margin-right': '0px', 'padding-left': '20px', 'border-left-width': '4px', 'border-left-style': 'solid',
      'border-left-color': '#146ef5', 'font-size': '20px' } },
  list: { label: 'List', tag: 'ul', container: true, group: 'Basic', tags: ['ul', 'ol'], kids: ['listitem', 'listitem', 'listitem'] },
  listitem: { label: 'List Item', tag: 'li', text: 'List item', hidden: true, cls: 'list-item' },
  divider: { label: 'Divider', tag: 'hr', group: 'Basic',
    style: { 'border-style': 'solid', 'border-width': '0px', 'border-top-width': '1px', 'border-color': '#e5e7eb', 'margin-top': '24px', 'margin-bottom': '24px' } },
  image: { label: 'Image', tag: 'img', attrs: { src: PLACEHOLDER_IMG, alt: '' }, group: 'Media',
    style: { 'max-width': '100%', display: 'block' } },
  video: { label: 'Video', tag: 'iframe', group: 'Media',
    attrs: { src: 'https://www.youtube.com/embed/aqz-KE-bpKQ', allowfullscreen: 'true', title: 'Video' },
    style: { width: '100%', 'aspect-ratio': '16 / 9', 'border-width': '0px', 'border-radius': '12px', display: 'block' } },
  embed: { label: 'Code Embed', tag: 'div', html: '<p style="padding:16px;background:#f3f4f6;margin:0">Custom HTML embed</p>',
    group: 'Media', cls: 'html-embed' },
  form: { label: 'Form Block', tag: 'form', container: true, group: 'Forms', attrs: { action: '', method: 'post' },
    style: { display: 'flex', 'flex-direction': 'column', gap: '12px', 'max-width': '480px' }, kids: ['input', 'textarea', 'formbutton'] },
  input: { label: 'Input', tag: 'input', group: 'Forms', cls: 'text-field',
    attrs: { type: 'text', name: 'name', placeholder: 'Your name' }, style: field },
  textarea: { label: 'Text Area', tag: 'textarea', group: 'Forms', cls: 'text-area',
    attrs: { name: 'message', placeholder: 'Your message', rows: '4' }, style: { ...field, 'font-family': 'inherit' } },
  formbutton: { label: 'Submit Button', tag: 'button', text: 'Submit', group: 'Forms', cls: 'submit-button', attrs: { type: 'submit' },
    style: { ...pad('12px', '22px'), 'background-color': '#14151a', color: '#ffffff', 'border-width': '0px', 'border-radius': '8px',
      'font-weight': '600', 'font-size': '15px', cursor: 'pointer' } },
  collectionlist: { label: 'Collection List', tag: 'div', container: true, group: 'CMS', cls: 'collection-list',
    style: { display: 'grid', 'grid-template-columns': '1fr 1fr 1fr', gap: '24px' }, tablet: { 'grid-template-columns': '1fr 1fr' },
    mobile: { 'grid-template-columns': '1fr' },
    kids: [{ type: 'collectionitem' }] },
  collectionitem: { label: 'Collection Item', tag: 'div', container: true, hidden: true, cls: 'collection-item',
    kids: [{ type: 'heading', tag: 'h3', bind: { text: 'name' } }, { type: 'link', bind: { href: '__url' } }] },
  symbol: { label: 'Component', tag: 'div', hidden: true },
};

export const ADD_GROUPS = ['Layout', 'Basic', 'Media', 'Forms', 'CMS'] as const;

export const FONTS: [string, string][] = [
  ['Inter, system-ui, sans-serif', 'Inter'], ['"DM Sans", sans-serif', 'DM Sans'], ['Poppins, sans-serif', 'Poppins'],
  ['"Space Grotesk", sans-serif', 'Space Grotesk'], ['"Playfair Display", serif', 'Playfair Display'],
  ['Georgia, serif', 'Georgia'], ['system-ui, sans-serif', 'System UI'], ['ui-monospace, Menlo, monospace', 'Monospace'],
];
export const WEIGHTS: [string, string][] = [['100', '100 - Thin'], ['200', '200 - Extra Light'], ['300', '300 - Light'],
  ['400', '400 - Normal'], ['500', '500 - Medium'], ['600', '600 - Semi Bold'], ['700', '700 - Bold'], ['800', '800 - Extra Bold'],
  ['900', '900 - Black']];
