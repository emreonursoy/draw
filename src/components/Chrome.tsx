'use client';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Menu, MenuContent, MenuGroupLabel, MenuItem, MenuItemIndicator, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@ui-sdk/react/menu';
import type { AppState, DrawElement } from '@/lib/types';
import { exportCanvas } from '@/lib/render';
import { Icons } from './icons';

const BG_COLORS = ['#ffffff', '#f8f9fa', '#f5faff', '#fffce8', '#fdf8f6'];

export function MainMenu({ app, actions }: { app: AppState; actions: any }) {
  const handlers: Record<string, () => void> = {
    projects: () => actions.setApp({ projectsOpen: true }),
    import: actions.openFile,
    save: actions.saveFile,
    json: actions.exportJsonFile,
    export: () => actions.setApp({ exportOpen: true }),
    copypng: actions.copyPNG,
    reset: actions.clearCanvas,
    help: () => actions.setApp({ helpOpen: true }),
    theme: () => actions.setApp({ theme: app.theme === 'dark' ? 'light' : 'dark' }),
    grid: () => actions.setApp({ grid: !app.grid }),
    zen: () => actions.setApp({ zen: true }),
    present: () => actions.setApp({ presenting: true }),
    mermaid: () => actions.setApp({ mermaidOpen: true }),
    view: () => actions.setApp({ viewOnly: true, tool: 'hand', selectedIds: {} }),
    share: actions.copyShareLink,
    linkopen: actions.linkOpenFile,
    linksave: actions.linkSaveFile,
    unlink: actions.unlinkFile,
  };
  const it = (value: string, icon: ReactNode, label: string, shortcut?: string) => (
    <MenuItem value={value} shortcut={shortcut} className="menu-item">
      <span className="mi-icon">{icon}</span><span className="mi-label">{label}</span>
    </MenuItem>
  );
  const canLink = typeof window !== 'undefined' && 'showSaveFilePicker' in window;
  return (
    <div className="main-menu">
      <Menu onAction={(v: string) => handlers[v]?.()}>
        <MenuTrigger className="icon-btn" aria-label="Main menu">{Icons.menu}</MenuTrigger>
        <MenuContent className="menu" sideOffset={8} align="start">
          {it('projects', Icons.library, 'Projects…')}
          {it('import', Icons.open, 'Import file…', 'mod+o')}
          {it('save', Icons.save, 'Save to file (.draw)', 'mod+s')}
          {it('json', Icons.save, 'Export as compatible .json')}
          {it('export', Icons.export, 'Export image / PDF…', 'mod+shift+e')}
          {it('copypng', Icons.copy, 'Copy to clipboard as PNG', 'alt+shift+c')}
          {it('reset', Icons.clear, 'Reset the canvas')}
          <MenuSeparator className="menu-sep" />
          {it('present', Icons.frameTool, 'Present frames', 'alt+p')}
          {it('mermaid', Icons.comment, 'Mermaid to diagram…')}
          {it('view', Icons.unlock, 'View-only mode')}
          {it('share', Icons.export, 'Copy view-only share link')}
          {canLink && (app.fileLink ? it('unlink', Icons.save, `Stop autosaving to “${app.fileLink}”`) : <>
            {it('linksave', Icons.save, 'Autosave to a file…')}
            {it('linkopen', Icons.open, 'Open & autosave file…')}
          </>)}
          <MenuSeparator className="menu-sep" />
          {it('help', Icons.help, 'Help')}
          {it('theme', app.theme === 'dark' ? Icons.sun : Icons.moon, app.theme === 'dark' ? 'Light mode' : 'Dark mode', 'alt+shift+d')}
          {it('grid', Icons.grid, app.grid ? 'Hide grid' : 'Show grid', 'mod+\'')}
          {it('zen', Icons.zen, 'Zen mode', 'alt+z')}
          <MenuSeparator className="menu-sep" />
          <MenuRadioGroup value={app.viewBg} onValueChange={(v: string) => actions.setApp({ viewBg: v })}>
            <MenuGroupLabel className="menu-label">Canvas background</MenuGroupLabel>
            <div className="menu-swatches">
              {BG_COLORS.map((c) => (
                <MenuRadioItem key={c} value={c} className="bg-chip" aria-label={`Background ${c}`} style={{ background: c }}>
                  <MenuItemIndicator>✓</MenuItemIndicator>
                </MenuRadioItem>
              ))}
            </div>
          </MenuRadioGroup>
          <MenuSeparator className="menu-sep" />
          <MenuRadioGroup value={app.imageMode} onValueChange={(v: string) => actions.setApp({ imageMode: v })}>
            <MenuGroupLabel className="menu-label">Image import quality</MenuGroupLabel>
            {([['original', 'Original'], ['high', 'High (max 4K)'], ['compressed', 'Compressed (max 1600px)']] as const).map(([v, l]) => (
              <MenuRadioItem key={v} value={v} className="menu-item"><MenuItemIndicator>✓</MenuItemIndicator><span className="mi-label">{l}</span></MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
      <button className="project-pill" title="Projects" onClick={() => actions.setApp({ projectsOpen: true })}>{app.projectName}</button>
    </div>
  );
}

export function BottomLeft({ app, actions }: { app: AppState; actions: any }) {
  return (
    <div className="bottom-left" onPointerDown={(e) => e.stopPropagation()}>
      <div className="group-box">
        <button className="icon-btn sm" title="Zoom out (-)" onClick={() => actions.zoomAt(app.zoom / 1.2)}>{Icons.minus}</button>
        <button className="zoom-pct" title="Reset zoom (Shift+0)" onClick={actions.resetZoom}>{Math.round(app.zoom * 100)}%</button>
        <button className="icon-btn sm" title="Zoom in (+)" onClick={() => actions.zoomAt(app.zoom * 1.2)}>{Icons.plus}</button>
      </div>
      <div className="group-box">
        <button className="icon-btn sm" title="Undo (Ctrl+Z)" disabled={!actions.canUndo} onClick={actions.undo}>{Icons.undo}</button>
        <button className="icon-btn sm" title="Redo (Ctrl+Shift+Z)" disabled={!actions.canRedo} onClick={actions.redo}>{Icons.redo}</button>
      </div>
      <button className="icon-btn sm boxed" title="Fit all (Shift+1)" onClick={actions.zoomToElements}>{Icons.frame}</button>
      <button className="icon-btn sm boxed help" title="Help (?)" onClick={() => actions.setApp({ helpOpen: true })}>?</button>
    </div>
  );
}

function Thumb({ items }: { items: DrawElement[] }) {
  const url = useMemo(() => {
    try { return exportCanvas(items, { padding: 6, scale: 0.5, background: null, dark: false })?.toDataURL() ?? ''; } catch { return ''; }
  }, [items]);
  return url ? <img src={url} alt="" draggable={false} /> : null;
}

export interface LibItem { id: string; name: string; elements: DrawElement[] }

export function LibraryPanel({ items, actions, onClose }: { items: LibItem[]; actions: any; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const shown = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="library" onPointerDown={(e) => e.stopPropagation()}>
      <div className="library-head"><b>Library</b><button className="icon-btn sm" aria-label="Close library" onClick={onClose}>✕</button></div>
      <input className="lib-search" placeholder="Search library…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <div className="lib-tools">
        <button className="btn" onClick={() => fileRef.current?.click()}>Import</button>
        <button className="btn" disabled={!items.length} onClick={actions.exportLibrary}>Export</button>
        <input ref={fileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) actions.importLibrary(f); e.target.value = ''; }} />
      </div>
      {items.length === 0 && <p className="muted">No items yet. Select elements on the canvas and use “Add to library”.</p>}
      {items.length > 0 && shown.length === 0 && <p className="muted">No matches.</p>}
      <div className="library-grid">
        {shown.map((it) => (
          <div key={it.id} className="library-card">
            <div className="library-item" title="Click to insert" onClick={() => actions.insertLibrary(it)}>
              <Thumb items={it.elements} />
              <button className="del" aria-label={`Remove ${it.name}`} onClick={(e) => { e.stopPropagation(); actions.deleteLibrary(it.id); }}>✕</button>
            </div>
            {editId === it.id ? (
              <input
                className="lib-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { actions.renameLibrary(it.id, name); setEditId(null); }}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
              />
            ) : (
              <button className="lib-label" title="Rename" onClick={() => { setEditId(it.id); setName(it.name); }}>{it.name}</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ContextMenu({ app, selected, actions }: { app: AppState; selected: DrawElement[]; actions: any }) {
  const c = app.contextMenu!;
  const run = (fn: () => void) => () => { actions.setApp({ contextMenu: null }); fn(); };
  const it = (label: string, fn: () => void, kbd?: string) => (
    <button className="menu-item" onClick={run(fn)}><span className="mi-label">{label}</span>{kbd && <span className="mi-kbd">{kbd}</span>}</button>
  );
  const x = Math.min(c.x, app.width - 240), y = Math.min(c.y, app.height - 380);
  return (
    <div className="menu context" style={{ left: x, top: y }} onPointerDown={(e) => e.stopPropagation()}>
      {selected.length ? (
        <>
          {it('Cut', actions.cut, 'Ctrl+X')}
          {it('Copy', actions.copy, 'Ctrl+C')}
          {it('Paste', actions.paste, 'Ctrl+V')}
          {it('Copy styles', actions.copyStyle, 'Ctrl+Alt+C')}
          {it('Paste styles', actions.pasteStyle, 'Ctrl+Alt+V')}
          <hr />
          {it('Duplicate', actions.duplicate, 'Ctrl+D')}
          {selected.length > 1 && it('Group selection', actions.group, 'Ctrl+G')}
          {selected.some((e) => e.groupIds.length > 0) && it('Ungroup selection', actions.ungroup, 'Ctrl+Shift+G')}
          {it(selected.every((e) => e.locked) ? 'Unlock' : 'Lock', actions.toggleLock, 'Ctrl+Shift+L')}
          {it('Add to library', actions.addToLibrary)}
          <hr />
          {it('Send to back', () => actions.layer('back'), 'Ctrl+Shift+[')}
          {it('Send backward', () => actions.layer('backward'), 'Ctrl+[')}
          {it('Bring forward', () => actions.layer('forward'), 'Ctrl+]')}
          {it('Bring to front', () => actions.layer('front'), 'Ctrl+Shift+]')}
          <hr />
          {it('Delete', actions.deleteSelected, 'Del')}
        </>
      ) : (
        <>
          {it('Paste', actions.paste, 'Ctrl+V')}
          {it('Select all', actions.selectAll, 'Ctrl+A')}
          {it(app.grid ? 'Hide grid' : 'Show grid', () => actions.setApp({ grid: !app.grid }), "Ctrl+'")}
          {it('Zen mode', () => actions.setApp({ zen: true }), 'Alt+Z')}
        </>
      )}
    </div>
  );
}
