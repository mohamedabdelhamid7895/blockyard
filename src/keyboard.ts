/* Editor keyboard shortcuts, shared by the editor window and the canvas iframe. */
import {
  copySelected, deleteSelected, duplicateSelected, exitComponent, moveSelected, paste, saveNow, selectParent,
} from './actions';
import { getState, openModal, redo, undo, useModal } from './store';

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

export function onKeyDown(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === 's') { e.preventDefault(); saveNow(); return; }
  if (isTyping(e) || useModal.getState().name) return;
  if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if ((mod && k === 'z' && e.shiftKey) || (mod && k === 'y')) { e.preventDefault(); redo(); }
  else if (mod && k === 'd') { e.preventDefault(); duplicateSelected(); }
  else if (mod && k === 'c') copySelected();
  else if (mod && k === 'v') { e.preventDefault(); paste(); }
  else if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSelected(); }
  else if (k === 'escape') {
    const { ui, project } = getState();
    const compRoot = ui.editingComponentId ? project.components[ui.editingComponentId]?.root.id : null;
    if (compRoot && (!ui.selectedId || ui.selectedId === compRoot)) exitComponent(); else selectParent();
  }
  else if (e.altKey && k === 'arrowup') { e.preventDefault(); moveSelected(-1); }
  else if (e.altKey && k === 'arrowdown') { e.preventDefault(); moveSelected(1); }
  else if (k === 'p' && !mod && !e.altKey) openModal('preview');
}
