/* Editor state: the project (with undo/redo history) plus UI state, in one zustand store. */
import { create } from 'zustand';
import { produce } from 'immer';
import { LEGACY_STORAGE_KEY, STORAGE_KEY } from './constants';
import { currentPage, currentRoot, findNode, migrate } from './model';
import { starterProject } from './templates';
import type { Node, Project, UIState } from './types';

export type SaveState = 'saved' | 'saving' | 'error' | 'conflict';

interface Store {
  project: Project;
  ui: UIState;
  past: Project[];
  future: Project[];
  /** Project before a live (uncommitted) change such as dragging a color picker. */
  liveBase: Project | null;
  hoverId: string | null;
  saveState: SaveState;
  clipboard: Node | null;
  toast: { msg: string; key: number } | null;
  /** Zoom applied to the canvas so a breakpoint wider than the stage still fits. */
  canvasScale: number;
  /** Element the canvas should scroll into view after its next render. */
  scrollTarget: string | null;
}

function loadProject(): Project {
  for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    try {
      const raw = localStorage.getItem(key);
      const p = raw && migrate(JSON.parse(raw));
      if (p) return p;
    } catch { /* ignore and fall through */ }
  }
  return starterProject();
}

const initial = loadProject();

export const useStore = create<Store>(() => ({
  project: initial,
  ui: {
    pageId: initial.pages[0].id, selectedId: null, bp: 'desktop', pstate: 'none',
    left: 'add', right: 'style', editingComponentId: null, cmsItemId: null,
    collapsedNav: [], collapsedSecs: ['Position', 'Effects', 'Flex child'],
  },
  past: [], future: [], liveBase: null, hoverId: null, saveState: 'saved', clipboard: null, toast: null, canvasScale: 1, scrollTarget: null,
}));

export const getState = useStore.getState;

/** Keeps UI references valid after the project changed (undo, deletes, page removal…). */
function fixUI(p: Project, ui: UIState): UIState {
  const out = { ...ui };
  if (!p.pages.some((pg) => pg.id === out.pageId)) out.pageId = p.pages[0].id;
  if (out.editingComponentId && !p.components[out.editingComponentId]) out.editingComponentId = null;
  if (out.selectedId && !findNode(currentRoot(p, out), out.selectedId)) out.selectedId = null;
  const page = currentPage(p, out);
  const coll = page.collectionId ? p.collections.find((c) => c.id === page.collectionId) : null;
  if (coll && !coll.items.some((i) => i.id === out.cmsItemId)) out.cmsItemId = coll.items[0]?.id || null;
  return out;
}

/** Where the open project is saved: browser storage (local mode) or a project on the server. */
export interface EditorTarget {
  kind: 'local' | 'remote';
  projectId?: string;
  version?: number;
  name?: string;
  orgId?: string;
  pathUrl?: string;
  subdomainUrl?: string | null;
  published?: boolean;
  hasAiKey?: boolean;
}
export const useTarget = create<EditorTarget>(() => ({ kind: 'local' }));

let persistTimer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> = Promise.resolve();
let dirty = false;

async function saveRemote() {
  const t = useTarget.getState();
  const { api, ApiError } = await import('./api');
  try {
    const { version } = await api<{ version: number }>(`/projects/${t.projectId}/data`, {
      method: 'PUT', body: { data: getState().project, version: t.version },
    });
    useTarget.setState({ version });
    if (!dirty) useStore.setState({ saveState: 'saved' });
  } catch (e) {
    const conflict = e instanceof ApiError && e.status === 409;
    useStore.setState({ saveState: conflict ? 'conflict' : 'error' });
    toast(conflict ? 'This site was changed somewhere else. Reload to get the latest version.' : (e as Error).message);
  }
}

