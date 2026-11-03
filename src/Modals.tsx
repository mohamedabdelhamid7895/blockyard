import { useEffect, useMemo, useRef, useState } from 'react';
import { Database, Download, ExternalLink, FileText, Monitor, Plus, Smartphone, Tablet, Trash2, X } from 'lucide-react';
import { BP_ORDER, BREAKPOINTS } from './constants';
import { exportFiles, pageHTML, siteFiles } from './codegen';
import { currentPage, itemPageFile, templatePageFor } from './model';
import { closeModal, getState, toast, useModal, useStore } from './store';
import {
  addCollection, addField, addItem, deleteCollection, deleteItem, openTemplatePage, removeField, updateCollection, updateItem,
} from './actions';
import { download, makeZip } from './zip';
import { pickImage } from './files';
import { CommitInput, Select } from './ui';
import type { BP, FieldType } from './types';

function Modal({ title, children, actions, wide }: { title: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && closeModal()}>
      <div className={'modal' + (wide ? ' wide' : '')}>
        <div className="modal-head"><h3>{title}</h3><div className="spacer" />{actions}<button className="icon-btn" onClick={closeModal} title="Close"><X size={16} /></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/* ---- Export ---- */
function ExportModal() {
  const project = useStore((s) => s.project);
  const ui = useStore((s) => s.ui);
  const files = useMemo(() => exportFiles(project), [project]);
  const page = currentPage(project, ui);
  const pageFile = files.find((f) => f.name === `${page.slug}.html`) || files[0];
  const [name, setName] = useState(pageFile.name);
  const file = files.find((f) => f.name === name) || files[0];
  const copy = () => navigator.clipboard.writeText(file.content).then(() => toast('Copied to clipboard'), () => toast('Copy failed — select the text and copy it'));
  return (
    <Modal wide title="Export code" actions={<>
      <button className="btn" onClick={copy}>Copy</button>
      <button className="btn primary" onClick={() => { download('website.zip', makeZip(files)); toast('Downloading website.zip'); }}><Download size={13} /> Download site .zip</button>
    </>}>
      <div className="export">
        <div className="export-files">
          {files.map((f) => (
            <button key={f.name} className={f.name === file.name ? 'on' : ''} onClick={() => setName(f.name)}>
              <FileText size={12} /> {f.name}
            </button>
          ))}
          <div className="muted small pad">
            {files.length - 1} HTML file{files.length > 2 ? 's' : ''} and one stylesheet. Upload the ZIP's contents to any static host: Netlify, Vercel, GitHub Pages or S3.
          </div>
          {!file.name.startsWith('css/') && (
            <button className="btn" onClick={() => {
              const f = siteFiles(project).find((x) => x.name === file.name)!;
              download(file.name, pageHTML(project, f.page!, { item: f.item, inlineCSS: true }), 'text/html');
            }}>Download this page as one file</button>
          )}
        </div>
        <textarea className="code-view" readOnly spellCheck={false} value={file.content} />
      </div>
    </Modal>
  );
}

/* ---- Preview ---- */
const PREVIEW_NAV = `<script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a');if(!a)return;var href=a.getAttribute('href')||'';if(/^[\\w-]+\\.html(#.*)?$/.test(href)){e.preventDefault();parent.postMessage({blockyardNav:href},'*');}else if(href==='#'){e.preventDefault();}});document.addEventListener('submit',function(e){e.preventDefault();alert('Form submitted (preview)');});document.addEventListener('keydown',function(e){if(e.key==='Escape')parent.postMessage({blockyardEsc:1},'*');});<\/script>\n`;
const BP_ICONS: Record<BP, React.ReactNode> = {
  desktop: <Monitor size={14} />, tablet: <Tablet size={14} />, landscape: <Smartphone size={14} className="rot" />, mobile: <Smartphone size={14} />,
};

function PreviewModal() {
  const project = useStore((s) => s.project);
  const startBp = useStore((s) => s.ui.bp);
  const [bp, setBp] = useState<BP>(startBp);
  const files = useMemo(() => siteFiles(project), [project]);
  const [fileName, setFileName] = useState(() => {
    const { ui } = getState();
    const page = currentPage(project, ui);
    const coll = page.collectionId ? project.collections.find((c) => c.id === page.collectionId) : null;
    const item = coll?.items.find((i) => i.id === ui.cmsItemId) || coll?.items[0];
    return coll && item ? itemPageFile(coll, item) : `${page.slug}.html`;
  });
  const file = files.find((f) => f.name === fileName) || files[0];
  const html = useMemo(() => file ? pageHTML(project, file.page!, { item: file.item, inlineCSS: true, extraHead: PREVIEW_NAV }) : '<p>No pages</p>', [project, file]);
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.blockyardEsc) closeModal();
      const nav = e.data?.blockyardNav as string | undefined;
      if (nav) {
        const target = nav.replace(/#.*$/, '');
        if (files.some((f) => f.name === target)) setFileName(target); else toast(`${target} is not a page in this site`);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); closeModal(); } };
    window.addEventListener('message', onMsg);
    document.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('message', onMsg); document.removeEventListener('keydown', onKey, true); };
  }, [files]);

  const width = BREAKPOINTS[bp].width;
  return (
    <div className="preview-back">
      <div className="preview-bar">
        <span className="muted">Preview</span>
        <Select value={file?.name || ''} options={files.map((f) => f.name)} onChange={setFileName} className="preview-select" />
        <div className="spacer" />
        <div className="seg bp-seg">
          {BP_ORDER.map((b) => <button key={b} className={bp === b ? 'on' : ''} title={BREAKPOINTS[b].label} onClick={() => setBp(b)}>{BP_ICONS[b]}</button>)}
        </div>
        <div className="spacer" />
        <button className="tb-btn" onClick={() => {
          const w = window.open('', '_blank');
          if (w && file) { w.document.write(pageHTML(project, file.page!, { item: file.item, inlineCSS: true })); w.document.close(); }
        }}><ExternalLink size={13} /> New tab</button>
        <button className="tb-btn primary" onClick={closeModal}>Exit preview</button>
      </div>
      <div className="preview-stage">
        <iframe ref={ref} title="Preview" srcDoc={html} style={{ width: width ? width + 'px' : '100%' }} />
      </div>
    </div>
  );
}

