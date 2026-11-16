'use client';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Menu, MenuContent, MenuGroupLabel, MenuItem, MenuItemIndicator, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@ui-sdk/react/menu';
import type { AppState, DrawElement } from '@/lib/types';
import { exportCanvas } from '@/lib/render';
import { Button, createFileInputController, FilePick, IconButton, Input } from './ui';
import { Icons } from './icons';

const BG_COLORS = ['#ffffff', '#f8f9fa', '#f5faff', '#fffce8', '#fdf8f6'];

export function MainMenu({ app, actions }: { app: AppState; actions: any }) {
  const handlers: Record<string, () => void> = {
    projects: () => actions.setApp({ projectsOpen: true }),
    import: actions.openFile,
    save: actions.saveFile,
    json: actions.exportJsonFile,
    markdown: actions.exportMarkdownFile,
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
          {it('markdown', Icons.save, 'Export as Markdown (.md)')}
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
      <Button className="project-pill" onClick={() => actions.setApp({ projectsOpen: true })}>{app.projectName}</Button>
    </div>
  );
}

export function BottomLeft({ app, actions }: { app: AppState; actions: any }) {
  return (
    <div className="bottom-left" onPointerDown={(e) => e.stopPropagation()}>
      <div className="group-box">
        <IconButton className="icon-btn sm" label="Zoom out" kbd="-" onClick={() => actions.zoomAt(app.zoom / 1.2)}>{Icons.minus}</IconButton>
        <IconButton className="zoom-pct" label="Reset zoom" kbd="Shift+0" onClick={actions.resetZoom}>{Math.round(app.zoom * 100)}%</IconButton>
        <IconButton className="icon-btn sm" label="Zoom in" kbd="+" onClick={() => actions.zoomAt(app.zoom * 1.2)}>{Icons.plus}</IconButton>
      </div>
      <div className="group-box">
        <IconButton className="icon-btn sm" label="Undo" kbd="Ctrl+Z" disabled={!actions.canUndo} onClick={actions.undo}>{Icons.undo}</IconButton>
        <IconButton className="icon-btn sm" label="Redo" kbd="Ctrl+Shift+Z" disabled={!actions.canRedo} onClick={actions.redo}>{Icons.redo}</IconButton>
      </div>
      <IconButton className="icon-btn sm boxed" label="Fit all" kbd="Shift+1" onClick={actions.zoomToElements}>{Icons.frame}</IconButton>
      <IconButton className="icon-btn sm boxed help" label="Help" kbd="?" onClick={() => actions.setApp({ helpOpen: true })}>?</IconButton>
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
  const pick = useRef(createFileInputController()).current;
  const shown = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="library" onPointerDown={(e) => e.stopPropagation()}>
      <div className="library-head"><b>Library</b><Button className="icon-btn sm" aria-label="Close library" onClick={onClose}>✕</Button></div>
      <Input className="field lib-search" aria-label="Search library" placeholder="Search library…" value={q} onValueChange={setQ} onKeyDown={(e) => e.stopPropagation()} />
      <div className="lib-tools">
        <Button className="btn" onClick={() => pick.open()}>Import</Button>
        <Button className="btn" disabled={!items.length} onClick={actions.exportLibrary}>Export</Button>
        <FilePick controller={pick} accept=".json,application/json" onFile={(f) => actions.importLibrary(f)} />
      </div>
      {items.length === 0 && <p className="muted">No items yet. Select elements on the canvas and use “Add to library”.</p>}
      {items.length > 0 && shown.length === 0 && <p className="muted">No matches.</p>}
      <div className="library-grid">
        {shown.map((it) => (
          <div key={it.id} className="library-card">
            <div className="library-item" title="Click to insert" onClick={() => actions.insertLibrary(it)}>
              <Thumb items={it.elements} />
              <Button className="del" aria-label={`Remove ${it.name}`} onClick={(e) => { e.stopPropagation(); actions.deleteLibrary(it.id); }}>✕</Button>
            </div>
            {editId === it.id ? (
              <Input
                className="lib-name" aria-label="Item name" autoFocus value={name} onValueChange={setName} onBlur={() => { actions.renameLibrary(it.id, name); setEditId(null); }}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
              />
            ) : (
              <Button className="lib-label" title="Rename" onClick={() => { setEditId(it.id); setName(it.name); }}>{it.name}</Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ContextMenu({ controller, selected, actions, app }: { controller: any; selected: DrawElement[]; actions: any; app: AppState }) {
  const h: Record<string, () => void> = {
    cut: actions.cut, copy: actions.copy, paste: actions.paste, copystyle: actions.copyStyle, pastestyle: actions.pasteStyle,
    duplicate: actions.duplicate, group: actions.group, ungroup: actions.ungroup, lock: actions.toggleLock, library: actions.addToLibrary,
    back: () => actions.layer('back'), backward: () => actions.layer('backward'), forward: () => actions.layer('forward'), front: () => actions.layer('front'),
    delete: actions.deleteSelected, selectall: actions.selectAll, grid: () => actions.setApp({ grid: !app.grid }), zen: () => actions.setApp({ zen: true }),
  };
  const it = (value: string, label: string, shortcut?: string, danger = false) => (
    <MenuItem value={value} shortcut={shortcut} className={`menu-item ${danger ? 'danger' : ''}`}><span className="mi-label">{label}</span></MenuItem>
  );
  const sep = <MenuSeparator className="menu-sep" />;
  return (
    <Menu controller={controller} onAction={(v: string) => h[v]?.()}>
      <MenuContent className="menu context" aria-label="Canvas actions">
        {selected.length ? (
          <>
            {it('cut', 'Cut', 'mod+x')}
            {it('copy', 'Copy', 'mod+c')}
            {it('paste', 'Paste', 'mod+v')}
            {it('copystyle', 'Copy styles', 'mod+alt+c')}
            {it('pastestyle', 'Paste styles', 'mod+alt+v')}
            {sep}
            {it('duplicate', 'Duplicate', 'mod+d')}
            {selected.length > 1 && it('group', 'Group selection', 'mod+g')}
            {selected.some((e) => e.groupIds.length > 0) && it('ungroup', 'Ungroup selection', 'mod+shift+g')}
            {it('lock', selected.every((e) => e.locked) ? 'Unlock' : 'Lock', 'mod+shift+l')}
            {it('library', 'Add to library')}
            {sep}
            {it('back', 'Send to back', 'mod+shift+[')}
            {it('backward', 'Send backward', 'mod+[')}
            {it('forward', 'Bring forward', 'mod+]')}
            {it('front', 'Bring to front', 'mod+shift+]')}
            {sep}
            {it('delete', 'Delete', 'Delete', true)}
          </>
        ) : (
          <>
            {it('paste', 'Paste', 'mod+v')}
            {it('selectall', 'Select all', 'mod+a')}
            {it('grid', app.grid ? 'Hide grid' : 'Show grid', "mod+'")}
            {it('zen', 'Zen mode', 'alt+z')}
          </>
        )}
      </MenuContent>
    </Menu>
  );
}
