import { useState } from 'react';
import { Copy, Pencil, Plus, X } from 'lucide-react';
import { BREAKPOINTS, FONTS, STATES, WEIGHTS } from '../constants';
import { cascade, nodeLabel, selectorKey, selectorUsage } from '../model';
import { setUI, useStore } from '../store';
import { addClass, duplicateClass, liveStyle, removeClass, renameClass, setStyle } from '../actions';
import { CommitInput, Empty, Menu, Section, Select } from '../ui';
import type { Node, PseudoState, StyleMap } from '../types';

type FieldType = 'unit' | 'text' | 'select' | 'color' | 'seg' | 'bgimg';
interface FieldSpec {
  p: string;
  label?: string;
  type: FieldType;
  options?: (string | [string, string])[];
  ph?: string;
  list?: string;
  when?: (s: StyleMap) => boolean;
  only?: string[];
}

const isFlex = (s: StyleMap) => /flex/.test(s.display || '');
const isGrid = (s: StyleMap) => /grid/.test(s.display || '');
const isFlexOrGrid = (s: StyleMap) => isFlex(s) || isGrid(s);
const pretty = (p: string) => p.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

const SECTIONS: { title: string; box?: boolean; fields?: FieldSpec[] }[] = [
  { title: 'Layout', fields: [
    { p: 'display', type: 'seg', options: [['block', 'Block'], ['flex', 'Flex'], ['grid', 'Grid'], ['inline-block', 'Inline'], ['none', 'None']] },
    { p: 'flex-direction', label: 'Direction', type: 'seg', options: [['row', 'Horizontal'], ['column', 'Vertical']], when: isFlex },
    { p: 'justify-content', label: 'Justify', type: 'select', when: isFlexOrGrid,
      options: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'] },
    { p: 'align-items', label: 'Align', type: 'select', when: isFlexOrGrid, options: ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'] },
    { p: 'flex-wrap', label: 'Children', type: 'seg', options: [['nowrap', "Don't wrap"], ['wrap', 'Wrap']], when: isFlex },
    { p: 'grid-template-columns', label: 'Columns', type: 'text', ph: '1fr 1fr', when: isGrid },
    { p: 'grid-template-rows', label: 'Rows', type: 'text', ph: 'auto', when: isGrid },
    { p: 'gap', type: 'unit', when: isFlexOrGrid },
  ] },
  { title: 'Spacing', box: true },
  { title: 'Size', fields: [
    { p: 'width', type: 'unit', ph: 'Auto' }, { p: 'height', type: 'unit', ph: 'Auto' },
    { p: 'min-width', label: 'Min W', type: 'unit', ph: '0' }, { p: 'min-height', label: 'Min H', type: 'unit', ph: '0' },
    { p: 'max-width', label: 'Max W', type: 'unit', ph: 'None' }, { p: 'max-height', label: 'Max H', type: 'unit', ph: 'None' },
    { p: 'overflow', type: 'seg', options: [['visible', 'Show'], ['hidden', 'Hide'], ['auto', 'Auto'], ['scroll', 'Scroll']] },
    { p: 'object-fit', label: 'Fit', type: 'select', options: ['fill', 'contain', 'cover', 'none'], only: ['image', 'video'] },
    { p: 'aspect-ratio', label: 'Ratio', type: 'text', ph: 'e.g. 16 / 9' },
  ] },
  { title: 'Position', fields: [
    { p: 'position', type: 'select', options: ['static', 'relative', 'absolute', 'fixed', 'sticky'] },
    ...['top', 'right', 'bottom', 'left'].map((p) => ({ p, type: 'unit' as const, when: (s: StyleMap) => !!s.position && s.position !== 'static' })),
    { p: 'z-index', label: 'Z-index', type: 'text', ph: 'Auto' },
  ] },
  { title: 'Typography', fields: [
    { p: 'font-family', label: 'Font', type: 'select', options: FONTS },
    { p: 'font-weight', label: 'Weight', type: 'select', options: WEIGHTS },
    { p: 'font-size', label: 'Size', type: 'unit' },
    { p: 'line-height', label: 'Height', type: 'text', ph: 'e.g. 1.5' },
    { p: 'color', type: 'color' },
    { p: 'text-align', label: 'Align', type: 'seg', options: [['left', 'Left'], ['center', 'Center'], ['right', 'Right'], ['justify', 'Justify']] },
    { p: 'letter-spacing', label: 'Spacing', type: 'unit' },
    { p: 'font-style', label: 'Style', type: 'seg', options: [['normal', 'Normal'], ['italic', 'Italic']] },
    { p: 'text-transform', label: 'Case', type: 'seg', options: [['none', '—'], ['uppercase', 'AA'], ['capitalize', 'Aa'], ['lowercase', 'aa']] },
    { p: 'text-decoration', label: 'Decoration', type: 'seg', options: [['none', 'None'], ['underline', 'Under'], ['line-through', 'Strike']] },
  ] },
  { title: 'Backgrounds', fields: [
    { p: 'background-color', label: 'Color', type: 'color' },
    { p: 'background-image', label: 'Image', type: 'bgimg', ph: 'URL or gradient' },
    { p: 'background-size', label: 'Size', type: 'seg', options: [['auto', 'Auto'], ['cover', 'Cover'], ['contain', 'Contain']] },
    { p: 'background-position', label: 'Position', type: 'select', options: ['center', 'top', 'bottom', 'left', 'right'] },
    { p: 'background-repeat', label: 'Repeat', type: 'select', options: ['no-repeat', 'repeat', 'repeat-x', 'repeat-y'] },
  ] },
  { title: 'Borders', fields: [
    { p: 'border-radius', label: 'Radius', type: 'unit' },
    { p: 'border-width', label: 'Width', type: 'unit' },
    { p: 'border-style', label: 'Style', type: 'seg', options: [['none', 'None'], ['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']] },
    { p: 'border-color', label: 'Color', type: 'color' },
  ] },
  { title: 'Effects', fields: [
    { p: 'opacity', type: 'text', ph: '1' },
    { p: 'box-shadow', label: 'Shadow', type: 'text', list: 'shadow-list', ph: 'None' },
    { p: 'transform', type: 'text', ph: 'e.g. rotate(3deg)' },
    { p: 'transition', type: 'text', ph: 'all 0.2s ease' },
    { p: 'filter', type: 'text', ph: 'e.g. blur(4px)' },
    { p: 'cursor', type: 'select', options: ['auto', 'pointer', 'default', 'text', 'not-allowed'] },
  ] },
  { title: 'Flex child', fields: [
    { p: 'flex', label: 'Sizing', type: 'text', ph: '0 1 auto' },
    { p: 'align-self', label: 'Align self', type: 'select', options: ['auto', 'flex-start', 'center', 'flex-end', 'stretch'] },
    { p: 'order', type: 'text', ph: '0' },
  ] },
];

function normUnit(v: string) {
  v = String(v).trim();
  return /^-?\d*\.?\d+$/.test(v) && v !== '0' ? v + 'px' : v === '0' ? '0px' : v;
}

function nudge(v: string, dir: 1 | -1, e: React.KeyboardEvent) {
  const m = (v || '0px').match(/^(-?\d*\.?\d+)([a-z%]*)$/i);
  if (!m) return null;
  const step = (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * dir;
  return Math.round((parseFloat(m[1]) + step) * 100) / 100 + (m[2] || 'px');
}

const colorCtx = document.createElement('canvas').getContext('2d')!;
function toHex(v: string | undefined) {
  if (!v) return null;
  v = String(v).trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) return '#' + [...v.slice(1)].map((c) => c + c).join('').toLowerCase();
  colorCtx.fillStyle = '#000000';
  colorCtx.fillStyle = v;
  const out = String(colorCtx.fillStyle);
  if (/^#[0-9a-f]{6}$/i.test(out)) return out;
  const m = out.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('') : null;
}

function Control({ spec, own, inh }: { spec: FieldSpec; own?: string; inh?: string }) {
  const set = (v: string) => setStyle(spec.p, v);
  switch (spec.type) {
    case 'unit':
      return <CommitInput value={own} placeholder={inh ?? spec.ph} onCommit={(v) => set(normUnit(v))}
        onArrow={(dir, e) => nudge(own || inh || '0px', dir, e)} />;
    case 'text':
      return <CommitInput value={own} placeholder={inh ?? spec.ph} list={spec.list} onCommit={set} />;
    case 'bgimg': {
      const strip = (v?: string) => (v ? v.replace(/^url\((["']?)(.*)\1\)$/, '$2') : v);
      return <CommitInput value={strip(own)} placeholder={strip(inh) ?? spec.ph}
        onCommit={(v) => set(v && !/^(url\(|[a-z-]*gradient\(|none$)/i.test(v.trim()) ? `url("${v.trim()}")` : v)} />;
    }
    case 'select': {
      const labels = Object.fromEntries((spec.options || []).map((o) => (Array.isArray(o) ? o : [o, o])));
      const opts = own && !(own in labels) ? [...(spec.options || []), own] : spec.options || [];
      return <Select value={own ?? ''} onChange={set} options={opts}
        placeholder={inh != null ? `${labels[inh] || inh} (inherited)` : '—'} />;
    }
    case 'color':
      return (
        <div className="f-color">
          <label className="swatch" style={{ background: own || inh || 'transparent' }}>
            <input type="color" value={toHex(own ?? inh) || '#000000'}
              onInput={(e) => liveStyle(spec.p, (e.target as HTMLInputElement).value)}
              onChange={(e) => set(e.target.value)} />
          </label>
          <CommitInput value={own} placeholder={inh ?? 'None'} onCommit={set} />
        </div>
      );
    case 'seg':
      return (
        <div className="seg f-seg">
          {(spec.options as [string, string][]).map(([v, l]) => (
            <button key={v} title={v} className={own === v ? 'on' : own == null && inh === v ? 'inh' : ''}
              onClick={() => set(own === v ? '' : v)}>{l}</button>
          ))}
        </div>
      );
  }
}

function FieldRow({ spec, own, inh }: { spec: FieldSpec; own?: string; inh?: string }) {
  const cls = own != null ? 'set' : inh != null ? 'inherited' : '';
  return (
    <div className="f-row">
      <label className={'f-label ' + cls} title={own != null ? `${spec.p} — click to reset` : spec.p}
        onClick={() => own != null && setStyle(spec.p, '')}>{spec.label || pretty(spec.p)}</label>
      <Control spec={spec} own={own} inh={inh} />
    </div>
  );
}

function BoxModel({ own, inh }: { own: StyleMap; inh: StyleMap }) {
  const cell = (p: string, pos: string) => (
    <CommitInput key={p} className={`bm-in ${pos} ${own[p] != null ? 'set' : inh[p] != null ? 'inherited' : ''}`}
      value={own[p]} placeholder={(inh[p] ?? '0').replace(/px$/, '')} title={`${p} (↑/↓ to nudge, Shift ×10)`}
      onCommit={(v) => setStyle(p, normUnit(v))} onArrow={(dir, e) => nudge(own[p] || inh[p] || '0px', dir, e)} />
  );
  return (
    <div className="bm bm-margin">
      <span className="bm-tag">MARGIN</span>
      {cell('margin-top', 't')}{cell('margin-left', 'l')}
      <div className="bm bm-padding">
        <span className="bm-tag">PADDING</span>
        {cell('padding-top', 't')}{cell('padding-left', 'l')}<div className="bm-core" />{cell('padding-right', 'r')}{cell('padding-bottom', 'b')}
      </div>
      {cell('margin-right', 'r')}{cell('margin-bottom', 'b')}
    </div>
  );
}

function SelectorBar({ node }: { node: Node }) {
  const project = useStore((s) => s.project);
  const pstate = useStore((s) => s.ui.pstate);
  const bp = useStore((s) => s.ui.bp);
  const [adding, setAdding] = useState('');
  const isBody = node.type === 'body';
  const key = selectorKey(node.classes);
  const usage = key ? selectorUsage(project, key) : 0;
  const allClasses = [...new Set(Object.keys(project.classes).flatMap((k) => k.split('.')))].filter((c) => !node.classes.includes(c));

  return (
    <div className="selector">
      <div className="selector-top">
        <span className="muted">Selector</span>
        <Select className="state-select" value={pstate} title="Style a state"
          onChange={(v) => setUI({ pstate: v as PseudoState })}
          options={STATES.map((s) => [s.id, s.id === 'none' ? 'None' : s.label] as [string, string])} />
      </div>
      <div className={'selector-field' + (pstate !== 'none' ? ' state' : '')}>
        {node.classes.map((c, i) => (
          <span key={c} className={'pill' + (i > 0 ? ' combo' : '')} title={i > 0 ? 'Combo class' : 'Base class'}>
            {c}
            {!isBody && (
              <Menu trigger={() => <span className="pill-more">▾</span>}>
                {(close) => (<>
                  <button onClick={() => { close(); renameClass(c); }}><Pencil size={12} /> Rename class</button>
                  <button onClick={() => { close(); duplicateClass(); }}><Copy size={12} /> Duplicate class</button>
                  <button onClick={() => { close(); removeClass(i); }}><X size={12} /> Remove{i === 0 && node.classes.length > 1 ? ' (and combos)' : ''}</button>
                </>)}
              </Menu>
            )}
          </span>
        ))}
        {pstate !== 'none' && <span className="pill state">{STATES.find((s) => s.id === pstate)!.label}</span>}
        {!isBody && (
          <input className="pill-input" list="class-list" value={adding} spellCheck={false}
            placeholder={node.classes.length ? '+ combo class' : 'Add a class…'}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && adding.trim()) { addClass(adding); setAdding(''); }
              if (e.key === 'Backspace' && !adding && node.classes.length) removeClass(node.classes.length - 1);
            }} />
        )}
        <datalist id="class-list">{allClasses.map((c) => <option key={c} value={c} />)}</datalist>
      </div>
      <div className="selector-info">
        {isBody ? 'Body styles apply to every page.'
          : !node.classes.length ? 'Add a class to style this element.'
          : usage > 1 ? <><b>{usage}</b> elements use this selector. Changes affect all of them. <button className="link-btn" onClick={duplicateClass}>Duplicate class</button></>
          : `1 element on this site uses this selector.`}
      </div>
      {(bp !== 'desktop' || pstate !== 'none') && (
        <div className="bp-note">
          {bp !== 'desktop' && <>Editing <b>{BREAKPOINTS[bp].label}</b> ({BREAKPOINTS[bp].media!.slice(1, -1)}). </>}
          {pstate !== 'none' && <>Styling the <b>{STATES.find((s) => s.id === pstate)!.label}</b> state. </>}
          Orange values are inherited.
        </div>
      )}
    </div>
  );
}

export function StylePanel({ node }: { node: Node }) {
  const project = useStore((s) => s.project);
  const bp = useStore((s) => s.ui.bp);
  const pstate = useStore((s) => s.ui.pstate);
  const collapsed = useStore((s) => s.ui.collapsedSecs);

  if (node.type === 'symbol') {
    return <Empty>This is an instance of the <b>{nodeLabel(node, project)}</b> component. Double-click it, or use Settings → Edit component, to change its styles.</Empty>;
  }
  const { own, inherited, effective } = cascade(project, node.classes, bp, pstate);
  const toggle = (t: string) => setUI({ collapsedSecs: collapsed.includes(t) ? collapsed.filter((x) => x !== t) : [...collapsed, t] });

  return (
    <div className="style-panel">
      <SelectorBar node={node} />
      {node.classes.length > 0 && SECTIONS.map((sec) => (
        <Section key={sec.title} title={sec.title} open={!collapsed.includes(sec.title)} onToggle={() => toggle(sec.title)}>
          {sec.box ? <BoxModel own={own} inh={inherited} /> : sec.fields!.filter((f) => (!f.only || f.only.includes(node.type)) && (!f.when || f.when(effective)))
            .map((f) => <FieldRow key={f.p} spec={f} own={own[f.p]} inh={inherited[f.p]} />)}
        </Section>
      ))}
      <datalist id="shadow-list">
        <option value="none" /><option value="0 1px 3px rgba(0,0,0,.12)" /><option value="0 10px 30px rgba(0,0,0,.12)" /><option value="0 25px 60px rgba(0,0,0,.2)" />
      </datalist>
      {node.classes.length === 0 && node.type !== 'body' && (
        <div className="pad"><button className="btn" onClick={() => addClass(nodeLabel(node).toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).slice(2, 5))}><Plus size={12} /> Create a class</button></div>
      )}
    </div>
  );
}