export function persistNow(): Promise<void> {
  clearTimeout(persistTimer);
  if (useTarget.getState().kind === 'remote') {
    if (getState().saveState === 'conflict') return saving;
    dirty = false;
    saving = saving.then(saveRemote);
    return saving;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getState().project));
    useStore.setState({ saveState: 'saved' });
  } catch {
    useStore.setState({ saveState: 'error' });
  }
  return Promise.resolve();
}
function schedulePersist() {
  if (getState().saveState === 'conflict') return;
  dirty = true;
  useStore.setState({ saveState: 'saving' });
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, useTarget.getState().kind === 'remote' ? 900 : 400);
}
/** Waits for unsaved changes to reach the server (before publishing or leaving the designer). */
export async function flushSave() {
  if (dirty) await persistNow(); else await saving;
}

/** Opens a project in the designer with a fresh history. */
export function openInEditor(data: Project, target: EditorTarget) {
  clearTimeout(persistTimer);
  dirty = false;
  useTarget.setState({ projectId: undefined, version: undefined, ...target }, true);
  const { ui } = getState();
  useStore.setState({
    project: data, past: [], future: [], liveBase: null, saveState: 'saved', hoverId: null,
    ui: { ...ui, pageId: data.pages[0].id, selectedId: null, editingComponentId: null, cmsItemId: null, pstate: 'none' },
  });
}

/** Back to the project saved in this browser (local mode). */
export function openLocalProject() {
  const p = loadProject();
  openInEditor(p, { kind: 'local' });
}

/** Applies a recorded change. `fn` receives an immer draft of the project and a mutable copy of the UI state. */
export function mutate(fn: (p: Project, ui: UIState) => void) {
  const { project, ui, past, liveBase } = getState();
  const nextUI = { ...ui };
  const next = produce(project, (d) => { fn(d, nextUI); });
  if (next === project && !liveBase) { useStore.setState({ ui: fixUI(next, nextUI) }); return; }
  useStore.setState({
    project: next, ui: fixUI(next, nextUI), past: [...past.slice(-149), liveBase || project], future: [], liveBase: null,
  });
  schedulePersist();
}

/** Applies a change without recording history; the next `mutate` records it together with the change before it. */
export function live(fn: (p: Project) => void) {
  const { project, liveBase } = getState();
  useStore.setState({ project: produce(project, (d) => { fn(d); }), liveBase: liveBase || project });
}

export function undo() {
  const { project, past, future, ui, liveBase } = getState();
  if (!past.length) return;
  const prev = past[past.length - 1];
  useStore.setState({ project: prev, past: past.slice(0, -1), future: [...future, liveBase ? liveBase : project], liveBase: null, ui: fixUI(prev, ui) });
  schedulePersist();
}
export function redo() {
  const { project, past, future, ui } = getState();
  if (!future.length) return;
  const next = future[future.length - 1];
  useStore.setState({ project: next, future: future.slice(0, -1), past: [...past, project], ui: fixUI(next, ui) });
  schedulePersist();
}

export function setUI(patch: Partial<UIState> | ((ui: UIState) => Partial<UIState>)) {
  const { ui, project } = getState();
  const next = { ...ui, ...(typeof patch === 'function' ? patch(ui) : patch) };
  useStore.setState({ ui: fixUI(project, next) });
}

let toastKey = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string) {
  useStore.setState({ toast: { msg, key: ++toastKey } });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => useStore.setState({ toast: null }), 2400);
}

/* ---- Selectors ---- */
export const usePage = () => useStore((s) => currentPage(s.project, s.ui));
export const useRoot = () => useStore((s) => currentRoot(s.project, s.ui));
export const useSelected = () => useStore((s) => (s.ui.selectedId ? findNode(currentRoot(s.project, s.ui), s.ui.selectedId) : null));

/* ---- Modals ---- */
export type ModalName = 'export' | 'preview' | 'shortcuts' | 'cms' | 'site' | 'embed';
export const useModal = create<{ name: ModalName | null; arg: string | null }>(() => ({ name: null, arg: null }));
export const openModal = (name: ModalName, arg: string | null = null) => useModal.setState({ name, arg });
export const closeModal = () => useModal.setState({ name: null, arg: null });
