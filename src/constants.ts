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
export type KidSpec = string | { type: string; tag?: string; bind?: Binding; text?: string; attrs?: Record<string, string>; kids?: KidSpec[] };

export interface ElementDef {
  label: string;
  tag: string;
  group?: 'Layout' | 'Basic' | 'Media' | 'Forms' | 'Components' | 'Accessibility' | 'CMS';
  options?: string[];
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

  /* Structure */
  linkblock: { label: 'Link Block', tag: 'a', container: true, group: 'Layout', cls: 'link-block', attrs: { href: '#' },
    style: { display: 'block', color: 'inherit', 'text-decoration': 'none' } },
  main: { label: 'Main Landmark', tag: 'main', container: true, group: 'Accessibility', cls: 'main', attrs: { id: 'main' } },

  /* Text */
  richtext: { label: 'Rich Text', tag: 'div', group: 'Basic', cls: 'rich-text',
    html: '<h2>Rich text heading</h2><p>Double-click to edit. Use <strong>bold</strong>, <em>italic</em> and <a href="#">links</a>.</p><ul><li>First point</li><li>Second point</li></ul>' },

  /* Forms */
  label: { label: 'Label', tag: 'label', text: 'Label', group: 'Forms', cls: 'field-label',
    style: { display: 'block', 'margin-bottom': '6px', 'font-size': '14px', 'font-weight': '600' } },
  select: { label: 'Select', tag: 'select', group: 'Forms', cls: 'select-field', attrs: { name: 'choice' },
    options: ['Choose one…', 'First option', 'Second option'], style: { ...field, 'background-color': '#ffffff' } },
  checkbox: { label: 'Checkbox', tag: 'label', text: 'I agree to the terms', group: 'Forms', cls: 'checkbox-field', attrs: { name: 'agree' },
    style: { display: 'flex', gap: '8px', 'align-items': 'center', 'font-size': '15px' } },
  radio: { label: 'Radio Button', tag: 'label', text: 'Option one', group: 'Forms', cls: 'radio-field', attrs: { name: 'choice', value: 'option-one' },
    style: { display: 'flex', gap: '8px', 'align-items': 'center', 'font-size': '15px' } },

