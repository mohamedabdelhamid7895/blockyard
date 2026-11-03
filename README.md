# Blockyard: a visual website builder

Build responsive websites by dragging and styling elements, then export clean HTML and CSS.
It has no dependencies and no build step. It is plain HTML, CSS and JavaScript.

## Run it

```bash
cd blockyard
python3 -m http.server 8000
```

Then open http://localhost:8000. Any static server works. Serve the folder over http rather than double-clicking `index.html`, because the canvas iframe needs a real origin.

## Features

- **Drag and drop:** drag elements from the Add panel onto the canvas or into the Navigator, or click a tile to insert it. Elements can be dragged to new places on the canvas or in the tree.
- **Elements:** Section, Container, Div, Flex Row, Grid, 3 Columns, Heading, Paragraph, Link, Button, Quote, List, Divider, Image (URL or upload), Video (YouTube/Vimeo), Custom Code, Form, Input, Text Area, Submit.
- **Class-based styling:** styles belong to a class. Elements that share a class share their styles. Type a new class name to split an element off, or use ✎ to rename a class everywhere.
- **Style panel:** layout (block/flex/grid), a visual margin/padding box, size, position, typography (Google Fonts), backgrounds, borders, effects and flex-child settings.
- **Responsive breakpoints:** Desktop, then Tablet (≤991px), then Mobile (≤479px). Styles cascade down. Orange labels show inherited values, and clicking a blue label resets that style.
- **Inline text editing:** double-click any text on the canvas.
- **Navigator tree, breadcrumbs, multiple pages** (with slug, SEO title and description), plus **Preview** with working links between pages.
- **Undo/redo**, copy/paste, duplicate, wrap in div, and autosave to localStorage.
- **Export:** view and copy the code, download one page as a single HTML file, or download the whole site as a `.zip` (`index.html`, other pages and `css/styles.css`).
- **Project files:** save and open the full project as `.json` from the Project menu.

## Shortcuts

| Keys | Action |
|---|---|
| Delete / Backspace | Delete the element |
| Ctrl/⌘ D | Duplicate |
| Ctrl/⌘ C / V | Copy / paste |
| Ctrl/⌘ Z, Ctrl/⌘ Shift Z | Undo / redo |
| Esc | Select the parent |
| Alt ↑ / ↓ | Move the element up or down |
| ↑ / ↓ in a size field | Nudge the value (Shift = ×10) |
| P | Preview |

## Code layout

- `index.html`: the editor shell
- `editor.css`: the editor UI styles
- `app.js`: the data model, canvas rendering, drag and drop, style panel, export and the starter template
