import { ArrowDown, ArrowUp, Box, Copy, CornerLeftUp, Database, Group, Trash2, Unlink } from 'lucide-react';
import { ELEMENTS } from '../constants';
import { bindingCollection, currentPage, currentRoot, findNode, nodeLabel, sanitizeSlug } from '../model';
import { openModal, useStore } from '../store';
import {
  createComponent, deleteSelected, detachInstance, duplicateSelected, editComponent, moveSelected, select, updateNode, updatePage, wrapSelected,
} from '../actions';
import { pickImage } from '../files';
import { CommitInput, Section, Select } from '../ui';
import type { Binding, FieldType, Node } from '../types';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="f-row"><label className="f-label">{label}</label>{children}</div>;
}

function toEmbedUrl(v: string) {
  const m = String(v).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  const vm = String(v).match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return v;
}

const setAttr = (key: string, v: string) => updateNode((n) => {
  n.attrs = n.attrs || {};
  if (v === '') delete n.attrs[key]; else n.attrs[key] = v;
});

function AttrInput({ node, label, k, ph, list, transform }: { node: Node; label: string; k: string; ph?: string; list?: string; transform?: (v: string) => string }) {
  return <Row label={label}><CommitInput value={node.attrs?.[k]} placeholder={ph} list={list} onCommit={(v) => setAttr(k, transform ? transform(v) : v)} /></Row>;
}

function PageSettings() {
  const page = useStore((s) => currentPage(s.project, s.ui));
  const collection = useStore((s) => s.project.collections.find((c) => c.id === page.collectionId));
  const set = (k: 'name' | 'slug' | 'title' | 'description') => (v: string) => updatePage(page.id, { [k]: v });
  return (
    <Section title="Page settings" open>
      <Row label="Name"><CommitInput value={page.name} onCommit={set('name')} /></Row>
      {!collection && <Row label="Slug"><CommitInput value={page.slug} onCommit={set('slug')} disabled={page.slug === 'index'} /></Row>}
      <div className="muted small hint">
        {collection ? <>Collection template for <b>{collection.name}</b>. Exports one page per item, e.g. <code>{collection.slug}-{collection.items[0]?.data.slug || 'item'}.html</code></>
          : page.slug === 'index' ? 'This is the home page (index.html).' : <>Exports as <code>{page.slug}.html</code></>}
      </div>
      <Row label="SEO title"><CommitInput value={page.title} placeholder="Shown in the browser tab" onCommit={set('title')} /></Row>
      <Row label="Description"><CommitInput multiline value={page.description} placeholder="Meta description for search engines" onCommit={set('description')} /></Row>
    </Section>
  );
}

const BIND_TYPES: Record<keyof Binding, FieldType[]> = {
  text: ['plaintext', 'richtext', 'number', 'date', 'link', 'color'],
  src: ['image'],
  href: ['link'],
  bg: ['image'],
};

function CmsBinding({ node }: { node: Node }) {
  const collection = useStore((s) => (s.ui.selectedId ? bindingCollection(s.project, s.ui, s.ui.selectedId) : null));
  if (!collection) return null;
  const props: [keyof Binding, string][] = [];
  if (node.text != null) props.push(['text', 'Text']);
  if (node.type === 'image') props.push(['src', 'Image']);
  if (node.tag === 'a') props.push(['href', 'Link']);
  if (node.children && node.type !== 'collectionlist') props.push(['bg', 'Background']);
  if (!props.length) return null;
  const setBind = (k: keyof Binding, v: string) => updateNode((n) => {
    n.bind = { ...(n.bind || {}) };
    if (v) n.bind[k] = v; else delete n.bind[k];
    if (!Object.keys(n.bind).length) delete n.bind;
  });
  return (
    <Section title={`CMS · ${collection.name}`} open right={<Database size={12} />}>
      {props.map(([k, label]) => {
        const fields = collection.fields.filter((f) => BIND_TYPES[k].includes(f.type)).map((f) => [f.slug, f.name] as [string, string]);
        if (k === 'href') fields.unshift(['__url', `Current ${collection.name} page`]);
        return (
          <Row key={k} label={label}>
            <Select value={node.bind?.[k] || ''} onChange={(v) => setBind(k, v)} options={fields} placeholder="Not connected" />
          </Row>
        );
      })}
      <div className="muted small hint">Connected properties show each item's value instead of fixed content.</div>
    </Section>
  );
}

function CollectionListSettings({ node }: { node: Node }) {
  const collections = useStore((s) => s.project.collections);
  return (
    <Section title="Collection List" open right={<Database size={12} />}>
      {collections.length ? <>
        <Row label="Source">
          <Select value={node.collectionId || ''} placeholder="Choose a collection" options={collections.map((c) => [c.id, c.name] as [string, string])}
            onChange={(v) => updateNode((n) => { n.collectionId = v || undefined; })} />
        </Row>
        <Row label="Limit">
          <CommitInput value={node.limit ? String(node.limit) : ''} placeholder="All items" type="number"
            onCommit={(v) => updateNode((n) => { const x = parseInt(v, 10); if (x > 0) n.limit = x; else delete n.limit; })} />
        </Row>
        <div className="muted small hint">Style the Collection Item inside: it repeats once for every item.</div>
      </> : <>
        <div className="muted small hint">You don't have any collections yet.</div>
        <button className="btn" onClick={() => openModal('cms')}>Open the CMS</button>
      </>}
    </Section>
  );
}

