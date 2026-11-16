# draw

A virtual whiteboard for sketching hand-drawn style diagrams. Everything runs in your browser: no account, no server, no tracking. Your work is stored locally and can be exported at any time.

Built with [Next.js](https://nextjs.org), [React](https://react.dev), [roughjs](https://roughjs.com) for the sketchy look, [perfect-freehand](https://github.com/steveruizok/perfect-freehand) for the pen, [jsPDF](https://github.com/parallax/jsPDF) for PDF export and [UI SDK](https://github.com/vercel-labs/ui) for accessible menus, dialogs, toolbar and tooltips.

## Getting started

Requires Node.js 18.18 or newer.

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

## Features

### Drawing
- Tools: selection, hand, rectangle, diamond, ellipse, arrow, line, freehand, text, image, eraser, laser pointer, frame and comment
- Hand-drawn rendering with three sloppiness levels, plus fill styles (hachure, cross-hatch, solid, zigzag), stroke width and style, rounded or sharp edges, opacity, colors and fonts
- Arrows with sharp, curved or elbow routing, multi-point lines, several arrowheads, and arrows that stay attached to shapes
- Text inside shapes, on arrows and as free text
- Resize, rotate, flip, group, lock, duplicate (Alt-drag), layer order, align and distribute
- Undo and redo, copy and paste (including styles and images), grid snapping
- Zoom, pan, zoom to fit, dark mode, zen mode and canvas background colors

### Projects
- Multiple projects stored in `localStorage` with autosave
- Dashboard with thumbnails, search, sorting, rename, duplicate, export and delete
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
| Tools | `V` `R` `D` `O` `A` `L` `P` `T` `E` `H` `K` `F` `C` `M` or number keys `1`–`9` |
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
  lib/
    element.ts    Element model, bounds, hit testing, arrow bindings
    render.ts     Canvas rendering and PNG/SVG export
    overlay.ts    Selection handles and overlays
    projects.ts   localStorage project store
    interchange.ts  Compatible JSON import/export
    mermaid.ts    Mermaid parser and layout
    markdown.ts   Markdown import (to elements) and export
    mdrender.ts   Markdown block layout and canvas rendering
    share.ts      Compressed share-link encoding
```

All editor state lives in a small set of refs inside `components/Editor.tsx`; the canvas is redrawn on every change and element objects are treated as immutable so rendered shapes can be cached.

## Not included

Live collaboration, server sync and accounts are intentionally out of scope, since everything stays in the browser. PPTX export and AI features are also left out.

## Browser support

Current Chrome, Edge, Firefox and Safari. Autosave to a file needs a Chromium-based browser.
