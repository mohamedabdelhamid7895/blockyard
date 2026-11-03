import { Play, Plus, Trash2, Zap } from 'lucide-react';
import { ANIMS, EASINGS, TRIGGERS, newInteraction } from '../interactions';
import { addInteraction, removeInteraction, updateInteraction } from '../actions';
import { playInteraction } from '../canvas/Canvas';
import { CommitInput, Empty, Section, Select } from '../ui';
import type { IxTrigger, Node } from '../types';

export function InteractionsPanel({ node }: { node: Node }) {
  const list = node.ix || [];
  if (node.type === 'body' || node.type === 'collectionitem') {
    return <Empty>Select an element on the page to add interactions to it.</Empty>;
  }
  return (
    <div>
      <Section title="Element trigger" open right={
        <button className="icon-btn" title="Add an interaction" onClick={() => addInteraction(newInteraction())}><Plus size={14} /></button>
      }>
        {!list.length && (
          <div className="ix-empty">
            <Zap size={18} />
            <p>Animate this element when the page loads, when it scrolls into view, or on hover or click.</p>
            <button className="btn primary" onClick={() => addInteraction(newInteraction())}><Plus size={12} /> Add interaction</button>
          </div>
        )}
        {list.map((x) => {
          const anim = ANIMS.find((a) => a.id === x.anim);
          return (
            <div key={x.id} className="ix-card">
              <div className="ix-head">
                <Zap size={12} />
                <span>{TRIGGERS.find((t) => t.id === x.trigger)?.label} → {anim?.label}</span>
                <button className="icon-btn" title="Preview on canvas" onClick={() => playInteraction(node.id, x)}><Play size={12} /></button>
                <button className="icon-btn" title="Remove" onClick={() => removeInteraction(x.id)}><Trash2 size={12} /></button>
              </div>
              <div className="f-row"><label className="f-label">Trigger</label>
                <Select value={x.trigger} options={TRIGGERS.map((t) => [t.id, t.label] as [string, string])}
                  onChange={(v) => updateInteraction(x.id, { trigger: v as IxTrigger })} /></div>
              <div className="f-row"><label className="f-label">Animation</label>
                <select className="f-input" value={x.anim} onChange={(e) => updateInteraction(x.id, { anim: e.target.value })}>
                  <optgroup label="Appear">{ANIMS.filter((a) => a.entrance).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</optgroup>
                  <optgroup label="Emphasis">{ANIMS.filter((a) => !a.entrance).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</optgroup>
                </select></div>
              <div className="f-row"><label className="f-label">Duration</label>
                <CommitInput value={String(x.duration)} type="number" onCommit={(v) => updateInteraction(x.id, { duration: Math.max(0, +v || 0) })} /><span className="unit">ms</span></div>
              <div className="f-row"><label className="f-label">Delay</label>
                <CommitInput value={String(x.delay)} type="number" onCommit={(v) => updateInteraction(x.id, { delay: Math.max(0, +v || 0) })} /><span className="unit">ms</span></div>
              <div className="f-row"><label className="f-label">Easing</label>
                <Select value={x.easing} options={EASINGS} onChange={(v) => updateInteraction(x.id, { easing: v })} /></div>
              {x.trigger === 'scroll' && (
                <div className="f-row"><label className="f-label" />
                  <label className="check"><input type="checkbox" checked={x.once} onChange={(e) => updateInteraction(x.id, { once: e.target.checked })} /> Only the first time</label></div>
              )}
              <div className="muted small">{TRIGGERS.find((t) => t.id === x.trigger)?.hint}{anim?.entrance && (x.trigger === 'hover' || x.trigger === 'click') ? '. Appear animations work best on load or scroll.' : '.'}</div>
            </div>
          );
        })}
      </Section>
      <div className="muted small pad">Interactions play in Preview and on the exported site. Press ▶ to preview one on the canvas.</div>
    </div>
  );
}
