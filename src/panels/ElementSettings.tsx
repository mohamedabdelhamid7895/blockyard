/* Settings for interactive and accessibility elements, the Accessibility section every element has, and page SEO. */
import { Accessibility } from 'lucide-react';
import { ICONS, A11Y_FEATURES } from '../widgets';
import { updateNode, updatePageSeo } from '../actions';
import { pickImage } from '../files';
import { CommitInput, Section, Select } from '../ui';
import type { Node, Page } from '../types';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="f-row"><label className="f-label">{label}</label>{children}</div>;
}

const setAttr = (key: string, v: string) => updateNode((n) => {
  n.attrs = n.attrs || {};
  if (v === '') delete n.attrs[key]; else n.attrs[key] = v;
});
const Attr = ({ node, label, k, ph, multiline }: { node: Node; label: string; k: string; ph?: string; multiline?: boolean }) =>
  <Row label={label}><CommitInput value={node.attrs?.[k]} placeholder={ph} multiline={multiline} onCommit={(v) => setAttr(k, v)} /></Row>;
const Check = ({ node, k, label }: { node: Node; k: string; label: string }) => (
  <Row label=""><label className="check"><input type="checkbox" checked={node.attrs?.[k] === 'true'} onChange={(e) => setAttr(k, e.target.checked ? 'true' : '')} /> {label}</label></Row>
);

const ROLES = ['', 'banner', 'navigation', 'main', 'complementary', 'contentinfo', 'region', 'search', 'button', 'link', 'list', 'listitem', 'img', 'presentation', 'alert', 'status', 'dialog', 'group'];

/** ARIA and keyboard settings available on every element. */
export function A11ySection({ node }: { node: Node }) {
  if (node.type === 'body' || node.type === 'symbol' || node.type === 'a11ywidget') return null;
  return (
    <Section title="Accessibility" open right={<Accessibility size={12} />}>
      <Attr node={node} label="ARIA label" k="aria-label" ph="Name for screen readers" />
      <Row label="Role"><Select value={node.attrs?.role || ''} options={ROLES.map((r) => [r, r || 'Default'] as [string, string])} onChange={(v) => setAttr('role', v)} /></Row>
      <Attr node={node} label="Described by" k="aria-describedby" ph="ID of a description" />
      <Row label="Tab order"><Select value={node.attrs?.tabindex || ''} options={[['', 'Default'], ['0', 'Focusable (0)'], ['-1', 'Not in tab order (-1)']]} onChange={(v) => setAttr('tabindex', v)} /></Row>
      <Attr node={node} label="Tooltip" k="title" ph="Title shown on hover" />
      <Check node={node} k="aria-hidden" label="Hide from screen readers" />
      <div className="muted small hint">Prefer visible text and semantic tags; use these when an element needs an accessible name or role it can't get from its content.</div>
    </Section>
  );
}

