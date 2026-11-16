# draw

A virtual whiteboard for sketching hand-drawn style diagrams. Everything runs in your browser: no account, no server, no tracking. Your work is stored locally and can be exported at any time.

Built with [Next.js](https://nextjs.org), [React](https://react.dev), [roughjs](https://roughjs.com) for the sketchy look, [perfect-freehand](https://github.com/steveruizok/perfect-freehand) for the pen, [jsPDF](https://github.com/parallax/jsPDF) for PDF export and [UI SDK](https://github.com/vercel-labs/ui) for every interactive control: buttons, toolbar, menus and context menu, dialogs, popovers, selects, sliders, checkboxes, toggle groups, tooltips and toasts (see `src/components/ui.tsx`).

## Getting started

Requires Node.js 20.9 or newer.

```bash
git clone git@github.com:emreonursoy/draw.git
cd draw
npm install
npm run dev        # http://localhost:3000
```

Production build:

```bash
npm run build
npm run start
```

Press `?` inside the app to see every keyboard shortcut.

## Tests

```bash
npm test          # run once
npm run test:watch
```

Unit tests (Vitest + jsdom) live in `tests/` and cover the logic that must not regress: cleaning of untrusted data, the project store and its storage-full and migration paths, share-link limits, the compatible JSON format, Markdown import/export, the Mermaid parser, shape recognition, flood fill and embed URL safety. Canvas drawing and mouse interaction are not unit-tested.

## Features

### Drawing
- Tools: selection, hand, rectangle, diamond, ellipse, arrow, line, freehand, text, image, embedded web page, bucket fill, eraser, laser pointer, frame, comment and Markdown block
- **Draw to shape:** pause the pen for half a second at the end of a freehand stroke and it snaps to the closest clean rectangle, ellipse, diamond, triangle or straight line. It always picks the closest of the five, even for rough or open strokes (only dots and tiny strokes are left alone), and a selected stroke can be converted from the panel or context menu. Toggle it in the main menu
- **Bucket fill (`B`):** click a shape to fill it with the chosen colour, or click inside any area enclosed by lines or strokes to fill that area. Open areas are reported instead of leaking
- **Embedded web pages (`I`):** paste a link to show a live page on the canvas (YouTube, Vimeo and Loom links become players). Pages stay unloaded, drawn as a card, until you double-click them; they load in a sandboxed iframe and can be unloaded, opened in a new tab or edited at any time
- Hand-drawn rendering with three sloppiness levels, plus fill styles (hachure, cross-hatch, solid, zigzag), stroke width and style, rounded or sharp edges, opacity, colors and fonts
- Arrows with sharp, curved or elbow routing, multi-point lines, several arrowheads, and arrows that stay attached to shapes
- Text inside shapes, on arrows and as free text
- Resize, rotate, flip, group, lock, duplicate (Alt-drag), layer order, align and distribute
- Undo and redo, copy and paste (including styles and images), grid snapping
- Zoom, pan, zoom to fit, dark mode, zen mode and canvas background colors

### Projects
- Multiple projects stored in `localStorage` with autosave
- Dashboard with thumbnails, search, sorting, rename (with Save/Cancel), duplicate, export and delete (with an in-card confirmation)
- Optional autosave to a real file (`.draw`) in browsers that support the File System Access API

### Presenting and sharing
- **Frames and presentations:** draw frames, then present them as slides (`Alt+P`). Slides run in frame-name order
- **View-only mode** and **share links** that carry the drawing inside the URL fragment, so no server is involved. Large drawings make long links
- **Comments:** pinned threads on the canvas that you can resolve or delete. They are kept out of exports and slides

### Import and export
- PNG, SVG and PDF export (PDF can be one page per frame), copy as PNG, optional dark and transparent backgrounds
- `.draw` files for saving and reopening scenes
- Compatible `.json` import and export for exchanging drawings with other whiteboard tools
- Mermaid to diagram: flowcharts and sequence diagrams
- **Markdown blocks:** write Markdown directly on the canvas (`M` tool, or paste Markdown text). Blocks render headings, bold/italic/strike, inline code, links, task and nested lists, quotes, code fences and tables, re-wrap when resized, and reopen as raw Markdown on double-click
- **Markdown files:** import `.md` files (headings, paragraphs, lists, task lists, quotes, tables, code blocks, rules and ```mermaid blocks become canvas elements) and export the scene or selection as `.md`, with diagrams written back as Mermaid
- Personal library with search, rename and import/export
- Image import quality setting: original, high (max 4K) or compressed (max 1600px)

## Keyboard shortcuts (highlights)

| Action | Shortcut |
| --- | --- |
| Tools | `V` `R` `D` `O` `A` `L` `P` `T` `E` `H` `K` `F` `C` `M` `B` `I` or number keys `1`–`9` |
| Keep tool active | `Q` |
| Undo / redo | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` |
| Duplicate | `Ctrl/Cmd+D` |
| Group / ungroup | `Ctrl/Cmd+G` / `Ctrl/Cmd+Shift+G` |
| Present frames | `Alt+P` |
| Export dialog | `Ctrl/Cmd+Shift+E` |
| Save / open | `Ctrl/Cmd+S` / `Ctrl/Cmd+O` |
| Dark mode | `Shift+Alt+D` |
| Help | `?` |

## Project structure

```
src/
  app/            Next.js app router (layout, page, global styles)
  components/     Editor, toolbar, properties panel, menus, dialogs, presenter
    ui.tsx        App-styled wrappers around UI SDK parts (buttons, selects, sliders, toggles...)
  lib/
    element.ts    Element model, bounds, hit testing, arrow bindings
    render.ts     Canvas rendering and PNG/SVG export
    overlay.ts    Selection handles and overlays
    projects.ts   localStorage project store
    interchange.ts  Compatible JSON import/export
    mermaid.ts    Mermaid parser and layout
    markdown.ts   Markdown import (to elements) and export
    shape.ts      Shape recognition for freehand strokes
    fill.ts       Flood fill: area detection and contour tracing
    embed.ts      Safe URLs for embedded pages
    mdrender.ts   Markdown block layout and canvas rendering
    share.ts      Compressed share-link encoding
    image.ts      Image resize / recompress on import
```

All editor state lives in a small set of refs inside `components/Editor.tsx`; the canvas is redrawn on every change and element objects are treated as immutable so rendered shapes can be cached.

## Security

- No backend, accounts or network requests: drawings stay in `localStorage`, so there is nothing to rate-limit. If you deploy on Vercel you still get its platform DDoS protection
- `next.config.mjs` sends a restrictive Content-Security-Policy (everything must load from the app's own origin, no framing, no plugins; inline scripts are still allowed because Next.js and the UI SDK need them, so it is not an XSS defence) plus `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP and HSTS headers (HSTS without `preload`), and hides `X-Powered-By`
- Fonts are self-hosted (`@fontsource`), so no third-party requests are made
- Embedded pages accept only http(s) links (no `javascript:`, `data:` or credentials), load only after an explicit double-click and a "Load content from <host>?" confirmation (always asked for shared drawings; hosts you trust are remembered on this device for your own drawings), so a shared drawing can't make your browser contact other sites on its own. Links to the app's own origin and, in production, to localhost or private-network addresses are refused. At most 5 pages are loaded at once; they run in a sandboxed iframe with no referrer and without clipboard access, and the CSP `frame-src` only allows https (plus localhost in development)
- Share links and imported files are parsed as data only (never executed); image sources must be `data:` URLs, and rejected links show a message and are size-limited: 2 MB link, 16 MB decompressed, 20,000 elements, 25 MB files or images
- PostCSS is pinned to a patched version through `overrides`; `npm audit` reports 0 vulnerabilities

## Not included

Live collaboration, server sync and accounts are intentionally out of scope, since everything stays in the browser. PPTX export and AI features are also left out.

## Browser support

Current Chrome, Edge, Firefox and Safari. Autosave to a file needs a Chromium-based browser.
