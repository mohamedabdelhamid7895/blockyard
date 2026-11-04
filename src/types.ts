export type BP = 'desktop' | 'tablet' | 'landscape' | 'mobile';
export type PseudoState = 'none' | 'hover' | 'pressed' | 'focused';

/** CSS property → value. */
export type StyleMap = Record<string, string>;
/** Variant key (`desktop`, `tablet:hover`, …) → styles. */
export type ClassStyles = Record<string, StyleMap>;

export type IxTrigger = 'load' | 'scroll' | 'hover' | 'click';
export interface Interaction {
  id: string;
  trigger: IxTrigger;
  anim: string;
  duration: number;
  delay: number;
  easing: string;
  /** Scroll trigger only: play the first time the element appears, not every time. */
  once: boolean;
}

/** CMS field bindings: element property → field slug (`__url` = the item's template page). */
export interface Binding {
  text?: string;
  src?: string;
  href?: string;
  bg?: string;
}

export interface Node {
  id: string;
  type: string;
  tag: string;
  /** Base class first, then combo classes. The styled selector is `.a.b.c`. */
  classes: string[];
  text?: string;
  html?: string;
  attrs?: Record<string, string>;
  children?: Node[];
  /** `symbol` nodes: the component this is an instance of. */
  componentId?: string;
  /** `collectionlist` nodes. */
  collectionId?: string;
  limit?: number;
  bind?: Binding;
  ix?: Interaction[];
  /** `select` nodes: one option per entry. */
  options?: string[];
}

/** Custom code injected into the exported HTML, as in Webflow's site and page settings. */
export interface CustomCode {
  /** Inside <head>, after the stylesheet. */
  head: string;
  /** Before </body>. */
  body: string;
}

export interface Page {
  id: string;
  name: string;
  slug: string;
  title: string;
  description: string;
  root: Node;
  /** Set on collection template pages: one HTML file is exported per item. */
  collectionId?: string;
  customCode?: CustomCode;
  seo?: PageSeo;
  /** Set on the control page while it has an A/B test. */
  abTest?: AbTest;
  /** Set on a variant page: the id of the page it is a variant of. Variants are never linked or listed. */
  variantOf?: string;
}

export interface PageSeo {
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  /** Keep this page out of search engines. */
  noindex?: boolean;
  excludeFromSitemap?: boolean;
}

export type AbGoal = { type: 'cta' } | { type: 'form' } | { type: 'page'; page: string } | { type: 'click'; selector: string };
export interface AbTest {
  id: string;
  variantPageId: string;
  /** Percentage of visitors who see variant B. */
  split: number;
  goal: AbGoal;
  status: 'draft' | 'running' | 'paused';
  startedAt?: string;
}

export interface SiteSettings {
  customCode?: CustomCode;
  siteName?: string;
  /** <html lang>, e.g. "en". */
  lang?: string;
  favicon?: string;
  /** Default social share image. */
  ogImage?: string;
  /** Minify HTML and CSS when publishing (on unless set to false). */
  minify?: boolean;
}

export interface Component {
  id: string;
  name: string;
  root: Node;
}

export type FieldType = 'plaintext' | 'richtext' | 'image' | 'link' | 'number' | 'date' | 'color';
export interface Field {
  id: string;
  name: string;
  slug: string;
  type: FieldType;
}
export interface Item {
  id: string;
  /** Keyed by field slug. Always has `name` and `slug`. */
  data: Record<string, string>;
}
export interface Collection {
  id: string;
  name: string;
  slug: string;
  fields: Field[];
  items: Item[];
}

export interface Project {
  version: 2;
  pages: Page[];
  /** Selector key (`button` or `button.is-large`) → styles per variant. */
  classes: Record<string, ClassStyles>;
  components: Record<string, Component>;
  collections: Collection[];
  settings?: SiteSettings;
}

export type LeftPanel = 'add' | 'navigator' | 'components' | 'pages' | 'cms' | 'templates' | 'ai' | 'audit';
export type RightTab = 'style' | 'settings' | 'interactions';

export interface UIState {
  pageId: string;
  selectedId: string | null;
  bp: BP;
  pstate: PseudoState;
  left: LeftPanel | null;
  right: RightTab;
  /** When set, the canvas shows and edits this component instead of the page. */
  editingComponentId: string | null;
  /** The CMS item shown on a collection template page. */
  cmsItemId: string | null;
  collapsedNav: string[];
  collapsedSecs: string[];
}
