# Blockyard: a visual website builder

Design responsive websites visually, in the style of Webflow, and publish them with your team. Blockyard has a React designer, an Express + PostgreSQL backend with accounts, workspaces and teams, hosting with custom domains, and Claude built in.

**Demo (designer only, no server):** https://mohamedabdelhamid7895.github.io/blockyard/

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:5173 and create an account. `npm run dev` starts the designer (Vite, port 5173) and the API server (port 8787). Locally the data lives in an embedded Postgres (PGlite) in `.data/`, so there is nothing else to install.

If no server is reachable, as on GitHub Pages, the designer runs in **local mode** and saves to the browser.

## Deploy (free to start)

The server is one Node process. It serves the designer, the API, the MCP endpoint for Claude, and every published site.

1. Create a free Postgres database at [Neon](https://neon.tech) and copy its connection string.
2. On [Render](https://render.com), create a **Blueprint** from this repo (it reads `render.yaml`) and set `DATABASE_URL` and `PUBLIC_URL` (your Render URL). `APP_SECRET` is generated for you.
3. Optional: point a wildcard domain (`*.sites.example.com`) at the service and set `SITES_DOMAIN=sites.example.com`, so every site gets `<site>.sites.example.com`.

Both free tiers scale up by changing plans. A `Dockerfile` is included for Fly.io, Railway or a VPS. All settings are listed in `.env.example`.

To make the GitHub Pages copy talk to your server, build it with `VITE_API_URL=https://your-server` and add the Pages origin to `CORS_ORIGINS`.

## Features

### Platform
- **Accounts:** sign up, sign in, profile and password.
- **Workspaces (orgs):** everyone gets a personal workspace and can create more for companies or clients. A workspace dashboard shows sites, published count, domains and members.
- **Members and roles:** invite by email link, with owner, admin and member roles. Owners and admins manage people, teams and Claude; members design and publish.
- **Teams:** group people and sites. Each team has its own dashboard. Members see sites in their teams plus sites with no team.
- **Sites dashboard:** search, filter by team, duplicate and delete.
- **Publishing:** one-click publish from the designer or the dashboard. Every deployment is kept, so you can roll back or unpublish.
- **Hosting and domains:** sites are served at `/sites/<site>/`, at `<site>.SITES_DOMAIN`, and on custom domains. Custom domains are verified with a DNS TXT record and pointed with a CNAME.
- **Saving:** designer changes autosave to the server. Version checks stop two people from silently overwriting each other.

### Forms, automations and A/B testing
- **Blockyard Forms:** forms with an empty Action send their submissions to Blockyard, with spam protection and rate limiting. You can view and delete them, export a CSV, and set success and error messages.
- **Automations (like Zapier, built in):** workflows run on these triggers: form submission, new CMS item, site published, incoming webhook, schedule, or manual. Steps are send email (your SMTP), Slack, Discord, HTTP request, add CMS item, publish site, ask AI, filter, format text and wait. Fields take variables such as `{{trigger.fields.email}}` and `{{steps.step_1.text}}`. There are templates, test runs with sample data, and a run history. Outbound requests can't reach private networks.
- **A/B testing:** in Page settings → A/B test, one click duplicates the page as variant B, optionally with AI-rewritten headings and buttons. Choose a goal (CTA clicks, form submissions, a page visit, or a CSS selector) and the traffic split, then start the test. The server assigns each visitor a side and keeps it, so there's no flicker and test pages are never cached. The dashboard shows visitors, conversions, uplift and statistical confidence, and you can pick a winner.

### Import from other platforms
- **From a URL:** copies up to 10 linked pages of a live site (Webflow, WordPress, Squarespace, Wix, Framer, Shopify or plain HTML).
- **From a ZIP:** imports a Webflow export or any static site. Images, fonts and videos are uploaded as cached assets.
- **How styles come over:** class rules become editable classes with hover states and breakpoints. Other CSS is kept in the site's head code so pages look the same, and the Designer shows it too.

### Performance and SEO
- **Publishing:** HTML and CSS are minified, only the fonts in use are loaded, the first image loads with high priority and the rest lazy-load, and iframes are lazy. Responses are gzip-compressed and cached, and uploaded assets are cached for a year.
- **Search and social:** sitemap.xml, robots.txt, canonical links, Open Graph and Twitter cards, and WebSite structured data are generated. Each page has social title, text and image fields, a noindex option, a sitemap exclusion and a search preview. Site settings cover language, favicon, site name and the default share image.

### Accessibility
- **Elements:** Skip Link, Main Landmark, Screen Reader Text, and an ARIA label, role, described-by, tab order, tooltip and screen-reader hiding on every element. Images can be marked decorative.
- **Interactive elements:** Navbar, Tabs, Accordion, Dropdown, Slider and Lightbox follow WAI-ARIA patterns, with keyboard support, focus handling and respect for reduced-motion settings.
- **Accessibility widget:** drag it onto a page to give visitors 12 adjustments (bigger text, contrast, dark mode, grayscale, highlighted links, a readable font, text spacing, stop animations, big cursor, reading guide, hide images, read aloud). Their choices are remembered, and Alt+A opens it.
- **Audit panel:** checks for missing alt text and labels, empty or vague links, heading order, colour contrast against WCAG AA, landmarks, SEO basics and performance. Clicking an issue selects the element.

### AI
- **Bring your own model:** Claude (recommended, via the Anthropic SDK) or OpenAI, Google Gemini, Mistral, Groq, OpenRouter, DeepSeek, xAI, Together, Ollama, or any OpenAI-compatible endpoint. Keys are encrypted per workspace.

### Claude and AI
- **Generate sections:** describe a section in the AI panel and Claude designs it. The result becomes normal elements and classes, with hover states and all breakpoints.
- **Rewrite with Claude:** improve, shorten, lengthen, translate or apply any instruction to a text element.
- **CMS items:** generate realistic items for any collection.
- **Code:** ask Claude to write or change code in the Code Embed and custom code editors.
- **Connect Claude Desktop / Claude Code (MCP):** create an access token in Account → Connect Claude. Claude can then list your sites, read pages, add sections, replace text, add CMS items, set custom code and publish. Endpoint: `<server>/mcp`.

### Designer
- **Webflow-style editor:** a dark three-panel designer with Add, Navigator, Components, Pages, CMS, Templates and Claude panels, plus Style, Settings and Interactions tabs.
- **Classes and combo classes, and states:** None, Hover, Pressed and Focused.
- **Four breakpoints:** Desktop (base), Tablet ≤991px, Mobile landscape ≤767px and Mobile portrait ≤479px. Styles cascade down.
- **Components:** reusable elements. Edit once and every instance updates.
- **Interactions:** load, scroll, hover and click animations.
- **CMS:** collections, Collection Lists, field bindings and template pages.
- **Custom code like Webflow:** a code editor with line numbers, Tab indenting, ⌘S to save and a 50,000-character limit, used for Code Embeds, **site custom code** (head and before `</body>`, in Site settings or the dashboard) and **page custom code** (in page settings). Code runs in Preview and on the published site.
- **Import:** paste HTML and CSS to turn it into editable elements.
- **Templates gallery:** prebuilt sections and page layouts.
- **Other tools:** Preview, export to ZIP, undo/redo, keyboard shortcuts.

## Code layout

- `src/`: the React app
  - `main.tsx` (routes), `api.ts` (API client and session)
  - `dashboard/`: sign in, workspace, team, member, site and account pages
  - `App.tsx`, `canvas/`, `panels/`: the designer
  - `model.ts`, `codegen.ts`, `templates.ts`, `importer.ts`, `interactions.ts`: data model, HTML/CSS generation and import (shared with the server)
- `server/`: Express API
  - `routes/`: auth, workspaces and teams, sites (data, deployments and domains)
  - `ai.ts`: Claude features
  - `mcp.ts`: MCP server for Claude
  - `sites.ts`: published site hosting
  - `db.ts`: Postgres or PGlite

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Designer and API with hot reload |
| `npm run build` | Typecheck, build the designer (`dist/`) and bundle the server (`dist-server/`) |
| `npm start` | Run the production server |
| `npm run typecheck` | Typecheck both the app and the server |
