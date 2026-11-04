/* Page settings: A/B test controls. */
import { useState } from 'react';
import { FlaskConical, Pause, Play, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../api';
import { createAbTest, deleteAbTest, openPage, replaceTexts, updateAbTest } from '../actions';
import { toast, useStore, useTarget } from '../store';
import { Section, Select } from '../ui';
import { walkTree } from '../model';
import type { AbGoal, Page } from '../types';

export function AbTestSection({ page }: { page: Page }) {
  const pages = useStore((s) => s.project.pages);
  const target = useTarget();
  const [busy, setBusy] = useState(false);
  if (page.collectionId) return null;

  if (page.variantOf) {
    const control = pages.find((p) => p.id === page.variantOf);
    return (
      <Section title="A/B test" open right={<FlaskConical size={12} />}>
        <div className="ab-badge">Variant B of <b>{control?.name}</b></div>
        <p className="muted small">Change anything on this page. Visitors in group B see it at /{control?.slug === 'index' ? '' : control?.slug}; it is never linked or listed on its own.</p>
        {control && <button className="btn" onClick={() => openPage(control.id)}>Open original (A)</button>}
      </Section>
    );
  }

  const t = page.abTest;
  const aiRewrite = async (variantId: string) => {
    const variant = useStoreGet().project.pages.find((p) => p.id === variantId);
    if (!variant) return;
    const texts: { id: string; text: string; kind: string }[] = [];
    walkTree(variant.root, (n) => { if (n.text && texts.length < 30 && /heading|button|paragraph|link/.test(n.type)) texts.push({ id: n.id, text: n.text, kind: `${n.type} <${n.tag}>` }); });
    setBusy(true);
    try {
      const out = await api<{ texts: { id: string; text: string }[] }>(`/ai/${target.projectId}/variant-copy`, { body: { texts } });
      replaceTexts(variantId, out.texts);
      toast('AI rewrote the headings and buttons of variant B');
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };

  if (!t) {
    return (
      <Section title="A/B test" open right={<FlaskConical size={12} />}>
        <p className="muted small">Test a different version of this page against the original. Visitors are split automatically and conversions are counted for you.</p>
        <div className="btn-row">
          <button className="btn primary" onClick={() => { const id = createAbTest(page.id); if (id) openPage(id); }}><FlaskConical size={12} /> Create variant B</button>
          {target.kind === 'remote' && target.hasAiKey && (
            <button className="btn ai-btn" disabled={busy} onClick={async () => { const id = createAbTest(page.id); if (id) { await aiRewrite(id); openPage(id); } }}>
              <Sparkles size={12} /> {busy ? 'Writing…' : 'Create with AI copy'}</button>
          )}
        </div>
      </Section>
    );
  }

  const goalValue = t.goal.type === 'page' ? `page:${t.goal.page}` : t.goal.type === 'click' ? 'click' : t.goal.type;
  const setGoal = (v: string) => {
    const goal: AbGoal = v.startsWith('page:') ? { type: 'page', page: v.slice(5) } : v === 'click' ? { type: 'click', selector: t.goal.type === 'click' ? t.goal.selector : '.button' } : { type: v as 'cta' | 'form' };
    updateAbTest(page.id, { goal });
  };
  return (
    <Section title="A/B test" open right={<FlaskConical size={12} />}>
      <div className={'ab-badge ' + t.status}>{t.status === 'running' ? 'Running' : t.status === 'paused' ? 'Paused' : 'Draft, not started'}</div>
      <div className="f-row"><label className="f-label">Goal</label>
        <Select value={goalValue} onChange={setGoal} options={[['cta', 'Button and CTA clicks'], ['form', 'Form submissions'], ['click', 'Clicks on a selector'],
          ...pages.filter((p) => !p.variantOf && !p.collectionId && p.id !== page.id).map((p) => [`page:${p.slug}`, `Visits ${p.name}`] as [string, string])]} /></div>
      {t.goal.type === 'click' && (
        <div className="f-row"><label className="f-label">Selector</label>
          <input className="f-input" defaultValue={t.goal.selector} onBlur={(e) => updateAbTest(page.id, { goal: { type: 'click', selector: e.target.value || '.button' } })} /></div>
      )}
      <div className="f-row"><label className="f-label">Traffic to B</label>
        <input type="range" min={10} max={90} step={5} value={t.split} onChange={(e) => updateAbTest(page.id, { split: Number(e.target.value) })} />
        <span className="unit">{t.split}%</span></div>
      <div className="btn-row">
        <button className="btn" onClick={() => openPage(t.variantPageId)}>Edit variant B</button>
        {target.kind === 'remote' && target.hasAiKey && <button className="btn ai-btn" disabled={busy} onClick={() => aiRewrite(t.variantPageId)}><Sparkles size={12} /> {busy ? 'Writing…' : 'Rewrite B with AI'}</button>}
      </div>
      <div className="btn-row">
        {t.status === 'running'
          ? <button className="btn" onClick={() => updateAbTest(page.id, { status: 'paused' })}><Pause size={12} /> Pause</button>
          : <button className="btn primary" onClick={() => updateAbTest(page.id, { status: 'running' })}><Play size={12} /> {t.status === 'paused' ? 'Resume' : 'Start test'}</button>}
        <button className="btn danger" onClick={() => confirm('Delete the test and variant B? The original page stays.') && deleteAbTest(page.id)}><Trash2 size={12} /> Delete test</button>
      </div>
      <p className="muted small">Publish to apply changes. Results and “pick a winner” are on the site dashboard → A/B tests. Tests run on Blockyard hosting, not in exported ZIPs.</p>
    </Section>
  );
}

const useStoreGet = () => useStore.getState();