/* ---- Shortcuts ---- */
function ShortcutsModal() {
  const rows = [
    ['Delete / Backspace', 'Delete the selected element'], ['Ctrl/⌘ + D', 'Duplicate'], ['Ctrl/⌘ + C / V', 'Copy / paste an element'],
    ['Ctrl/⌘ + Z', 'Undo'], ['Ctrl/⌘ + Shift + Z, Ctrl + Y', 'Redo'], ['Esc', 'Select the parent (or leave a component)'],
    ['Alt + ↑ / ↓', 'Move the element up / down'], ['Double-click text', 'Edit text in place (Enter to finish, Shift+Enter for a new line)'],
    ['Double-click a component', 'Edit the component'], ['↑ / ↓ in a size field', 'Nudge the value (Shift ×10, Alt ×0.1)'],
    ['Click a blue label', 'Reset that style'], ['Ctrl/⌘ + S', 'Save now'], ['P', 'Preview'],
  ];
  return (
    <Modal title="Keyboard shortcuts">
      <table className="kbd-table"><tbody>{rows.map(([k, d]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{d}</td></tr>)}</tbody></table>
    </Modal>
  );
}

/* ---- CMS ---- */
const FIELD_TYPES: [FieldType, string][] = [
  ['plaintext', 'Plain text'], ['richtext', 'Rich text'], ['image', 'Image'], ['link', 'Link'], ['number', 'Number'], ['date', 'Date'], ['color', 'Color'],
];

function CmsModal() {
  const arg = useModal((s) => s.arg);
  const collections = useStore((s) => s.project.collections);
  const project = useStore((s) => s.project);
  const [collId, setCollId] = useState<string | null>(arg && arg !== 'new' ? arg : collections[0]?.id || null);
  const [creating, setCreating] = useState(arg === 'new' || !collections.length);
  const [newName, setNewName] = useState('');
  const [tab, setTab] = useState<'items' | 'fields' | 'settings'>('items');
  const coll = collections.find((c) => c.id === collId) || null;
  const [itemId, setItemId] = useState<string | null>(null);
  const item = coll?.items.find((i) => i.id === itemId) || null;
  const [fieldName, setFieldName] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('plaintext');

  const create = () => {
    if (!newName.trim()) return;
    const id = addCollection(newName.trim());
    setCollId(id); setCreating(false); setNewName(''); setTab('fields');
  };

  return (
    <Modal wide title={<><Database size={15} /> CMS</>}>
      <div className="cms">
        <div className="cms-side">
          <h4>Collections</h4>
          {collections.map((c) => (
            <button key={c.id} className={!creating && c.id === collId ? 'on' : ''} onClick={() => { setCollId(c.id); setCreating(false); setItemId(null); }}>
              <Database size={12} /> <span>{c.name}</span> <span className="count">{c.items.length}</span>
            </button>
          ))}
          <button className={'new' + (creating ? ' on' : '')} onClick={() => setCreating(true)}><Plus size={12} /> New collection</button>
        </div>

        <div className="cms-main">
          {creating ? (
            <div className="cms-new">
              <h3>New collection</h3>
              <p className="muted">Name it after what it holds, in the plural: Blog Posts, Team Members, Products.</p>
              <input className="f-input big" autoFocus placeholder="e.g. Blog Posts" value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()} />
              <div className="btn-row"><button className="btn primary" onClick={create} disabled={!newName.trim()}>Create collection</button></div>
            </div>
          ) : !coll ? <div className="empty-hint">Choose a collection.</div> : (<>
            <div className="cms-tabs">
              <h3>{coll.name}</h3>
              {(['items', 'fields', 'settings'] as const).map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
              <div className="spacer" />
              <button className="btn" onClick={() => { closeModal(); openTemplatePage(coll.id); }}>
                {templatePageFor(project, coll.id) ? 'Open template page' : 'Create template page'}
              </button>
            </div>

            {tab === 'items' && (
              <div className="cms-items">
                <div className="cms-list">
                  <button className="btn primary" onClick={() => setItemId(addItem(coll.id))}><Plus size={12} /> New {coll.name.replace(/s$/, '')}</button>
                  {coll.items.map((it) => (
                    <button key={it.id} className={'cms-item' + (it.id === itemId ? ' on' : '')} onClick={() => setItemId(it.id)}>
                      <span>{it.data.name || 'Untitled'}</span><span className="muted small">/{it.data.slug}</span>
                    </button>
                  ))}
                  {!coll.items.length && <div className="muted small pad">No items yet.</div>}
                </div>
                <div className="cms-editor">
                  {!item ? <div className="empty-hint">Select an item to edit it, or create a new one.</div> : (<>
                    {coll.fields.map((f) => (
                      <div key={f.id} className="cms-field">
                        <label>{f.name} <span className="muted small">{FIELD_TYPES.find((t) => t[0] === f.type)?.[1]}</span></label>
                        {f.type === 'richtext'
                          ? <CommitInput multiline rows={6} value={item.data[f.slug]} onCommit={(v) => updateItem(coll.id, item.id, f.slug, v)} />
                          : f.type === 'image' ? (
                            <div className="cms-image">
                              {item.data[f.slug] && <img src={item.data[f.slug]} alt="" />}
                              <CommitInput value={item.data[f.slug]} placeholder="Image URL" onCommit={(v) => updateItem(coll.id, item.id, f.slug, v)} />
                              <button className="btn" onClick={() => pickImage().then((src) => src && updateItem(coll.id, item.id, f.slug, src))}>Upload…</button>
                            </div>
                          ) : (
                            <CommitInput value={item.data[f.slug]} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                              placeholder={f.type === 'link' ? 'https://…' : f.type === 'color' ? '#146ef5' : ''}
                              onCommit={(v) => updateItem(coll.id, item.id, f.slug, v)} />
                          )}
                      </div>
                    ))}
                    <div className="btn-row">
                      <button className="btn danger" onClick={() => { deleteItem(coll.id, item.id); setItemId(null); }}><Trash2 size={12} /> Delete item</button>
                    </div>
                  </>)}
                </div>
              </div>
            )}

            {tab === 'fields' && (
              <div className="cms-fields">
                {coll.fields.map((f) => (
                  <div key={f.id} className="field-row">
                    <span className="fname">{f.name}</span>
                    <code>{f.slug}</code>
                    <span className="muted">{FIELD_TYPES.find((t) => t[0] === f.type)?.[1]}</span>
                    {f.slug === 'name' || f.slug === 'slug'
                      ? <span className="muted small">Required</span>
                      : <button className="icon-btn" title="Delete field" onClick={() => confirm(`Delete the “${f.name}” field and its data?`) && removeField(coll.id, f.id)}><Trash2 size={12} /></button>}
                  </div>
                ))}
                <div className="field-add">
                  <input className="f-input" placeholder="Field name" value={fieldName} onChange={(e) => setFieldName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && fieldName.trim()) { addField(coll.id, fieldName.trim(), fieldType); setFieldName(''); } }} />
                  <Select value={fieldType} options={FIELD_TYPES} onChange={(v) => setFieldType(v as FieldType)} />
                  <button className="btn primary" disabled={!fieldName.trim()} onClick={() => { addField(coll.id, fieldName.trim(), fieldType); setFieldName(''); }}><Plus size={12} /> Add field</button>
                </div>
              </div>
            )}

            {tab === 'settings' && (
              <div className="cms-settings">
                <div className="f-row"><label className="f-label">Name</label><CommitInput value={coll.name} onCommit={(v) => v.trim() && updateCollection(coll.id, { name: v.trim() })} /></div>
                <div className="f-row"><label className="f-label">URL slug</label><CommitInput value={coll.slug} onCommit={(v) => updateCollection(coll.id, { slug: v })} /></div>
                <div className="muted small hint">Item pages export as <code>{coll.slug}-&lt;item-slug&gt;.html</code>.</div>
                <div className="btn-row"><button className="btn danger" onClick={() => { deleteCollection(coll.id); setCollId(null); }}><Trash2 size={12} /> Delete collection</button></div>
              </div>
            )}
          </>)}
        </div>
      </div>
    </Modal>
  );
}

export function Modals() {
  const name = useModal((s) => s.name);
  if (name === 'export') return <ExportModal />;
  if (name === 'preview') return <PreviewModal />;
  if (name === 'shortcuts') return <ShortcutsModal />;
  if (name === 'cms') return <CmsModal />;
  return null;
}