export function SettingsPanel({ node }: { node: Node }) {
  const project = useStore((s) => s.project);
  const parent = useStore((s) => findNode(currentRoot(s.project, s.ui), node.id)?.parent || null);
  const def = ELEMENTS[node.type] || ELEMENTS.div;

  if (node.type === 'body') return <PageSettings />;

  const idx = parent ? parent.children!.indexOf(node) : 0;
  const fixed = node.type === 'collectionitem' || !parent;
  return (
    <div>
      {node.type === 'symbol' ? (
        <Section title="Component" open right={<Box size={12} />}>
          <div className="comp-card"><Box size={14} /> {nodeLabel(node, project)}</div>
          <div className="btn-row">
            <button className="btn primary" onClick={() => node.componentId && editComponent(node.componentId)}>Edit component</button>
            <button className="btn" onClick={detachInstance}><Unlink size={12} /> Detach</button>
          </div>
          <div className="muted small hint">Changes to the component update every instance on the site. Detach to turn this instance into ordinary elements.</div>
        </Section>
      ) : (
        <Section title="Element" open>
          {def.tags && <Row label="Tag"><Select value={node.tag} options={def.tags} onChange={(v) => updateNode((n) => { n.tag = v; })} /></Row>}
          {node.text != null && !node.bind?.text && (
            <Row label="Text"><CommitInput multiline value={node.text} onCommit={(v) => updateNode((n) => { n.text = v; })} /></Row>
          )}
          <AttrInput node={node} label="ID" k="id" ph="for #anchor links" transform={sanitizeSlug} />
        </Section>
      )}

      {node.type === 'collectionlist' && <CollectionListSettings node={node} />}
      <CmsBinding node={node} />

      {node.tag === 'a' && !node.bind?.href && (
        <Section title="Link" open>
          <AttrInput node={node} label="URL" k="href" ph="https://… or about.html" list="link-list" />
          <Row label="New tab">
            <label className="check"><input type="checkbox" checked={node.attrs?.target === '_blank'}
              onChange={(e) => updateNode((n) => {
                n.attrs = n.attrs || {};
                if (e.target.checked) { n.attrs.target = '_blank'; n.attrs.rel = 'noopener'; } else { delete n.attrs.target; delete n.attrs.rel; }
              })} /> Open in new tab</label>
          </Row>
          <datalist id="link-list">
            {project.pages.filter((p) => !p.collectionId).map((p) => <option key={p.id} value={`${p.slug}.html`}>{p.name}</option>)}
          </datalist>
        </Section>
      )}
      {node.type === 'image' && (
        <Section title="Image" open>
          {!node.bind?.src && <>
            <AttrInput node={node} label="Source" k="src" ph="https://…" />
            <div className="btn-row"><button className="btn" onClick={() => pickImage().then((src) => src && setAttr('src', src))}>Upload image…</button></div>
          </>}
          <AttrInput node={node} label="Alt text" k="alt" ph="Describe the image" />
        </Section>
      )}
      {node.type === 'video' && (
        <Section title="Video" open><AttrInput node={node} label="URL" k="src" ph="YouTube or Vimeo link" transform={toEmbedUrl} /></Section>
      )}
      {node.type === 'input' && (
        <Section title="Input" open>
          <Row label="Type"><Select value={node.attrs?.type || 'text'} options={['text', 'email', 'tel', 'number', 'password', 'url', 'date']} onChange={(v) => setAttr('type', v)} /></Row>
          <AttrInput node={node} label="Name" k="name" />
          <AttrInput node={node} label="Placeholder" k="placeholder" />
          <Row label="Required"><label className="check"><input type="checkbox" checked={!!node.attrs?.required} onChange={(e) => setAttr('required', e.target.checked ? 'true' : '')} /> Required</label></Row>
        </Section>
      )}
      {node.type === 'textarea' && (
        <Section title="Text area" open>
          <AttrInput node={node} label="Name" k="name" /><AttrInput node={node} label="Placeholder" k="placeholder" /><AttrInput node={node} label="Rows" k="rows" />
        </Section>
      )}
      {node.type === 'form' && (
        <Section title="Form" open>
          <AttrInput node={node} label="Action" k="action" ph="https://formspree.io/f/…" />
          <Row label="Method"><Select value={node.attrs?.method || 'post'} options={[['post', 'POST'], ['get', 'GET']]} onChange={(v) => setAttr('method', v)} /></Row>
        </Section>
      )}
      {node.type === 'embed' && (
        <Section title="Custom code" open>
          <CommitInput multiline rows={8} className="code" value={node.html} onCommit={(v) => updateNode((n) => { n.html = v; })} />
          <div className="muted small hint">Scripts run in Preview and the exported site, not on the canvas.</div>
        </Section>
      )}

      {!fixed && (
        <Section title="Actions" open>
          <div className="btn-grid">
            <button className="btn" onClick={() => moveSelected(-1)} disabled={idx === 0}><ArrowUp size={12} /> Move up</button>
            <button className="btn" onClick={() => moveSelected(1)} disabled={idx === parent!.children!.length - 1}><ArrowDown size={12} /> Move down</button>
            <button className="btn" onClick={() => select(parent!.id)}><CornerLeftUp size={12} /> Select parent</button>
            <button className="btn" onClick={wrapSelected}><Group size={12} /> Wrap in Div</button>
            <button className="btn" onClick={duplicateSelected}><Copy size={12} /> Duplicate</button>
            {node.type !== 'symbol' && <button className="btn" onClick={createComponent}><Box size={12} /> Component</button>}
            <button className="btn danger" onClick={deleteSelected}><Trash2 size={12} /> Delete</button>
          </div>
        </Section>
      )}
    </div>
  );
}
