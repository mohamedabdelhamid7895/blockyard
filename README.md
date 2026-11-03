# Blockyard: a visual website builder

Design responsive websites visually, in the style of Webflow, then export clean HTML and CSS.
Built with React, TypeScript and Vite.

**Live:** https://mohamedabdelhamid7895.github.io/blockyard/

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm run build` writes a static build to `dist/`.

Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`.

## Features

- **Designer:** a dark three-panel editor. The left rail holds Add, Navigator, Components, Pages, CMS and Templates. The right panel has Style, Settings and Interactions tabs. Breadcrumbs sit under the canvas.
- **Drag and drop:** drag elements from the Add panel onto the canvas or into the Navigator, or click a tile to insert it. You can move elements on the canvas or in the tree.
- **Elements:** Section, Container, Div, Flex Row, Grid, 3 Columns, Heading, Paragraph, Text Block, Link, Button, Block Quote, List, Divider, Image, Video, Code Embed, Form, Input, Text Area, Submit and Collection List.
- **Classes and combo classes:** styles belong to a selector. Add a class, then add more to make a combo class (`.button.is-large`) that overrides the base class. A warning appears when other elements share the selector, and **Duplicate class** splits this element off.
- **States:** style the None, Hover, Pressed and Focused states. While you style a state, the canvas shows the selected element in that state.
- **Breakpoints:** Desktop (base), Tablet (≤991px), Mobile landscape (≤767px) and Mobile portrait (≤479px). Styles cascade down. Orange labels are inherited, and clicking a blue label resets that style. On a narrow screen, the canvas scales down so Desktop still shows desktop styles.
- **Components:** turn any element into a reusable component. Double-click an instance to edit the component; every instance updates. You can detach an instance to make it plain elements again.
- **Interactions:** page load, scroll into view, hover and click triggers, with slide, fade, zoom, flip, bounce, pulse, shake, wobble and spin animations. You can preview them on the canvas. They are exported as CSS keyframes plus a small script, and they respect `prefers-reduced-motion`.
- **CMS:** create collections with typed fields (plain text, rich text, image, link, number, date, color) and manage their items. Collection Lists repeat a template for each item. Bind element text, images, links and backgrounds to fields. Collection template pages export one HTML file per item.
- **Templates gallery:** prebuilt sections (navbar, heroes, logos, features, stats, testimonials, pricing, FAQ, blog grid, CTA, contact, footer) and page layouts (landing, pricing, about).
- **Pages:** multiple pages, each with a slug, SEO title and description. **Preview** has working links between pages and CMS items.
- **Editing:** inline text editing (double-click), undo/redo, copy/paste, duplicate, wrap in div, and autosave to localStorage.
- **Export:** view and copy the code for every file, download one page as a single file, or download the whole site as a `.zip`.
- **Project files:** save and open a project as `.json`. Projects from the original single-file version load automatically.

## Shortcuts

| Keys | Action |
|---|---|
| Delete / Backspace | Delete the element |
| Ctrl/⌘ D | Duplicate |
| Ctrl/⌘ C / V | Copy / paste |
| Ctrl/⌘ Z, Ctrl/⌘ Shift Z | Undo / redo |
| Esc | Select the parent, or leave a component |
| Alt ↑ / ↓ | Move the element up or down |
| ↑ / ↓ in a size field | Nudge the value (Shift = ×10) |
| P | Preview |

## Code layout

- `src/types.ts`: the project data model
- `src/model.ts`: tree helpers, the style cascade and project migration
- `src/store.ts`: the zustand store with undo/redo history
- `src/actions.ts`: every editor action (insert, move, style, classes, pages, components, CMS, interactions)
- `src/codegen.ts`: HTML and CSS generation, shared by the canvas, Preview and Export
- `src/canvas/Canvas.tsx`: the iframe canvas, overlays, drag and drop and inline editing
- `src/panels/`: the left panels and the Style, Settings and Interactions panels
- `src/interactions.ts`, `src/templates.ts`: animation presets and runtime, the templates gallery and the starter site
