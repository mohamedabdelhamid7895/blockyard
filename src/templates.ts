/* Templates gallery: prebuilt sections and page layouts, plus the starter site built from them. */
import { ELEMENTS, PLACEHOLDER_IMG } from './constants';
import { newInteraction } from './interactions';
import { bodyNode, uid, walkTree } from './model';
import type { Binding, ClassStyles, Collection, Interaction, Node, Project, StyleMap } from './types';

const S = (desktop: StyleMap, tablet?: StyleMap, mobile?: StyleMap): ClassStyles =>
  ({ desktop, ...(tablet ? { tablet } : {}), ...(mobile ? { mobile } : {}) });
const pad = (y: string, x: string) => ({ 'padding-top': y, 'padding-bottom': y, 'padding-left': x, 'padding-right': x });
const m0 = { 'margin-top': '0px', 'margin-bottom': '0px' };
const btnBase = { display: 'inline-block', ...pad('14px', '26px'), 'border-radius': '8px', 'text-decoration': 'none', 'font-weight': '600', transition: 'all 0.2s ease' };
const ACCENT = '#146ef5';
const INK = '#0b0c0f';
const MUTED = '#5b6070';
const LINE = '#e6e8ee';

/** Every class the templates use. Inserting a template copies the ones the project doesn't have yet. */
export const CLASS_LIBRARY: Record<string, ClassStyles> = {
  body: S({ 'font-family': 'Inter, system-ui, sans-serif', color: INK, 'background-color': '#ffffff', 'line-height': '1.6' }),
  container: S({ 'max-width': '1140px', 'margin-left': 'auto', 'margin-right': 'auto', 'padding-left': '24px', 'padding-right': '24px', width: '100%' }),
  navbar: S({ ...pad('18px', '0px'), 'background-color': 'rgba(255,255,255,0.9)', 'box-shadow': `0 1px 0 ${LINE}`, position: 'sticky', top: '0px', 'z-index': '10' }),
  'nav-inner': S({ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', gap: '24px' }),
  logo: S({ 'font-size': '22px', 'font-weight': '800', 'letter-spacing': '-0.02em', color: INK, 'text-decoration': 'none' }),
  'nav-links': S({ display: 'flex', 'align-items': 'center', gap: '28px' }, undefined, { display: 'none' }),
  'nav-link': S({ color: '#4b5060', 'text-decoration': 'none', 'font-weight': '500', 'font-size': '15px', transition: 'color 0.2s ease' }),
  'button-small': S({ ...btnBase, ...pad('10px', '18px'), 'background-color': INK, color: '#ffffff', 'font-size': '14px' }),
  button: S({ ...btnBase, 'background-color': ACCENT, color: '#ffffff', 'box-shadow': '0 10px 24px rgba(20,110,245,.25)' }, undefined, { 'text-align': 'center' }),
  'button-secondary': S({ ...btnBase, 'background-color': '#ffffff', color: INK, 'border-width': '1px', 'border-style': 'solid', 'border-color': '#dfe2ea' }, undefined, { 'text-align': 'center' }),
  'button-light': S({ ...btnBase, 'background-color': '#ffffff', color: INK }),
  hero: S({ 'padding-top': '110px', 'padding-bottom': '90px', 'background-image': 'radial-gradient(circle at 50% 0%, #e8f0fe 0%, #ffffff 60%)' },
    { 'padding-top': '80px' }, { 'padding-top': '56px', 'padding-bottom': '56px' }),
  'hero-inner': S({ display: 'flex', 'flex-direction': 'column', 'align-items': 'center', 'text-align': 'center' }),
  eyebrow: S({ ...m0, 'margin-bottom': '20px', ...pad('6px', '14px'), 'border-radius': '999px', 'background-color': '#e8f0fe', color: ACCENT, 'font-size': '13px', 'font-weight': '600', 'letter-spacing': '0.04em' }),
  'hero-title': S({ ...m0, 'margin-bottom': '20px', 'max-width': '820px', 'font-size': '64px', 'line-height': '1.05', 'letter-spacing': '-0.035em', 'font-weight': '800' },
    { 'font-size': '48px' }, { 'font-size': '36px' }),
  'hero-sub': S({ ...m0, 'margin-bottom': '36px', 'max-width': '600px', 'font-size': '19px', color: MUTED }, undefined, { 'font-size': '17px' }),
  'hero-actions': S({ display: 'flex', gap: '14px', 'justify-content': 'center' }, undefined, { 'flex-direction': 'column', width: '100%' }),
  'hero-image': S({ width: '100%', 'margin-top': '64px', 'border-radius': '18px', 'box-shadow': '0 30px 80px rgba(11,12,15,.15)', display: 'block' }, undefined, { 'margin-top': '40px', 'border-radius': '12px' }),
  'split-grid': S({ display: 'grid', 'grid-template-columns': '1.1fr 1fr', gap: '56px', 'align-items': 'center' }, { 'grid-template-columns': '1fr' }),
  'split-title': S({ ...m0, 'margin-bottom': '20px', 'font-size': '52px', 'line-height': '1.08', 'letter-spacing': '-0.03em', 'font-weight': '800' }, { 'font-size': '42px' }, { 'font-size': '34px' }),
  'split-image': S({ width: '100%', 'border-radius': '18px', display: 'block' }),
  section: S({ 'padding-top': '100px', 'padding-bottom': '100px' }, undefined, { 'padding-top': '64px', 'padding-bottom': '64px' }),
  'section-muted': S({ 'background-color': '#f7f8fb' }),
  'section-title': S({ ...m0, 'margin-bottom': '12px', 'font-size': '40px', 'letter-spacing': '-0.02em', 'text-align': 'center', 'line-height': '1.15' }, undefined, { 'font-size': '30px' }),
  'section-sub': S({ ...m0, 'margin-bottom': '56px', 'text-align': 'center', color: MUTED, 'font-size': '18px' }),
  'logo-row': S({ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', gap: '32px', 'flex-wrap': 'wrap' }, undefined, { 'justify-content': 'center' }),
  'logo-label': S({ ...m0, 'margin-bottom': '28px', 'text-align': 'center', color: '#8a8f9e', 'font-size': '13px', 'font-weight': '600', 'letter-spacing': '0.08em' }),
  'logo-item': S({ ...m0, 'font-size': '22px', 'font-weight': '700', color: '#a1a6b3', 'letter-spacing': '-0.02em' }),
  'feature-grid': S({ display: 'grid', 'grid-template-columns': '1fr 1fr 1fr', gap: '24px' }, { 'grid-template-columns': '1fr 1fr' }, { 'grid-template-columns': '1fr' }),
  card: S({ ...pad('32px', '28px'), 'border-radius': '16px', 'background-color': '#f7f8fb', 'border-width': '1px', 'border-style': 'solid', 'border-color': '#eceef3', transition: 'all 0.25s ease' }),
  'card-icon': S({ ...m0, 'margin-bottom': '16px', 'font-size': '28px' }),
  'card-title': S({ ...m0, 'margin-bottom': '8px', 'font-size': '20px' }),
  'card-text': S({ ...m0, color: MUTED }),
  'stats-grid': S({ display: 'grid', 'grid-template-columns': '1fr 1fr 1fr 1fr', gap: '24px', 'text-align': 'center' }, { 'grid-template-columns': '1fr 1fr' }),
  'stat-number': S({ ...m0, 'font-size': '48px', 'font-weight': '800', 'letter-spacing': '-0.03em', color: ACCENT }),
  'stat-label': S({ ...m0, color: MUTED }),
  'quote-grid': S({ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '24px' }, undefined, { 'grid-template-columns': '1fr' }),
  'quote-card': S({ ...pad('32px', '32px'), 'border-radius': '16px', 'background-color': '#ffffff', 'box-shadow': '0 10px 30px rgba(11,12,15,.06)' }),
  'quote-text': S({ ...m0, 'margin-bottom': '20px', 'font-size': '19px', 'line-height': '1.5' }),
  'quote-author': S({ ...m0, 'font-weight': '600' }),
  'quote-role': S({ ...m0, color: MUTED, 'font-size': '14px' }),
  'pricing-grid': S({ display: 'grid', 'grid-template-columns': '1fr 1fr 1fr', gap: '24px', 'align-items': 'stretch' }, { 'grid-template-columns': '1fr' }),
  'price-card': S({ ...pad('36px', '32px'), 'border-radius': '18px', 'border-width': '1px', 'border-style': 'solid', 'border-color': LINE, display: 'flex', 'flex-direction': 'column', gap: '16px' }),
  'price-card.featured': S({ 'border-color': ACCENT, 'box-shadow': '0 20px 50px rgba(20,110,245,.15)' }),
  'price-name': S({ ...m0, 'font-size': '18px', 'font-weight': '700' }),
  'price-amount': S({ ...m0, 'font-size': '48px', 'font-weight': '800', 'letter-spacing': '-0.03em' }),
  'price-list': S({ ...m0, 'padding-left': '20px', color: MUTED, flex: '1' }),
  'faq-list': S({ 'max-width': '760px', 'margin-left': 'auto', 'margin-right': 'auto', display: 'flex', 'flex-direction': 'column', gap: '12px' }),
  'faq-item': S({ ...pad('22px', '24px'), 'border-radius': '12px', 'background-color': '#f7f8fb' }),
  'faq-q': S({ ...m0, 'margin-bottom': '6px', 'font-size': '18px' }),
  'faq-a': S({ ...m0, color: MUTED }),
  cta: S({ 'padding-top': '90px', 'padding-bottom': '90px', 'background-color': INK, color: '#ffffff', 'text-align': 'center' }),
  'cta-title': S({ ...m0, 'margin-bottom': '28px', 'font-size': '40px', 'letter-spacing': '-0.02em', 'line-height': '1.15' }, undefined, { 'font-size': '30px' }),
  footer: S({ 'padding-top': '32px', 'padding-bottom': '32px', 'box-shadow': `inset 0 1px 0 ${LINE}` }),
  'footer-inner': S({ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', gap: '16px' }, undefined, { 'flex-direction': 'column' }),
  'footer-text': S({ ...m0, color: '#7a7f8f', 'font-size': '14px' }),
  'footer-links': S({ display: 'flex', gap: '20px' }),
  prose: S({ 'max-width': '680px', 'margin-left': 'auto', 'margin-right': 'auto', ...m0, 'margin-bottom': '20px', 'font-size': '18px', color: '#3d4150' }),
  'contact-form': S({ display: 'flex', 'flex-direction': 'column', gap: '12px', 'max-width': '520px', 'margin-left': 'auto', 'margin-right': 'auto' }),
  'text-field': S({ ...pad('12px', '14px'), 'border-width': '1px', 'border-style': 'solid', 'border-color': '#d1d5db', 'border-radius': '8px', 'font-size': '15px', width: '100%' }),
  'text-area': S({ ...pad('12px', '14px'), 'border-width': '1px', 'border-style': 'solid', 'border-color': '#d1d5db', 'border-radius': '8px', 'font-size': '15px', width: '100%', 'font-family': 'inherit' }),
  'submit-button': S({ ...pad('14px', '22px'), 'background-color': ACCENT, color: '#ffffff', 'border-width': '0px', 'border-radius': '8px', 'font-weight': '600', 'font-size': '15px', cursor: 'pointer' }),
  'blog-grid': S({ display: 'grid', 'grid-template-columns': '1fr 1fr 1fr', gap: '28px' }, { 'grid-template-columns': '1fr 1fr' }, { 'grid-template-columns': '1fr' }),
  'blog-card': S({ display: 'flex', 'flex-direction': 'column', gap: '10px', color: INK, 'text-decoration': 'none' }),
  'blog-thumb': S({ width: '100%', 'aspect-ratio': '16 / 10', 'object-fit': 'cover', 'border-radius': '14px', display: 'block', 'margin-bottom': '6px' }),
  'blog-date': S({ ...m0, color: '#8a8f9e', 'font-size': '13px', 'font-weight': '600' }),
  'blog-title': S({ ...m0, 'font-size': '21px', 'line-height': '1.3' }),
  'blog-summary': S({ ...m0, color: MUTED }),
  'read-more': S({ color: ACCENT, 'font-weight': '600', 'text-decoration': 'none' }),
  'post-header': S({ 'padding-top': '80px', 'padding-bottom': '32px' }),
  'post-title': S({ ...m0, 'margin-bottom': '16px', 'font-size': '52px', 'line-height': '1.1', 'letter-spacing': '-0.03em', 'max-width': '820px' }, undefined, { 'font-size': '34px' }),
  'post-image': S({ width: '100%', 'aspect-ratio': '16 / 8', 'object-fit': 'cover', 'border-radius': '18px', display: 'block', 'margin-bottom': '48px' }),
};
// Hover states, as Webflow's "Hover" state would set them.
CLASS_LIBRARY.button['desktop:hover'] = { 'background-color': '#0f5ad1', transform: 'translateY(-2px)' };
CLASS_LIBRARY['button-secondary']['desktop:hover'] = { 'border-color': INK };
CLASS_LIBRARY['nav-link']['desktop:hover'] = { color: ACCENT };
CLASS_LIBRARY.card['desktop:hover'] = { transform: 'translateY(-4px)', 'box-shadow': '0 18px 40px rgba(11,12,15,.08)' };

/* ---- Node builder ---- */
interface Opts { tag?: string; text?: string; attrs?: Record<string, string>; bind?: Binding; ix?: Interaction[]; collectionId?: string }
export function N(type: string, cls: string | string[], opts: Opts = {}, kids?: Node[]): Node {
  const def = ELEMENTS[type];
  const n: Node = { id: uid(), type, tag: opts.tag || def.tag, classes: Array.isArray(cls) ? cls : [cls] };
  if (opts.text != null || def.text != null) n.text = opts.text ?? def.text;
  if (def.attrs || opts.attrs) n.attrs = { ...(def.attrs || {}), ...(opts.attrs || {}) };
  if (opts.bind) n.bind = opts.bind;
  if (opts.ix) n.ix = opts.ix;
  if (opts.collectionId) n.collectionId = opts.collectionId;
  if (def.container) n.children = kids || [];
  return n;
}
const ix = (trigger: Interaction['trigger'], anim: string, delay = 0): Interaction[] => [{ ...newInteraction(trigger), anim, delay }];
const wrap = (cls: string | string[], kids: Node[], tag = 'section', o: Opts = {}) =>
  N('section', cls, { tag, ...o }, [N('container', 'container', {}, kids)]);

/* ---- Sections ---- */
const navbar = () => wrap('navbar', [N('flex', 'nav-inner', {}, [
  N('link', 'logo', { text: 'Northwind', attrs: { href: 'index.html' } }),
  N('flex', 'nav-links', {}, [
    N('link', 'nav-link', { text: 'Features', attrs: { href: 'index.html#features' } }),
    N('link', 'nav-link', { text: 'Blog', attrs: { href: 'blog.html' } }),
    N('link', 'nav-link', { text: 'About', attrs: { href: 'about.html' } }),
  ]),
  N('button', 'button-small', { text: 'Get started', attrs: { href: '#' } }),
])], 'nav');

const heroCentered = () => wrap('hero', [
  N('div', 'hero-inner', {}, [
    N('paragraph', 'eyebrow', { text: 'NEW · VISUAL WEBSITE BUILDER', ix: ix('load', 'fade-in') }),
    N('heading', 'hero-title', { tag: 'h1', text: 'Design and launch beautiful websites — no code required', ix: ix('load', 'fade-up', 100) }),
    N('paragraph', 'hero-sub', { text: 'Drag, drop and style real HTML & CSS visually. Every page is responsive and exports as clean, production-ready code.', ix: ix('load', 'fade-up', 200) }),
    N('flex', 'hero-actions', { ix: ix('load', 'fade-up', 300) }, [
      N('button', 'button', { text: 'Start building', attrs: { href: '#' } }),
      N('button', 'button-secondary', { text: 'See features', attrs: { href: '#features' } }),
    ]),
  ]),
  N('image', 'hero-image', { attrs: { src: PLACEHOLDER_IMG, alt: 'Product screenshot' }, ix: ix('scroll', 'zoom-in', 200) }),
], 'header');

const heroSplit = () => wrap('hero', [N('grid', 'split-grid', {}, [
  N('div', 'div-block', {}, [
    N('paragraph', 'eyebrow', { text: 'ABOUT US' }),
    N('heading', 'split-title', { tag: 'h1', text: 'We help teams build for the web, faster' }),
    N('paragraph', 'hero-sub', { text: 'A small team of designers and engineers who believe great websites should be easy to make and easy to own.' }),
    N('button', 'button', { text: 'Meet the team', attrs: { href: '#' } }),
  ]),
  N('image', 'split-image', { attrs: { src: PLACEHOLDER_IMG, alt: '' }, ix: ix('scroll', 'fade-left') }),
])], 'header');

const logos = () => wrap(['section', 'section-muted'], [
  N('paragraph', 'logo-label', { text: 'TRUSTED BY TEAMS AT' }),
  N('flex', 'logo-row', {}, ['Acme', 'Globex', 'Initech', 'Umbrella', 'Hooli'].map((t) => N('paragraph', 'logo-item', { text: t }))),
]);

const card = (icon: string, title: string, text: string, i: number) => N('div', 'card', { ix: ix('scroll', 'fade-up', i * 80) }, [
  N('paragraph', 'card-icon', { text: icon }),
  N('heading', 'card-title', { tag: 'h3', text: title }),
  N('paragraph', 'card-text', { text }),
]);
const features = () => wrap('section', [
  N('heading', 'section-title', { text: 'Everything you need to ship' }),
  N('paragraph', 'section-sub', { text: 'A professional toolkit for designers, marketers and developers.' }),
  N('grid', 'feature-grid', {}, [
    card('🎨', 'Visual styling', 'Control layout, spacing, typography and color with a real CSS box model.', 0),
    card('📱', 'Responsive by default', 'Tweak styles per breakpoint. Desktop styles cascade down to tablet and mobile.', 1),
    card('⚡', 'Clean code export', 'Download semantic HTML and a single stylesheet. Host it anywhere.', 2),
    card('🧩', 'Components', 'Turn any element into a reusable component and edit every copy at once.', 3),
    card('🗂', 'CMS collections', 'Model your content once and bind it to lists and template pages.', 4),
    card('✨', 'Interactions', 'Add scroll, hover and load animations without writing JavaScript.', 5),
  ]),
], 'section', { attrs: { id: 'features' } });

const stats = () => wrap('section', [N('grid', 'stats-grid', {}, [
  ['12k+', 'Sites launched'], ['99.9%', 'Uptime'], ['4.9/5', 'Customer rating'], ['48', 'Countries'],
].map(([n, l], i) => N('div', 'div-block', { ix: ix('scroll', 'zoom-in', i * 100) }, [N('paragraph', 'stat-number', { text: n }), N('paragraph', 'stat-label', { text: l })])))]);

const testimonials = () => wrap(['section', 'section-muted'], [
  N('heading', 'section-title', { text: 'Loved by builders' }),
  N('paragraph', 'section-sub', { text: 'Teams of every size use Northwind to ship faster.' }),
  N('grid', 'quote-grid', {}, [
    ['“We rebuilt our marketing site in a week. Our designers finally own the website.”', 'Maya Chen', 'Head of Design, Globex'],
    ['“The exported code is so clean our engineers asked which framework we used.”', 'Daniel Okafor', 'CTO, Initech'],
  ].map(([q, a, r]) => N('div', 'quote-card', { ix: ix('scroll', 'fade-up') }, [
    N('paragraph', 'quote-text', { text: q }), N('paragraph', 'quote-author', { text: a }), N('paragraph', 'quote-role', { text: r }),
  ]))),
]);

const priceCard = (name: string, price: string, items: string[], featured = false) =>
  N('div', featured ? ['price-card', 'featured'] : 'price-card', {}, [
    N('heading', 'price-name', { tag: 'h3', text: name }),
    N('paragraph', 'price-amount', { text: price }),
    N('list', 'price-list', {}, items.map((t) => N('listitem', 'list-item', { text: t }))),
    N('button', featured ? 'button' : 'button-secondary', { text: 'Choose plan', attrs: { href: '#' } }),
  ]);
const pricing = () => wrap('section', [
  N('heading', 'section-title', { text: 'Simple, transparent pricing' }),
  N('paragraph', 'section-sub', { text: 'Start free. Upgrade when you launch.' }),
  N('grid', 'pricing-grid', {}, [
    priceCard('Starter', '$0', ['1 site', 'Blockyard subdomain', 'Community support']),
    priceCard('Pro', '$19', ['10 sites', 'Custom domains', 'CMS & interactions', 'Priority support'], true),
    priceCard('Team', '$49', ['Unlimited sites', 'Roles & permissions', 'Shared components']),
  ]),
]);

const faq = () => wrap('section', [
  N('heading', 'section-title', { text: 'Frequently asked questions' }),
  N('paragraph', 'section-sub', { text: 'Everything you need to know.' }),
  N('div', 'faq-list', {}, [
    ['Do I need to know code?', 'No. Everything is visual, but you can always add custom code with the Code Embed element.'],
    ['Can I host my site anywhere?', 'Yes. Export a ZIP of plain HTML and CSS and upload it to any static host.'],
    ['Does it work on mobile?', 'Every site is responsive, and you can fine-tune styles for tablet and mobile breakpoints.'],
  ].map(([q, a]) => N('div', 'faq-item', {}, [N('heading', 'faq-q', { tag: 'h3', text: q }), N('paragraph', 'faq-a', { text: a })]))),
]);

const cta = () => wrap('cta', [
  N('heading', 'cta-title', { text: 'Ready to build something great?', ix: ix('scroll', 'fade-up') }),
  N('button', 'button-light', { text: 'Create your site', attrs: { href: 'about.html#contact' } }),
]);

const contact = () => wrap('section', [
  N('heading', 'section-title', { text: 'Get in touch' }),
  N('paragraph', 'section-sub', { text: 'We usually reply within one business day.' }),
  N('form', 'contact-form', {}, [
    N('input', 'text-field', { attrs: { type: 'text', name: 'name', placeholder: 'Your name' } }),
    N('input', 'text-field', { attrs: { type: 'email', name: 'email', placeholder: 'you@company.com', required: 'true' } }),
    N('textarea', 'text-area', { attrs: { name: 'message', placeholder: 'How can we help?', rows: '5' } }),
    N('formbutton', 'submit-button', { text: 'Send message' }),
  ]),
], 'section', { attrs: { id: 'contact' } });

const footer = () => wrap('footer', [N('flex', 'footer-inner', {}, [
  N('paragraph', 'footer-text', { text: '© 2026 Northwind Studio. All rights reserved.' }),
  N('flex', 'footer-links', {}, ['Twitter', 'GitHub', 'Privacy'].map((t) => N('link', 'nav-link', { text: t, attrs: { href: '#' } }))),
])], 'footer');

const blogGrid = (collectionId?: string) => wrap('section', [
  N('heading', 'section-title', { text: 'From the blog' }),
  N('paragraph', 'section-sub', { text: 'Product news, tutorials and stories.' }),
  N('collectionlist', 'blog-grid', { collectionId }, [
    N('collectionitem', 'collection-item', {}, [
      N('div', 'blog-card', { ix: ix('scroll', 'fade-up') }, [
        N('image', 'blog-thumb', { bind: { src: 'image' }, attrs: { src: PLACEHOLDER_IMG, alt: '' } }),
        N('paragraph', 'blog-date', { bind: { text: 'date' } }),
        N('heading', 'blog-title', { tag: 'h3', bind: { text: 'name' } }),
        N('paragraph', 'blog-summary', { bind: { text: 'summary' } }),
        N('link', 'read-more', { text: 'Read more →', bind: { href: '__url' } }),
      ]),
    ]),
  ]),
]);

const postTemplate = () => [
  wrap('post-header', [
    N('paragraph', 'blog-date', { bind: { text: 'date' } }),
    N('heading', 'post-title', { tag: 'h1', bind: { text: 'name' }, ix: ix('load', 'fade-up') }),
    N('paragraph', 'hero-sub', { bind: { text: 'summary' } }),
  ], 'header'),
  wrap('div-block', [
    N('image', 'post-image', { bind: { src: 'image' }, attrs: { src: PLACEHOLDER_IMG, alt: '' } }),
    N('paragraph', 'prose', { bind: { text: 'body' } }),
    N('link', 'read-more', { text: '← Back to the blog', attrs: { href: 'blog.html' } }),
  ]),
];

/* ---- Gallery ---- */
export interface SectionTemplate { id: string; name: string; category: string; build: (p: Project) => Node[]; needsBlog?: boolean }

export const SECTION_TEMPLATES: SectionTemplate[] = [
  { id: 'navbar', name: 'Navbar', category: 'Navigation', build: () => [navbar()] },
  { id: 'hero-centered', name: 'Hero — centered', category: 'Hero', build: () => [heroCentered()] },
  { id: 'hero-split', name: 'Hero — split image', category: 'Hero', build: () => [heroSplit()] },
  { id: 'logos', name: 'Logo strip', category: 'Social proof', build: () => [logos()] },
  { id: 'features', name: 'Feature cards', category: 'Features', build: () => [features()] },
  { id: 'stats', name: 'Stats', category: 'Features', build: () => [stats()] },
  { id: 'testimonials', name: 'Testimonials', category: 'Social proof', build: () => [testimonials()] },
  { id: 'pricing', name: 'Pricing table', category: 'Pricing', build: () => [pricing()] },
  { id: 'faq', name: 'FAQ', category: 'Content', build: () => [faq()] },
  { id: 'blog', name: 'Blog grid (CMS)', category: 'Content', needsBlog: true, build: (p) => [blogGrid(blogCollection(p)?.id)] },
  { id: 'cta', name: 'Call to action', category: 'Conversion', build: () => [cta()] },
  { id: 'contact', name: 'Contact form', category: 'Conversion', build: () => [contact()] },
  { id: 'footer', name: 'Footer', category: 'Navigation', build: () => [footer()] },
];

export interface PageTemplate { id: string; name: string; description: string; sections: string[] }
export const PAGE_TEMPLATES: PageTemplate[] = [
  { id: 'landing', name: 'Landing page', description: 'Hero, logos, features, stats, testimonials and a CTA',
    sections: ['navbar', 'hero-centered', 'logos', 'features', 'stats', 'testimonials', 'cta', 'footer'] },
  { id: 'pricing', name: 'Pricing page', description: 'Pricing table, FAQ and a CTA', sections: ['navbar', 'pricing', 'faq', 'cta', 'footer'] },
  { id: 'about', name: 'About page', description: 'Split hero, stats, testimonials and a contact form',
    sections: ['navbar', 'hero-split', 'stats', 'testimonials', 'contact', 'footer'] },
  { id: 'blank', name: 'Blank page', description: 'An empty page', sections: [] },
];

const blogCollection = (p: Project) => p.collections.find((c) => c.slug === 'blog-posts') || null;

export function sampleBlogCollection(): Collection {
  const post = (name: string, slug: string, date: string, summary: string) => ({
    id: uid(),
    data: { name, slug, date, summary, image: PLACEHOLDER_IMG,
      body: `${summary}\n\nThis is the body of the post. Edit it in the CMS panel: open Blog Posts, pick this item and change any field. Every page that shows this post updates automatically.` },
  });
  return {
    id: uid(), name: 'Blog Posts', slug: 'blog-posts',
    fields: [
      { id: uid(), name: 'Name', slug: 'name', type: 'plaintext' },
      { id: uid(), name: 'Slug', slug: 'slug', type: 'plaintext' },
      { id: uid(), name: 'Date', slug: 'date', type: 'date' },
      { id: uid(), name: 'Summary', slug: 'summary', type: 'plaintext' },
      { id: uid(), name: 'Main image', slug: 'image', type: 'image' },
      { id: uid(), name: 'Body', slug: 'body', type: 'richtext' },
    ],
    items: [
      post('Introducing Blockyard 2.0', 'introducing-blockyard-2', '2026-11-01', 'Rebuilt in React with components, interactions and a CMS.'),
      post('Designing responsive layouts', 'responsive-layouts', '2026-10-18', 'How breakpoints cascade, and when to override them.'),
      post('Five interactions that feel great', 'five-interactions', '2026-10-02', 'Subtle motion that makes a landing page feel alive.'),
    ],
  };
}

/** Copies template classes the project doesn't have (existing classes keep their styles) and gives nodes fresh ids. */
export function adoptNodes(p: Project, nodes: Node[]) {
  for (const n of nodes) walkTree(n, (x) => {
    for (let i = 1; i <= x.classes.length; i++) {
      const key = x.classes.slice(0, i).join('.');
      if (!p.classes[key]) p.classes[key] = JSON.parse(JSON.stringify(CLASS_LIBRARY[key] || {}));
    }
  });
  return nodes;
}

export function ensureBlogCollection(p: Project) {
  let c = blogCollection(p);
  if (!c) { c = sampleBlogCollection(); p.collections.push(c); }
  return c;
}

export function buildSections(p: Project, ids: string[]) {
  const out: Node[] = [];
  for (const id of ids) {
    const t = SECTION_TEMPLATES.find((s) => s.id === id)!;
    if (t.needsBlog) ensureBlogCollection(p);
    out.push(...t.build(p));
  }
  return adoptNodes(p, out);
}

/* ---- Starter site ---- */
export function starterProject(): Project {
  const p: Project = { version: 2, pages: [], classes: { body: JSON.parse(JSON.stringify(CLASS_LIBRARY.body)) }, components: {}, collections: [] };
  const blog = ensureBlogCollection(p);
  const navComp = { id: uid(), name: 'Navbar', root: adoptNodes(p, [navbar()])[0] };
  const footComp = { id: uid(), name: 'Footer', root: adoptNodes(p, [footer()])[0] };
  p.components[navComp.id] = navComp;
  p.components[footComp.id] = footComp;
  const sym = (componentId: string): Node => ({ id: uid(), type: 'symbol', tag: 'div', classes: [], componentId });
  const page = (name: string, slug: string, title: string, kids: Node[], collectionId?: string) => {
    const root = bodyNode();
    root.children = [sym(navComp.id), ...adoptNodes(p, kids), sym(footComp.id)];
    p.pages.push({ id: uid(), name, slug, title, description: '', root, ...(collectionId ? { collectionId } : {}) });
  };
  page('Home', 'index', 'Northwind — Build websites visually', [heroCentered(), logos(), features(), stats(), testimonials(), cta()]);
  page('About', 'about', 'About — Northwind', [heroSplit(), stats(), contact()]);
  page('Blog', 'blog', 'Blog — Northwind', [blogGrid(blog.id)]);
  page('Blog Posts Template', 'blog-posts-template', 'Northwind Blog', postTemplate(), blog.id);
  p.pages[0].description = 'A visual website builder demo.';
  return p;
}

export function blankProject(): Project {
  return {
    version: 2,
    pages: [{ id: uid(), name: 'Home', slug: 'index', title: 'My website', description: '', root: bodyNode() }],
    classes: { body: S({ 'font-family': 'Inter, system-ui, sans-serif', color: INK }) },
    components: {},
    collections: [],
  };
}