/** Settings for elements added with interactive behaviour. */
export function TypeSettings({ node }: { node: Node }) {
  switch (node.type) {
    case 'select':
      return (
        <Section title="Select" open>
          <Attr node={node} label="Name" k="name" />
          <Row label="Options"><CommitInput multiline rows={5} value={(node.options || []).join('\n')} placeholder="One option per line"
            onCommit={(v) => updateNode((n) => { n.options = v.split('\n').map((x) => x.trim()).filter(Boolean); })} /></Row>
          <Check node={node} k="required" label="Required" />
          <div className="muted small hint">The first option is a placeholder when it reads like “Choose…”.</div>
        </Section>
      );
    case 'checkbox':
    case 'radio':
      return (
        <Section title={node.type === 'radio' ? 'Radio button' : 'Checkbox'} open>
          <Row label="Label"><CommitInput value={node.text} onCommit={(v) => updateNode((n) => { n.text = v; })} /></Row>
          <Attr node={node} label="Name" k="name" ph={node.type === 'radio' ? 'Same name for one group' : 'agree'} />
          {node.type === 'radio' && <Attr node={node} label="Value" k="value" />}
          <Check node={node} k="required" label="Required" />
        </Section>
      );
    case 'label':
      return <Section title="Label" open><Attr node={node} label="For field" k="for" ph="ID of the input it labels" />
        <div className="muted small hint">Give the input an ID (Settings → Element) and enter it here, so clicking the label focuses the field and screen readers announce it.</div></Section>;
    case 'form':
      return (
        <Section title="Form" open>
          <Attr node={node} label="Form name" k="data-name" ph="Contact form" />
          <Attr node={node} label="Action" k="action" ph="Blockyard Forms (leave empty)" />
          <Row label="Method"><Select value={node.attrs?.method || 'post'} options={[['post', 'POST'], ['get', 'GET']]} onChange={(v) => setAttr('method', v)} /></Row>
          <Attr node={node} label="Success" k="data-success" ph="Thank you! Your submission has been received." multiline />
          <Attr node={node} label="Error" k="data-error" ph="Oops! Something went wrong." multiline />
          <div className="muted small hint">Leave Action empty to collect submissions in Blockyard (Site → Forms) and trigger automations.</div>
        </Section>
      );
    case 'tabs': {
      const count = node.children?.find((c) => c.type === 'tabsmenu')?.children?.length || 0;
      return (
        <Section title="Tabs" open>
          <Row label="Current tab"><Select value={node.attrs?.['data-current'] || '0'} options={Array.from({ length: count }, (_, i) => [String(i), `Tab ${i + 1}`] as [string, string])} onChange={(v) => setAttr('data-current', v)} /></Row>
          <div className="muted small hint">The current tab opens first and is the one you see while designing. Visitors switch with clicks or the arrow keys.</div>
        </Section>
      );
    }
    case 'map':
      return <Section title="Map" open><Attr node={node} label="Address" k="data-address" ph="Street, city" /><Attr node={node} label="Title" k="title" ph="Map of our office" /></Section>;
    case 'bgvideo':
      return (
        <Section title="Background video" open>
          <Attr node={node} label="Video URL" k="data-video" ph="https://…/video.mp4" />
          <div className="muted small hint">Muted and looping. Visitors get a pause button, and it doesn't autoplay for people who prefer reduced motion.</div>
        </Section>
      );
    case 'lightbox':
      return (
        <Section title="Lightbox" open>
          <Attr node={node} label="Large image" k="href" ph="https://…" />
          <div className="btn-row"><button className="btn" onClick={() => pickImage().then((src) => src && setAttr('href', src))}>Upload image…</button></div>
        </Section>
      );
    case 'icon':
      return (
        <Section title="Icon" open>
          <div className="icon-grid">
            {Object.keys(ICONS).map((name) => (
              <button key={name} title={name} className={node.attrs?.['data-icon'] === name ? 'on' : ''} onClick={() => setAttr('data-icon', name)}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
              </button>
            ))}
          </div>
          <div className="muted small hint">Icons are decorative by default. Give it an ARIA label below if it carries meaning on its own.</div>
        </Section>
      );
    case 'richtext':
      return <Section title="Rich text" open><div className="muted small hint">Double-click the rich text on the canvas to edit it. Use ⌘B and ⌘I for bold and italic; formatting is cleaned to safe tags.</div></Section>;
    case 'a11ywidget': {
      const features = (node.attrs?.['data-features'] || '').split(',').filter(Boolean);
      const toggle = (f: string) => setAttr('data-features', (features.includes(f) ? features.filter((x) => x !== f) : [...features, f]).join(','));
      return (
        <Section title="Accessibility widget" open right={<Accessibility size={12} />}>
          <Row label="Position"><Select value={node.attrs?.['data-position'] || 'bottom-right'} options={[['bottom-right', 'Bottom right'], ['bottom-left', 'Bottom left'], ['top-right', 'Top right'], ['top-left', 'Top left']]} onChange={(v) => setAttr('data-position', v)} /></Row>
          <Row label="Color"><div className="f-color"><label className="swatch" style={{ background: node.attrs?.['data-color'] || '#146ef5' }}>
            <input type="color" value={node.attrs?.['data-color'] || '#146ef5'} onChange={(e) => setAttr('data-color', e.target.value)} /></label>
            <CommitInput value={node.attrs?.['data-color']} onCommit={(v) => setAttr('data-color', v)} /></div></Row>
          <Attr node={node} label="Button label" k="data-label" ph="Accessibility" />
          <div className="feature-list">
            {A11Y_FEATURES.map(([id, label]) => (
              <label key={id} className="check"><input type="checkbox" checked={features.includes(id)} onChange={() => toggle(id)} /> {label}</label>
            ))}
          </div>
          <div className="muted small hint">Visitors open it with the floating button or Alt+A. Their choices are remembered on their device. Put it in a component (or on every page) to show it site-wide. It adds adjustments; it doesn't replace building pages accessibly.</div>
        </Section>
      );
    }
    default:
      return null;
  }
}

/** Search and social settings for a page. */
export function SeoSection({ page }: { page: Page }) {
  const seo = page.seo || {};
  const set = (patch: Partial<NonNullable<Page['seo']>>) => updatePageSeo(page.id, patch);
  const titleLen = (page.title || '').length, descLen = (page.description || '').length;
  return (
    <Section title="SEO & social" open>
      <div className={'seo-meter' + (titleLen < 15 || titleLen > 60 ? ' warn' : '')}>Title {titleLen}/60 characters</div>
      <div className={'seo-meter' + (descLen < 50 || descLen > 160 ? ' warn' : '')}>Description {descLen}/160 characters</div>
      <Row label="OG title"><CommitInput value={seo.ogTitle} placeholder={page.title} onCommit={(v) => set({ ogTitle: v })} /></Row>
      <Row label="OG text"><CommitInput multiline value={seo.ogDescription} placeholder={page.description || 'Shared link description'} onCommit={(v) => set({ ogDescription: v })} /></Row>
      <Row label="OG image"><CommitInput value={seo.ogImage} placeholder="https://… (1200×630)" onCommit={(v) => set({ ogImage: v })} /></Row>
      <Row label=""><label className="check"><input type="checkbox" checked={!!seo.noindex} onChange={(e) => set({ noindex: e.target.checked })} /> Hide from search engines</label></Row>
      <Row label=""><label className="check"><input type="checkbox" checked={!!seo.excludeFromSitemap} onChange={(e) => set({ excludeFromSitemap: e.target.checked })} /> Leave out of sitemap.xml</label></Row>
      <div className="search-preview">
        <span className="sp-url">{page.slug === 'index' ? 'yoursite.com' : `yoursite.com › ${page.slug}`}</span>
        <span className="sp-title">{page.title || page.name}</span>
        <span className="sp-desc">{page.description || 'Add a description so search engines show a useful summary.'}</span>
      </div>
    </Section>
  );
}