  /* Components */
  navbar: { label: 'Navbar', tag: 'nav', container: true, group: 'Components', cls: 'navbar', attrs: { 'aria-label': 'Main' },
    style: { display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center', 'justify-content': 'space-between', gap: '16px', ...pad('16px', '24px') },
    kids: [{ type: 'link', text: 'Brand', attrs: { href: 'index.html' } }, 'navmenu', 'navbutton'] },
  navmenu: { label: 'Nav Menu', tag: 'div', container: true, hidden: true, cls: 'nav-menu',
    style: { display: 'flex', 'align-items': 'center', gap: '24px' },
    tablet: { 'flex-basis': '100%', 'flex-direction': 'column', 'align-items': 'flex-start', gap: '12px', 'padding-top': '12px' },
    kids: [{ type: 'link', text: 'Home', attrs: { href: 'index.html' } }, { type: 'link', text: 'About', attrs: { href: '#' } }, { type: 'link', text: 'Contact', attrs: { href: '#' } }] },
  navbutton: { label: 'Menu Button', tag: 'button', hidden: true, cls: 'menu-button', attrs: { type: 'button', 'aria-label': 'Open menu' },
    style: { 'background-color': 'transparent', 'border-width': '0px', ...pad('8px', '8px'), cursor: 'pointer', color: 'inherit' } },
  tabs: { label: 'Tabs', tag: 'div', container: true, group: 'Components', cls: 'tabs', attrs: { 'data-current': '0' },
    kids: ['tabsmenu', 'tabscontent'] },
  tabsmenu: { label: 'Tabs Menu', tag: 'div', container: true, hidden: true, cls: 'tabs-menu',
    style: { display: 'flex', gap: '4px', 'border-bottom-width': '1px', 'border-bottom-style': 'solid', 'border-bottom-color': '#e5e7eb' },
    kids: [{ type: 'tablink', text: 'Tab 1' }, { type: 'tablink', text: 'Tab 2' }, { type: 'tablink', text: 'Tab 3' }] },
  tablink: { label: 'Tab Link', tag: 'button', text: 'Tab', hidden: true, cls: 'tab-link', attrs: { type: 'button' },
    style: { ...pad('10px', '16px'), 'background-color': 'transparent', 'border-width': '0px', cursor: 'pointer', 'font-weight': '600', 'font-size': '15px', color: 'inherit' } },
  tabscontent: { label: 'Tabs Content', tag: 'div', container: true, hidden: true, cls: 'tabs-content',
    kids: [{ type: 'tabpane', kids: [{ type: 'paragraph', text: 'Content for the first tab.' }] },
      { type: 'tabpane', kids: [{ type: 'paragraph', text: 'Content for the second tab.' }] },
      { type: 'tabpane', kids: [{ type: 'paragraph', text: 'Content for the third tab.' }] }] },
  tabpane: { label: 'Tab Pane', tag: 'div', container: true, hidden: true, cls: 'tab-pane', style: { 'padding-top': '20px', 'padding-bottom': '20px' } },
  accordion: { label: 'Accordion', tag: 'details', container: true, group: 'Components', cls: 'accordion',
    style: { 'border-bottom-width': '1px', 'border-bottom-style': 'solid', 'border-bottom-color': '#e5e7eb', 'padding-top': '16px', 'padding-bottom': '16px' },
    kids: [{ type: 'summary', text: 'What is your question?' }, { type: 'paragraph', text: 'The answer goes here. Accordions use native HTML, so they work with keyboards and screen readers.' }] },
  summary: { label: 'Accordion Toggle', tag: 'summary', text: 'Question', hidden: true, cls: 'accordion-toggle', style: { 'font-weight': '600', 'font-size': '18px' } },
  dropdown: { label: 'Dropdown', tag: 'details', container: true, group: 'Components', cls: 'dropdown', style: { position: 'relative', display: 'inline-block' },
    kids: [{ type: 'summary', text: 'Dropdown' }, 'dropdownlist'] },
  dropdownlist: { label: 'Dropdown List', tag: 'div', container: true, hidden: true, cls: 'dropdown-list',
    style: { position: 'absolute', top: '100%', left: '0px', 'min-width': '180px', display: 'flex', 'flex-direction': 'column', ...pad('8px', '8px'),
      'background-color': '#ffffff', 'border-radius': '8px', 'box-shadow': '0 10px 30px rgba(0,0,0,.12)', 'z-index': '20' },
    kids: [{ type: 'link', text: 'Link one' }, { type: 'link', text: 'Link two' }, { type: 'link', text: 'Link three' }] },
  slider: { label: 'Slider', tag: 'div', container: true, group: 'Components', cls: 'slider', style: { position: 'relative' },
    kids: ['slidertrack', { type: 'sliderarrow', text: '‹', attrs: { 'aria-label': 'Previous slide', 'data-dir': 'prev' } },
      { type: 'sliderarrow', text: '›', attrs: { 'aria-label': 'Next slide', 'data-dir': 'next' } }] },
  slidertrack: { label: 'Slider Track', tag: 'div', container: true, hidden: true, cls: 'slider-track',
    kids: [{ type: 'slide', kids: [{ type: 'heading', text: 'Slide one' }] }, { type: 'slide', kids: [{ type: 'heading', text: 'Slide two' }] },
      { type: 'slide', kids: [{ type: 'heading', text: 'Slide three' }] }] },
  slide: { label: 'Slide', tag: 'div', container: true, hidden: true, cls: 'slide',
    style: { 'min-height': '300px', ...pad('48px', '64px'), 'background-color': '#eef2ff', display: 'flex', 'align-items': 'center', 'justify-content': 'center' } },
  sliderarrow: { label: 'Slider Arrow', tag: 'button', text: '›', hidden: true, cls: 'slider-arrow', attrs: { type: 'button' },
    style: { position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: '44px', height: '44px', 'border-radius': '50%', 'border-width': '0px',
      'background-color': '#ffffff', 'box-shadow': '0 4px 14px rgba(0,0,0,.15)', 'font-size': '24px', cursor: 'pointer' } },
  lightbox: { label: 'Lightbox', tag: 'a', container: true, group: 'Media', cls: 'lightbox-link', attrs: { href: PLACEHOLDER_IMG, 'aria-label': 'Open image' },
    style: { display: 'block' }, kids: ['image'] },
  map: { label: 'Map', tag: 'iframe', group: 'Media', cls: 'map', attrs: { 'data-address': 'Brandenburg Gate, Berlin', title: 'Map' },
    style: { width: '100%', height: '360px', 'border-width': '0px', 'border-radius': '12px', display: 'block' } },
  bgvideo: { label: 'Background Video', tag: 'div', container: true, group: 'Media', cls: 'background-video',
    attrs: { 'data-video': 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' },
    style: { 'min-height': '420px', display: 'flex', 'align-items': 'center', 'justify-content': 'center', color: '#ffffff', 'background-color': '#111111' },
    kids: [{ type: 'heading', text: 'Background video' }] },
  icon: { label: 'Icon', tag: 'span', group: 'Media', cls: 'icon', attrs: { 'data-icon': 'star' },
    style: { display: 'inline-flex', width: '32px', height: '32px', color: '#146ef5' } },

  /* Accessibility */
  skiplink: { label: 'Skip Link', tag: 'a', text: 'Skip to main content', group: 'Accessibility', cls: 'skip-link', attrs: { href: '#main' },
    style: { ...pad('10px', '16px'), 'background-color': '#111111', color: '#ffffff', 'border-radius': '8px', 'text-decoration': 'none', 'font-weight': '600' } },
  srtext: { label: 'Screen Reader Text', tag: 'span', text: 'Text only screen readers announce', group: 'Accessibility', cls: 'sr-text',
    style: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', 'white-space': 'nowrap' } },
  a11ywidget: { label: 'Accessibility Widget', tag: 'div', group: 'Accessibility', cls: 'a11y-widget',
    attrs: { 'data-position': 'bottom-right', 'data-color': '#146ef5', 'data-label': 'Accessibility',
      'data-features': 'text,contrast,dark,grayscale,links,readable,spacing,animations,cursor,guide,images,speak' } },
};

export const ADD_GROUPS = ['Layout', 'Basic', 'Media', 'Forms', 'Components', 'Accessibility', 'CMS'] as const;

export const FONTS: [string, string][] = [
  ['Inter, system-ui, sans-serif', 'Inter'], ['"DM Sans", sans-serif', 'DM Sans'], ['Poppins, sans-serif', 'Poppins'],
  ['"Space Grotesk", sans-serif', 'Space Grotesk'], ['"Playfair Display", serif', 'Playfair Display'],
  ['Georgia, serif', 'Georgia'], ['system-ui, sans-serif', 'System UI'], ['ui-monospace, Menlo, monospace', 'Monospace'],
];
export const WEIGHTS: [string, string][] = [['100', '100 - Thin'], ['200', '200 - Extra Light'], ['300', '300 - Light'],
  ['400', '400 - Normal'], ['500', '500 - Medium'], ['600', '600 - Semi Bold'], ['700', '700 - Bold'], ['800', '800 - Extra Bold'],
  ['900', '900 - Black']];
