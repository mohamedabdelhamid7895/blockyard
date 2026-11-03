import { Paintbrush, Settings, Zap } from 'lucide-react';
import { setUI, useSelected, useStore } from '../store';
import { Empty } from '../ui';
import { StylePanel } from './StylePanel';
import { SettingsPanel } from './SettingsPanel';
import { InteractionsPanel } from './InteractionsPanel';
import type { RightTab } from '../types';

const TABS: { id: RightTab; icon: typeof Zap; label: string }[] = [
  { id: 'style', icon: Paintbrush, label: 'Style' },
  { id: 'settings', icon: Settings, label: 'Settings' },
  { id: 'interactions', icon: Zap, label: 'Interactions' },
];

export function RightPanel() {
  const tab = useStore((s) => s.ui.right);
  const sel = useSelected();
  return (
    <aside className="right panel">
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} title={t.label} onClick={() => setUI({ right: t.id })}>
            <t.icon size={14} />
          </button>
        ))}
      </nav>
      <div className="panel-body">
        {!sel ? (
          <Empty>Select an element on the canvas or in the Navigator.<br /><br />Tip: open the <b>Add</b> panel (+) on the left and drag an element onto the page.</Empty>
        ) : tab === 'style' ? <StylePanel node={sel.node} />
          : tab === 'settings' ? <SettingsPanel node={sel.node} />
          : <InteractionsPanel node={sel.node} />}
      </div>
    </aside>
  );
}
