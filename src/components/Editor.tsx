'use client';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { AppState, DrawElement, Pt, SidebarTab, Style, ToolType } from '@/lib/types';
import { DEFAULT_STYLE } from '@/lib/types';
import {
  absPoints, canHaveLabel, commonBounds, elAABB, elBounds, elCenter, findBindTarget, fitText,
  frameChildren, groupSelect, hitElement, isLinear, isPoints, measureText, newElement, normalizeImported,
  updateBoundArrows, withAbsPoints,
} from '@/lib/element';
import { renderScene, DARK_FILTER, exportCanvas } from '@/lib/render';
import { getSelBox, hitHandle, renderOverlay, type SelBox } from '@/lib/overlay';
import { clamp, dist, download, rotatePt, toast, uid, warnStorage } from '@/lib/utils';
import { createProject, deleteProject, emptyData, ensureCurrent, getProject, listProjects, migrateLegacy, saveProject, setCurrentId, type ProjectData } from '@/lib/projects';
import { exportInterchange, importInterchange, isInterchangeData } from '@/lib/interchange';
import { ProjectsDialog } from './Projects';
import { parseMarkdown, toMarkdown } from '@/lib/markdown';
import { clearMarkdownCache, fitMarkdown } from '@/lib/mdrender';
import { processImage } from '@/lib/image';
import { recognizeShape } from '@/lib/shape';
import { regionAt } from '@/lib/fill';
import EmbedLayer from './EmbedLayer';
import { EmbedDialog } from './EmbedDialog';
import { EmbedConfirm } from './EmbedConfirm';
import { decideLoad, embedTarget, hostOf, MAX_LOADED_EMBEDS, trustHost } from '@/lib/embed';
import { decodeScene, encodeScene, MAX_LINK_CHARS } from '@/lib/share';
import { MermaidDialog } from './MermaidDialog';
import Presenter from './Presenter';
import CommentPopover from './CommentPopover';
import Toolbar from './Toolbar';
import { Button, createFileInputController, FilePick } from './ui';
import { createMenuController } from '@ui-sdk/react/menu';
import { Toast, ToastRegion, ToastTitle } from '@ui-sdk/react/toast';
import { Modal } from './Modal';
import PropertiesPanel from './PropertiesPanel';
import TextEditor from './TextEditor';
import { ExportDialog, HelpDialog } from './Dialogs';
import { MainMenu, BottomLeft, ContextMenu, type LibItem } from './Chrome';
import { Sidebar } from './Sidebar';
import { searchElements, type SearchHit } from '@/lib/search';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; scrollX: number; scrollY: number }
  | { kind: 'move'; start: Pt; snap: DrawElement[]; dup: boolean; started: boolean; hit: DrawElement | null; shift: boolean }
  | { kind: 'resize'; handle: string; snap: DrawElement[]; box: SelBox }
  | { kind: 'rotate'; snap: DrawElement[]; center: Pt; startAngle: number }
  | { kind: 'point'; id: string; idx: number }
  | { kind: 'create'; id: string; start: Pt; sx: number; sy: number }
  | { kind: 'box'; start: Pt; base: Record<string, true> }
  | { kind: 'erase'; last: Pt }
  | { kind: 'laser' }
  | { kind: 'textClick'; p: Pt };

const GRID = 20;
const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
const THEME_KEY = 'draw:theme';
const LIBKEY = 'draw:library:v1';
const TOOL_KEYS: Record<string, ToolType> = {
  '1': 'selection', v: 'selection', f: 'frame', c: 'comment', m: 'markdown', b: 'bucket', i: 'embed', '2': 'rectangle', r: 'rectangle', '3': 'diamond', d: 'diamond', '4': 'ellipse', o: 'ellipse',
  '5': 'arrow', a: 'arrow', '6': 'line', l: 'line', '7': 'freedraw', p: 'freedraw', '8': 'text', t: 'text', '9': 'image',
  e: 'eraser', h: 'hand', k: 'laser',
};

const initialApp = (): AppState => ({
  tool: 'selection', toolLocked: false, scrollX: 0, scrollY: 0, zoom: 1, selectedIds: {}, theme: 'light', viewBg: '#ffffff',
  grid: false, zen: false, style: { ...DEFAULT_STYLE }, editing: null, width: 1200, height: 800, showLibrary: false, sidebarTab: 'library', search: '', searchIdx: 0,
  exportOpen: false, helpOpen: false, menuOpen: false, contextMenu: null, projectsOpen: false, projectName: 'Untitled', confirmClear: false, confirmDiscard: false, embedDialog: null, embedConfirm: null, loadedEmbeds: {}, activeEmbed: null, shapeAssist: true,
  presenting: false, viewOnly: false, sharedView: false, activeComment: null, mermaidOpen: false, imageMode: 'high', fileLink: null,
});

type Snap = { elements: DrawElement[]; sel: Record<string, true> };

export default function Editor() {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const st = useRef({
    app: initialApp(),
    elements: [] as DrawElement[],
    hist: { stack: [{ elements: [], sel: {} }] as Snap[], idx: 0 },
  });
  const drag = useRef<Drag | null>(null);
  const misc = useRef({
    space: false, pointer: [0, 0] as Pt, multi: null as string | null, erasing: new Set<string>(),
    boxSel: null as { x1: number; y1: number; x2: number; y2: number } | null, hoverBind: null as DrawElement | null,
    hl: { ids: [] as string[], cur: null as string | null }, laser: [] as [number, number, number][], clip: [] as DrawElement[], pending: null as DrawElement | null,
    styleClip: null as Partial<Style> | null, raf: 0, imageAt: null as Pt | null, lib: [] as LibItem[], saveWarned: false, lastFail: 0, retryT: 0, pendingLeave: null as null | (() => void), fileHandle: null as any, fileProjectId: '' as string, lastLinked: '' as string, holdT: 0, embedAt: null as Pt | null, linkSig: null as null | { els: DrawElement[]; bg: string; grid: boolean }, linkQueue: Promise.resolve() as Promise<void>, dropped: [] as { after: string | null; raw: unknown }[], shared: null as any, saveT: 0, projectId: '' as string,
  });
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const filePick = useRef(createFileInputController()).current;
  const imgPick = useRef(createFileInputController()).current;
  const ctxMenu = useRef(createMenuController()).current;
  const [library, setLibraryState] = useState<LibItem[]>([]);

  const A = () => st.current.app;
  const E = () => st.current.elements;
  const setApp = (p: Partial<AppState>) => { st.current.app = { ...st.current.app, ...p }; rerender(); };
  const setEls = (els: DrawElement[]) => { st.current.elements = els; rerender(); };
  const sel = () => E().filter((e) => A().selectedIds[e.id]);
  const select = (ids: string[]) => setApp({ selectedIds: Object.fromEntries(ids.map((i) => [i, true])) as Record<string, true> });
  const snapV = (v: number) => (A().grid ? Math.round(v / GRID) * GRID : v);
  const setLibrary = (l: LibItem[]) => {
    misc.current.lib = l; setLibraryState(l);
    try { localStorage.setItem(LIBKEY, JSON.stringify(l)); } catch {}
  };

  /* ---------- history ---------- */
  const commit = () => {
    const h = st.current.hist;
    const last = h.stack[h.idx];
    if (last.elements === st.current.elements) { last.sel = A().selectedIds; return; }
    h.stack = h.stack.slice(0, h.idx + 1);
    h.stack.push({ elements: st.current.elements, sel: A().selectedIds });
    if (h.stack.length > 200) h.stack.shift();
    h.idx = h.stack.length - 1;
    rerender();
  };
  const undo = () => {
    const h = st.current.hist;
    if (A().editing || h.idx === 0) return;
    finishMulti(false, true);
    h.idx--;
    const s = h.stack[h.idx];
    st.current.elements = s.elements;
    setApp({ selectedIds: s.sel });
  };
  const redo = () => {
    const h = st.current.hist;
    if (A().editing || h.idx >= h.stack.length - 1) return;
    h.idx++;
    const s = h.stack[h.idx];
    st.current.elements = s.elements;
    setApp({ selectedIds: s.sel });
  };

  /* ---------- coordinate helpers ---------- */
  const toScene = (e: { clientX: number; clientY: number }): Pt => {
    const r = overlayRef.current!.getBoundingClientRect();
    const a = A();
    return [(e.clientX - r.left) / a.zoom - a.scrollX, (e.clientY - r.top) / a.zoom - a.scrollY];
  };
  const viewCenter = (): Pt => {
    const a = A();
    return [a.width / 2 / a.zoom - a.scrollX, a.height / 2 / a.zoom - a.scrollY];
  };
  const zoomAt = (z: number, cx = A().width / 2, cy = A().height / 2) => {
    const a = A();
    const nz = clamp(z, 0.1, 30);
    const sx = cx / a.zoom - a.scrollX, sy = cy / a.zoom - a.scrollY;
    setApp({ zoom: nz, scrollX: cx / nz - sx, scrollY: cy / nz - sy });
  };
  const zoomToElements = (els: DrawElement[], maxZ = 1) => {
    const a = A();
    if (!els.length) return setApp({ zoom: 1, scrollX: 0, scrollY: 0 });
    const [x1, y1, x2, y2] = commonBounds(els);
    const pad = 60;
    const z = clamp(Math.min(a.width / (x2 - x1 + pad * 2), a.height / (y2 - y1 + pad * 2)), 0.1, maxZ);
    setApp({ zoom: z, scrollX: a.width / 2 / z - (x1 + x2) / 2, scrollY: a.height / 2 / z - (y1 + y2) / 2 });
  };

  /** Scrolls (and, if needed, zooms out) so an element sits in the visible part of the canvas, beside the sidebar. */
  const revealElement = (id: string, patch: Partial<AppState> = {}) => {
    const el = E().find((x) => x.id === id);
    if (!el) return setApp(patch);
    const a = A();
    const viewW = a.width - (a.showLibrary && a.width > 760 ? 330 : 0);
    const [x1, y1, x2, y2] = commonBounds([el]);
    const pad = 60;
    const fit = clamp(Math.min(viewW / (x2 - x1 + pad * 2), a.height / (y2 - y1 + pad * 2)), 0.1, 30);
    const z = Math.min(a.zoom, fit);
    setApp({ ...patch, zoom: z, scrollX: viewW / 2 / z - (x1 + x2) / 2, scrollY: a.height / 2 / z - (y1 + y2) / 2 });
  };
  const openSidebar = (tab: SidebarTab) => {
    setApp({ showLibrary: true, sidebarTab: tab });
    if (tab === 'search') setTimeout(() => { const i = document.getElementById('sidebar-search') as HTMLInputElement | null; i?.focus(); i?.select(); }, 30);
  };
  const setSearch = (q: string) => {
    const first = searchElements(E(), q)[0];
    if (first) revealElement(first.id, { search: q, searchIdx: 0 });
    else setApp({ search: q, searchIdx: 0 });
  };
  const goToSearch = (i: number) => {
    const h = searchElements(E(), A().search)[i];
    if (!h) return;
    revealElement(h.id, { searchIdx: i, selectedIds: { [h.id]: true }, activeComment: h.type === 'comment' ? h.id : null });
  };
  const openComment = (id: string) => revealElement(id, { activeComment: id, selectedIds: {} });

  /* ---------- tools ---------- */
  const setTool = (t: ToolType) => {
    finishMulti(true);
    if (A().editing) commitText(null);
    const a = A();
    const p: Partial<AppState> = { tool: t, contextMenu: null };
    if (t !== 'selection') p.selectedIds = {};
    setApp(p);
    if (t === 'image') { misc.current.imageAt = null; imgPick.open(); }
    if (t === 'embed') { misc.current.embedAt = null; setApp({ embedDialog: { id: null }, tool: 'selection' }); }
    void a;
  };

  /* ---------- element operations ---------- */
  const relevant = (e: DrawElement, k: keyof Style) => {
    const shape = e.type === 'rectangle' || e.type === 'diamond' || e.type === 'ellipse';
    switch (k) {
      case 'strokeColor': return e.type !== 'image';
      case 'backgroundColor': return shape || e.type === 'markdown' || (e.type === 'line' && !!e.closed);
      case 'fillStyle': return shape || (e.type === 'line' && !!e.closed);
      case 'strokeWidth': return e.type !== 'text' && e.type !== 'image';
      case 'strokeStyle': case 'roughness': return shape || isLinear(e);
      case 'roundness': return e.type === 'rectangle' || e.type === 'diamond';
      case 'fontFamily': case 'fontSize': case 'textAlign': return e.type === 'text' || e.type === 'markdown' || canHaveLabel(e);
      case 'arrowType': return isLinear(e);
      case 'startArrowhead': case 'endArrowhead': return e.type === 'arrow';
      default: return true;
    }
  };
  const applyStyle = (patch: Partial<Style>) => {
    const ids = A().selectedIds;
    if (Object.keys(ids).length) {
      setEls(E().map((e) => {
        if (!ids[e.id]) return e;
        const p: any = {};
        for (const k of Object.keys(patch) as (keyof Style)[]) if (relevant(e, k)) p[k] = patch[k];
        if (p.arrowType === 'sharp' || p.arrowType === 'round' || p.arrowType === 'elbow') { if (e.type === 'line' && p.arrowType === 'elbow') delete p.arrowType; }
        let n = { ...e, ...p } as DrawElement;
        if (n.type === 'text' && ('fontSize' in p || 'fontFamily' in p)) n = fitText(n);
        if (n.type === 'markdown' && ('fontSize' in p || 'fontFamily' in p)) n = fitMarkdown(n);
        return n;
      }));
      commit();
    }
    setApp({ style: { ...A().style, ...patch } });
  };
  const cloneElements = (els: DrawElement[], dx: number, dy: number): DrawElement[] => {
    const gmap = new Map<string, string>();
    const idmap = new Map<string, string>(els.map((e) => [e.id, uid()]));
    return els.map((e) => ({
      ...e,
      id: idmap.get(e.id)!,
      x: e.x + dx,
      y: e.y + dy,
      seed: Math.floor(Math.random() * 2 ** 31),
      groupIds: e.groupIds.map((g) => { if (!gmap.has(g)) gmap.set(g, uid()); return gmap.get(g)!; }),
      startBinding: e.startBinding && idmap.get(e.startBinding) ? idmap.get(e.startBinding)! : null,
      endBinding: e.endBinding && idmap.get(e.endBinding) ? idmap.get(e.endBinding)! : null,
    }));
  };
  const deleteIds = (ids: Record<string, true>) => {
    if (!Object.keys(ids).length) return;
    setEls(E().filter((e) => !ids[e.id]).map((e) =>
      e.type === 'arrow' && ((e.startBinding && ids[e.startBinding]) || (e.endBinding && ids[e.endBinding]))
        ? { ...e, startBinding: e.startBinding && ids[e.startBinding] ? null : e.startBinding, endBinding: e.endBinding && ids[e.endBinding] ? null : e.endBinding }
        : e));
    setApp({ selectedIds: {} });
    commit();
  };
  const deleteSelected = () => deleteIds(A().selectedIds);
  const duplicate = () => {
    const s = sel();
    if (!s.length) return;
    const c = cloneElements(s, 12, 12);
    setEls([...E(), ...c]);
    select(c.map((e) => e.id));
    commit();
  };
  const addElements = (els: DrawElement[], pos?: Pt) => {
    if (!els.length) return;
    let list = els;
    if (pos) {
      const [x1, y1, x2, y2] = commonBounds(els);
      const dx = pos[0] - (x1 + x2) / 2, dy = pos[1] - (y1 + y2) / 2;
      list = cloneElements(els, dx, dy);
    }
    setEls([...E(), ...list]);
    setApp({ selectedIds: Object.fromEntries(list.map((e) => [e.id, true])) as Record<string, true>, tool: 'selection' });
    commit();
  };
  const layer = (kind: 'front' | 'forward' | 'backward' | 'back') => {
    const ids = A().selectedIds;
    let els = [...E()];
    if (kind === 'front') els = [...els.filter((e) => !ids[e.id]), ...els.filter((e) => ids[e.id])];
    else if (kind === 'back') els = [...els.filter((e) => ids[e.id]), ...els.filter((e) => !ids[e.id])];
    else if (kind === 'forward') { for (let i = els.length - 2; i >= 0; i--) if (ids[els[i].id] && !ids[els[i + 1].id]) [els[i], els[i + 1]] = [els[i + 1], els[i]]; }
    else { for (let i = 1; i < els.length; i++) if (ids[els[i].id] && !ids[els[i - 1].id]) [els[i], els[i - 1]] = [els[i - 1], els[i]]; }
    setEls(els); commit();
  };
  const group = () => {
    const s = sel();
    if (s.length < 2) return;
    const g = uid();
    const ids = A().selectedIds;
    setEls(E().map((e) => (ids[e.id] ? { ...e, groupIds: [...e.groupIds, g] } : e)));
    commit();
  };
  const ungroup = () => {
    const ids = A().selectedIds;
    setEls(E().map((e) => (ids[e.id] && e.groupIds.length ? { ...e, groupIds: e.groupIds.slice(0, -1) } : e)));
    commit();
  };
  const toggleLock = () => {
    const s = sel();
    if (!s.length) return;
    const lock = !s.every((e) => e.locked);
    const ids = A().selectedIds;
    setEls(E().map((e) => (ids[e.id] ? { ...e, locked: lock } : e)));
    if (lock) setApp({ selectedIds: {} });
    commit();
  };
  const moveEls = (e: DrawElement, dx: number, dy: number): DrawElement => ({ ...e, x: e.x + dx, y: e.y + dy });
  const align = (kind: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => {
    const s = sel();
    if (s.length < 2) return;
    const [X1, Y1, X2, Y2] = commonBounds(s);
    const ids = A().selectedIds;
    setEls(E().map((e) => {
      if (!ids[e.id]) return e;
      const [a, b, c, d] = elAABB(e);
      let dx = 0, dy = 0;
      if (kind === 'left') dx = X1 - a; if (kind === 'right') dx = X2 - c; if (kind === 'hcenter') dx = (X1 + X2) / 2 - (a + c) / 2;
      if (kind === 'top') dy = Y1 - b; if (kind === 'bottom') dy = Y2 - d; if (kind === 'vcenter') dy = (Y1 + Y2) / 2 - (b + d) / 2;
      return moveEls(e, dx, dy);
    }));
    afterMove(new Set(Object.keys(ids)));
    commit();
  };
  const distribute = (axis: 'h' | 'v') => {
    const s = sel();
    if (s.length < 3) return;
    const i0 = axis === 'h' ? 0 : 1;
    const items = s.map((e) => ({ e, b: elAABB(e) })).sort((p, q) => p.b[i0] - q.b[i0]);
    const total = items[items.length - 1].b[i0 + 2] - items[0].b[i0];
    const sum = items.reduce((t, it) => t + (it.b[i0 + 2] - it.b[i0]), 0);
    const gap = (total - sum) / (items.length - 1);
    let pos = items[0].b[i0];
    const d = new Map<string, number>();
    for (const it of items) { d.set(it.e.id, pos - it.b[i0]); pos += it.b[i0 + 2] - it.b[i0] + gap; }
    setEls(E().map((e) => (d.has(e.id) ? (axis === 'h' ? moveEls(e, d.get(e.id)!, 0) : moveEls(e, 0, d.get(e.id)!)) : e)));
    afterMove(new Set(d.keys()));
    commit();
  };
  const flip = (axis: 'h' | 'v') => {
    const s = sel();
    if (!s.length) return;
    const [X1, Y1, X2, Y2] = commonBounds(s);
    const ids = A().selectedIds;
    setEls(E().map((e) => {
      if (!ids[e.id]) return e;
      const c = elCenter(e);
      const nc: Pt = axis === 'h' ? [X1 + X2 - c[0], c[1]] : [c[0], Y1 + Y2 - c[1]];
      let n = { ...e, angle: (2 * Math.PI - e.angle) % (2 * Math.PI) };
      if (isPoints(e)) {
        const pts = absPoints(e).map(([x, y]) => (axis === 'h' ? [2 * c[0] - x, y] : [x, 2 * c[1] - y]) as Pt);
        n = withAbsPoints(n, pts);
      }
      const nb = elCenter(n);
      return moveEls(n, nc[0] - nb[0], nc[1] - nb[1]);
    }));
    afterMove(new Set(Object.keys(ids)));
    commit();
  };
  const afterMove = (ids: Set<string>) => setEls(updateBoundArrows(E(), ids));
  const copyStyle = () => {
    const s = sel()[0];
    if (s) misc.current.styleClip = { strokeColor: s.strokeColor, backgroundColor: s.backgroundColor, fillStyle: s.fillStyle, strokeWidth: s.strokeWidth, strokeStyle: s.strokeStyle, roughness: s.roughness, opacity: s.opacity, roundness: s.roundness, fontFamily: s.fontFamily, fontSize: s.fontSize, textAlign: s.textAlign };
  };
  const pasteStyle = () => { if (misc.current.styleClip) applyStyle(misc.current.styleClip); };
  const selectAll = () => select(E().filter((e) => !e.locked).map((e) => e.id));
  const addToLibrary = () => {
    const s = sel();
    if (!s.length) return;
    setLibrary([{ id: uid(), name: `Item ${misc.current.lib.length + 1}`, elements: cloneElements(s, 0, 0) }, ...misc.current.lib]);
    setApp({ showLibrary: true, sidebarTab: 'library' });
  };

  /* ---------- sharing & linked file ---------- */
  /** Puts unreadable entries back next to the element they followed when loaded, so saving keeps them in place. */
  const withHidden = (els: DrawElement[]): DrawElement[] => {
    const hidden = misc.current.dropped;
    if (!hidden.length) return els;
    const ids = new Set(els.map((x) => x.id));
    const out: unknown[] = hidden.filter((h) => h.after === null).map((h) => h.raw);
    for (const el of els) { out.push(el); for (const h of hidden) if (h.after === el.id) out.push(h.raw); }
    for (const h of hidden) if (h.after !== null && !ids.has(h.after)) out.push(h.raw);
    return out as DrawElement[];
  };
  const drawFileData = () => ({ type: 'draw', version: 1, source: 'draw', elements: withHidden(E()), appState: { viewBackgroundColor: A().viewBg, gridSize: A().grid ? GRID : null } });
  const copyShareLink = async () => {
    const data = { elements: E().filter((e) => e.type !== 'comment'), viewBg: A().viewBg };
    const enc = await encodeScene(data);
    if (enc.length > MAX_LINK_CHARS) return toast('This drawing is too large to share as a link. Export it as a file instead.');
    const url = `${location.origin}${location.pathname}#v=${enc}`;
    try { await navigator.clipboard.writeText(url); toast(`View-only link copied (${Math.round(url.length / 1024)} KB). The drawing lives inside the link, so big drawings make long links.`); }
    catch { toast('Could not access the clipboard. Your browser blocked copying the link.'); }
  };
  const editCopy = () => {
    const s = misc.current.shared;
    if (!s) return;
    const id = createProject('Shared drawing copy', { ...emptyData(), elements: s.elements, viewBg: s.viewBg });
    if (!id) return warnStorage('save a copy');
    loadProject(id); // also leaves the shared view and clears the link
    setApp({ tool: 'selection' });
    setTimeout(() => zoomToElements(E()), 0);
  };
  /** Autosaves into the linked file, but only while the project it was linked from is the open one. */
  const linkedJson = () => JSON.stringify(drawFileData(), null, 2);
  /** Cheap "did anything that goes into the file change?" check, so panning/zooming doesn't re-serialise the scene. */
  const sameLinkSig = () => {
    const s = misc.current.linkSig, a = A();
    return !!s && s.els === E() && s.bg === a.viewBg && s.grid === a.grid;
  };
  const markLinkSig = () => { const a = A(); misc.current.linkSig = { els: E(), bg: a.viewBg, grid: a.grid }; };
  /**
   * Autosaves into the linked file while the project it was linked from is open. Writes are queued so they can't
   * finish out of order, only happen when the drawing changed, and only count as done once the file is closed.
   */
  const writeLinked = () => {
    misc.current.linkQueue = misc.current.linkQueue.then(async () => {
      const h = misc.current.fileHandle;
      if (!h || misc.current.fileProjectId !== misc.current.projectId || sameLinkSig()) return;
      markLinkSig();
      const json = linkedJson();
      if (json === misc.current.lastLinked) return;
      try {
        const w = await h.createWritable();
        await w.write(json);
        await w.close();
        misc.current.lastLinked = json;
      } catch {
        misc.current.linkSig = null;
        if (misc.current.fileHandle === h) {
          unlinkFile();
          toast(`Couldn't write to “${h.name}”, so autosaving to that file has stopped. Your project is still saved in the browser.`);
        }
      }
    });
  };
  const linkFile = (h: any, alreadyInFile = false) => {
    misc.current.fileHandle = h;
    misc.current.fileProjectId = misc.current.projectId;
    misc.current.lastLinked = alreadyInFile ? linkedJson() : '';
    misc.current.linkSig = alreadyInFile ? { els: E(), bg: A().viewBg, grid: A().grid } : null;
    setApp({ fileLink: h.name });
  };
  const unlinkFile = () => { misc.current.fileHandle = null; misc.current.fileProjectId = ''; misc.current.linkSig = null; setApp({ fileLink: null }); };
  const linkSaveFile = async () => {
    try {
      const h = await (window as any).showSaveFilePicker({ suggestedName: `${fileBase()}.draw`, types: [{ description: 'Drawing', accept: { 'application/json': ['.draw', '.json'] } }] });
      linkFile(h);
      writeLinked();
    } catch {}
  };
  const linkOpenFile = async () => {
    try {
      const [h] = await (window as any).showOpenFilePicker({ types: [{ description: 'Drawing', accept: { 'application/json': ['.draw', '.json'] } }] });
      const parsed = await parseProjectFile(await h.getFile());
      if (!parsed) return;
      if (!parsed.native) {
        // never overwrite another tool's file with this app's format: open it as a copy instead
        openAsProject(parsed.name, parsed.data, () => toast('Opened as a copy. Autosave to a file only works with .draw files, so this file is left unchanged.'));
        return;
      }
      // link only once the file has really been opened, and don't rewrite it until something changes
      openAsProject(parsed.name, parsed.data, () => linkFile(h, true));
    } catch {}
  };

  /* ---------- clipboard ---------- */
  const serialize = (els: DrawElement[]) => JSON.stringify({ type: 'draw/clipboard', elements: els });
  const copySelected = async (e?: ClipboardEvent) => {
    const s = sel();
    if (!s.length) return false;
    misc.current.clip = s;
    const json = serialize(s);
    if (e?.clipboardData) { e.clipboardData.setData('text/plain', json); e.preventDefault(); }
    else try { await navigator.clipboard.writeText(json); } catch {}
    return true;
  };
  const pasteElements = (list: DrawElement[]) => {
    const p = misc.current.pointer;
    const a = A();
    const inView = p[0] > -a.scrollX && p[0] < -a.scrollX + a.width / a.zoom;
    addElements(list, inView ? p : viewCenter());
  };
  const insertText = (text: string) => {
    const a = A();
    const looksMd = text.includes('\n') && /^(#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|```|>\s|\|.*\|)/m.test(text);
    const el = looksMd ? fitMarkdown(newElement('markdown', 0, 0, { ...a.style, fontSize: 18, fontFamily: 2 }, { text, width: 480 })) : fitText(newElement('text', 0, 0, a.style, { text }));
    pasteElements([el]);
  };
  const insertImageFile = async (file: File | Blob, at?: Pt) => {
    if (file.size > MAX_IMPORT_BYTES) return toast('That image is too large (limit 25 MB).');
    const dataURL = await processImage(file, A().imageMode);
    const img = new Image();
    img.src = dataURL;
    await new Promise((r) => { img.onload = r; img.onerror = r; });
    const maxS = 420;
    let w = img.naturalWidth || 200, h = img.naturalHeight || 200;
    const k = Math.min(1, maxS / Math.max(w, h));
    w *= k; h *= k;
    const el = newElement('image', 0, 0, A().style, { width: w, height: h, dataURL, strokeColor: 'transparent' });
    const c = at ?? viewCenter();
    addElements([{ ...el, x: c[0] - w / 2, y: c[1] - h / 2 }]);
  };

  /* ---------- files ---------- */
  const fileBase = () => (A().projectName || 'scene').replace(/[^\w\- ]+/g, '').trim() || 'scene';
  const saveFile = () => {
    const a = A();
    const data = { type: 'draw', version: 1, source: 'draw', elements: E(), appState: { viewBackgroundColor: a.viewBg, gridSize: a.grid ? GRID : null } };
    download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${fileBase()}.draw`);
  };
  const exportJsonFile = () => {
    const a = A();
    download(new Blob([JSON.stringify(exportInterchange(E(), a.viewBg, a.grid), null, 2)], { type: 'application/json' }), `${fileBase()}.json`);
  };
  const exportMarkdownFile = () => {
    const els = sel().length ? sel() : E();
    download(new Blob([toMarkdown(els, A().projectName)], { type: 'text/markdown' }), `${fileBase()}.md`);
  };
  const snapshot = (): ProjectData => {
    const a = A();
    return { elements: withHidden(E()), viewBg: a.viewBg, grid: a.grid, scrollX: a.scrollX, scrollY: a.scrollY, zoom: a.zoom };
  };
  /** Saves the open project. Returns false when it could not be stored (so callers can avoid discarding it). */
  const saveNow = (force = false, quiet = false): boolean => {
    if (!misc.current.projectId) return true;
    // after a failed write, autosave only retries every 10 s instead of re-serialising the scene on every tick
    // (explicit saves, e.g. before leaving the project, always try again)
    const wait = 10_000 - (Date.now() - misc.current.lastFail);
    if (!force && misc.current.saveWarned && wait > 0) {
      if (!misc.current.retryT) misc.current.retryT = window.setTimeout(() => { misc.current.retryT = 0; saveNow(); }, wait + 50);
      return false;
    }
    if (saveProject(misc.current.projectId, snapshot())) { misc.current.saveWarned = false; return true; }
    misc.current.lastFail = Date.now();
    if (!misc.current.saveWarned && !quiet) toast('Browser storage is full, so this project is not being saved. Export it as a file or delete other projects.');
    misc.current.saveWarned = true;
    return false;
  };
  /** Runs `action` (which replaces the open scene) only once the current project is safely saved, or the user agrees to discard it. */
  const leaveProject = (action: () => void) => {
    finishMulti(true, true);
    if (saveNow(true, true)) return action(); // the prompt below is the message, so no extra toast
    misc.current.pendingLeave = action;
    setApp({ confirmDiscard: true });
  };
  const loadProject = (id: string) => {
    const d = getProject(id) || emptyData();
    const raw = Array.isArray(d.elements) ? (d.elements as unknown[]) : [];
    const els: DrawElement[] = [];
    const dropped: { after: string | null; raw: unknown }[] = [];
    for (const r of raw) {
      const n = normalizeImported(r, DEFAULT_STYLE);
      if (n) els.push(n); else dropped.push({ after: els.length ? els[els.length - 1].id : null, raw: r });
    }
    // Unreadable entries are hidden but written back unchanged on save, so loading never deletes stored data.
    misc.current.dropped = dropped;
    if (dropped.length) toast(`${dropped.length} element${dropped.length === 1 ? '' : 's'} in this project couldn't be displayed. ${dropped.length === 1 ? 'It is' : 'They are'} kept unchanged in storage.`);
    if (misc.current.fileHandle && misc.current.fileProjectId !== id) unlinkFile();
    misc.current.projectId = id;
    if (misc.current.shared) { misc.current.shared = null; if (location.hash) history.replaceState(null, '', location.pathname); }
    setCurrentId(id);
    st.current.elements = els;
    st.current.hist = { stack: [{ elements: els, sel: {} }], idx: 0 };
    setApp({ search: '', searchIdx: 0, loadedEmbeds: {}, activeEmbed: null, embedConfirm: null, selectedIds: {}, editing: null, viewOnly: st.current.app.sharedView ? false : st.current.app.viewOnly, sharedView: false, activeComment: null, viewBg: d.viewBg || '#ffffff', grid: !!d.grid, scrollX: d.scrollX ?? 0, scrollY: d.scrollY ?? 0, zoom: d.zoom ?? 1, projectName: listProjects().find((p) => p.id === id)?.name ?? 'Untitled' });
  };
  const switchProject = (id: string) => leaveProject(() => loadProject(id));
  const newProject = (name: string) => leaveProject(() => {
    const id = createProject(name);
    if (!id) return warnStorage('create a project');
    loadProject(id);
  });
  const removeProject = (id: string) => {
    const cur = id === misc.current.projectId;
    if (cur) misc.current.projectId = '';
    deleteProject(id);
    if (cur) {
      const next = listProjects()[0];
      loadProject(next ? next.id : createProject('Untitled') ?? uid()); // a real id, so saving keeps working (and re-indexes)
    }
  };
  const refreshName = () => setApp({ projectName: listProjects().find((p) => p.id === misc.current.projectId)?.name ?? 'Untitled' });
  /** Creates a project from imported data and opens it; `onOpened` runs once it is open (not if the user backs out). */
  const openAsProject = (name: string, data: ProjectData, onOpened?: () => void) => leaveProject(() => {
    const id = createProject(name, data);
    if (!id) return void warnStorage('open this file as a project');
    loadProject(id);
    onOpened?.();
    setTimeout(() => zoomToElements(E()), 0);
  });
  /** Reads a .draw, compatible .json or .md file into project data (null + a message when unusable). */
  const parseProjectFile = async (file: File): Promise<{ name: string; data: ProjectData; native: boolean } | null> => {
    if (file.size > MAX_IMPORT_BYTES) { toast('That file is too large (limit 25 MB).'); return null; }
    if (/\.(md|markdown|mdx|txt)$/i.test(file.name) || file.type === 'text/markdown') {
      let els: DrawElement[];
      try { els = parseMarkdown(await file.text(), { ...DEFAULT_STYLE }); } catch { toast('Could not read this Markdown file.'); return null; }
      if (!els.length) { toast('This Markdown file is empty.'); return null; }
      return { name: file.name.replace(/\.(md|markdown|mdx|txt)$/i, '') || 'Markdown', data: { ...emptyData(), elements: els }, native: false };
    }
    try {
      const data = JSON.parse(await file.text());
      let d: ProjectData;
      let native = false;
      if (isInterchangeData(data)) {
        const r = importInterchange(data);
        d = { ...emptyData(), elements: r.elements, viewBg: r.viewBg, grid: r.grid };
      } else {
        const raw: any[] = Array.isArray(data) ? data : data?.elements;
        if (!Array.isArray(raw)) throw new Error('bad');
        native = data?.type === 'draw';
        const norm = raw.map((r) => normalizeImported(r, DEFAULT_STYLE));
        // Our own .draw files keep entries this version can't read (loadProject hides them and writes them back);
        // anything else just skips them.
        const els = (native ? norm.map((n, i) => n ?? raw[i]) : norm.filter(Boolean)) as DrawElement[];
        const skipped = norm.filter((n) => !n).length;
        if (skipped && !native) toast(`${skipped} element${skipped === 1 ? '' : 's'} in this file couldn't be read and ${skipped === 1 ? 'was' : 'were'} skipped.`);
        d = { ...emptyData(), elements: els, viewBg: data?.appState?.viewBackgroundColor || '#ffffff', grid: !!data?.appState?.gridSize };
      }
      return { name: file.name.replace(/\.(draw|json)$/i, '') || 'Imported', data: d, native };
    } catch { toast('Could not read this file. Expected a .draw, .json or .md file.'); return null; }
  };
  /** Import a .draw, compatible .json or .md file as a new project (images go on the canvas) */
  const openFile = async (file: File) => {
    if (file.type.startsWith('image/')) return insertImageFile(file); // enforces its own size limit
    const parsed = await parseProjectFile(file);
    if (parsed) openAsProject(parsed.name, parsed.data);
  };
  const clearCanvas = () => {
    if (E().length && !A().confirmClear) return setApp({ confirmClear: true });
    setEls([]); setApp({ selectedIds: {}, confirmClear: false }); commit();
  };
  const exportSelectionOrAll = () => { const s = sel(); return s.length ? s : E(); };
  const copyPNG = async () => {
    const c = exportCanvas(exportSelectionOrAll(), { padding: 16, scale: 2, background: A().viewBg, dark: A().theme === 'dark' });
    if (!c) return;
    const blob: Blob | null = await new Promise((r) => c.toBlob(r));
    if (blob) try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); } catch { download(blob, 'draw.png'); }
  };

  /* ---------- text editing ---------- */
  const startEdit = (el: DrawElement, isNew: boolean) => {
    if (isNew) misc.current.pending = el;
    setApp({ editing: { id: el.id, isNew }, selectedIds: isNew ? {} : { [el.id]: true } });
  };
  const commitText = (text: string | null) => {
    const a = A();
    const ed = a.editing;
    if (!ed) return;
    const t = text ?? (document.querySelector('#draw-text-editor') as HTMLTextAreaElement | null)?.value ?? '';
    st.current.app = { ...a, editing: null };
    if (ed.isNew) {
      const p = misc.current.pending;
      misc.current.pending = null;
      if (p && t.trim()) {
        const el = p.type === 'markdown' ? fitMarkdown({ ...p, text: t }) : fitText({ ...p, text: t });
        st.current.elements = [...E(), el];
        st.current.app = { ...st.current.app, selectedIds: { [el.id]: true }, tool: st.current.app.toolLocked ? p.type : 'selection' };
        commit();
      } else st.current.app = { ...st.current.app, tool: st.current.app.toolLocked ? (p?.type === 'markdown' ? 'markdown' : 'text') : 'selection' };
    } else {
      const el = E().find((e) => e.id === ed.id);
      if (el) {
        if (el.type === 'markdown') {
          if (!t.trim()) { st.current.elements = E().filter((e) => e.id !== el.id); st.current.app = { ...st.current.app, selectedIds: {} }; }
          else st.current.elements = E().map((e) => (e.id === el.id ? fitMarkdown({ ...e, text: t }) : e));
        } else if (el.type === 'text') {
          if (!t.trim()) { st.current.elements = E().filter((e) => e.id !== el.id); st.current.app = { ...st.current.app, selectedIds: {} }; }
          else st.current.elements = E().map((e) => (e.id === el.id ? fitText({ ...e, text: t }) : e));
        } else {
          let n = { ...el, text: t.trim() ? t : '' };
          if (n.text && n.type !== 'arrow' && n.type !== 'frame') {
            const m = measureText(n.text, n.fontSize, n.fontFamily);
            const k = n.type === 'diamond' ? 2 : n.type === 'ellipse' ? 1.42 : 1;
            const nw = Math.max(n.width, m.w * k + 24), nh = Math.max(n.height, m.h * k + 16);
            n = { ...n, x: n.x - (nw - n.width) / 2, y: n.y - (nh - n.height) / 2, width: nw, height: nh };
          }
          st.current.elements = E().map((e) => (e.id === el.id ? n : e));
          st.current.elements = updateBoundArrows(st.current.elements, new Set([el.id]));
        }
        commit();
      }
    }
    rerender();
  };
  const editSelected = () => {
    const s = sel();
    if (s.length !== 1) return;
    const e = s[0];
    if (e.type === 'text' || e.type === 'markdown' || canHaveLabel(e)) startEdit(e, false);
  };

  /* ---------- multipoint lines ---------- */
  const finishMulti = (removeLast: boolean, silent = false) => {
    const id = misc.current.multi;
    if (!id) return;
    misc.current.multi = null;
    let el = E().find((e) => e.id === id);
    if (!el) return;
    let abs = absPoints(el);
    if (removeLast) abs = abs.slice(0, -1);
    const dd: Pt[] = [];
    for (const p of abs) if (!dd.length || dist(p, dd[dd.length - 1]) > 2) dd.push(p);
    if (dd.length < 2) { st.current.elements = E().filter((e) => e.id !== id); }
    else {
      el = withAbsPoints(el, dd);
      if (el.type === 'arrow') {
        const t = findBindTarget(E(), dd[dd.length - 1]);
        const s = findBindTarget(E(), dd[0]);
        el = { ...el, endBinding: t?.id ?? null, startBinding: s?.id ?? null };
      }
      const final = el;
      st.current.elements = E().map((e) => (e.id === id ? final : e));
      st.current.elements = updateBoundArrows(st.current.elements, new Set([final.startBinding, final.endBinding].filter(Boolean) as string[]));
      st.current.app = { ...A(), selectedIds: { [id]: true }, tool: A().toolLocked ? A().tool : 'selection' };
    }
    misc.current.hoverBind = null;
    if (!silent) { commit(); rerender(); }
  };

  /* ---------- pointer interactions ---------- */
  const topHit = (p: Pt): DrawElement | null => {
    const tol = 9 / A().zoom;
    const els = E();
    for (let i = els.length - 1; i >= 0; i--) if (!els[i].locked && hitElement(els[i], p, tol)) return els[i];
    return null;
  };
  const selBoxInfo = () => {
    const s = sel();
    const box = getSelBox(s);
    return { s, box, singleLinear: s.length === 1 && isLinear(s[0]) };
  };
  const cursorFor = (handle: string | null) => {
    if (!handle) return null;
    if (handle === 'rot') return 'grab';
    return handle === 'n' || handle === 's' ? 'ns-resize' : handle === 'e' || handle === 'w' ? 'ew-resize' : handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize';
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const a = A();
    if (a.contextMenu || a.menuOpen) setApp({ contextMenu: null, menuOpen: false });
    if (e.button === 2) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const raw = toScene(e);
    misc.current.pointer = raw;
    if (a.editing) { commitText(null); return; }
    clearTimeout(misc.current.holdT);
    if (a.activeEmbed) setApp({ activeEmbed: null });
    if (a.tool === 'bucket' && e.button === 0 && !misc.current.space && !a.viewOnly) { bucketAt(raw); return; }
    if (e.button === 1 || a.tool === 'hand' || misc.current.space || a.viewOnly) {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, scrollX: a.scrollX, scrollY: a.scrollY };
      return;
    }
    const p: Pt = [snapV(raw[0]), snapV(raw[1])];
    if (misc.current.multi) {
      const el = E().find((x) => x.id === misc.current.multi)!;
      setEls(E().map((x) => (x.id === el.id ? withAbsPoints(el, [...absPoints(el), p]) : x)));
      return;
    }
    switch (a.tool) {
      case 'selection': {
        const { s, box, singleLinear } = selBoxInfo();
        if (box && !singleLinear) {
          const h = hitHandle(box, raw, a.zoom, false);
          if (h === 'rot') { drag.current = { kind: 'rotate', snap: s, center: [(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2], startAngle: Math.atan2(raw[1] - (box.y1 + box.y2) / 2, raw[0] - (box.x1 + box.x2) / 2) }; return; }
          if (h) { drag.current = { kind: 'resize', handle: h, snap: s, box }; return; }
        }
        if (singleLinear) {
          const el = s[0];
          const c = elCenter(el);
          const abs = absPoints(el).map((q) => (el.angle ? rotatePt(q, c, el.angle) : q));
          const r = 9 / a.zoom;
          const idx = abs.findIndex((q) => dist(q, raw) <= r);
          if (idx >= 0) { drag.current = { kind: 'point', id: el.id, idx }; return; }
          if (!(el.type === 'arrow' && el.arrowType === 'elbow')) {
            for (let i = 0; i < abs.length - 1; i++) {
              const m: Pt = [(abs[i][0] + abs[i + 1][0]) / 2, (abs[i][1] + abs[i + 1][1]) / 2];
              if (dist(m, raw) <= r) {
                const pts = absPoints(el);
                pts.splice(i + 1, 0, raw);
                setEls(E().map((x) => (x.id === el.id ? withAbsPoints(el, pts) : x)));
                drag.current = { kind: 'point', id: el.id, idx: i + 1 };
                return;
              }
            }
          }
        }
        const hit = topHit(raw);
        if (hit) {
          const ids = groupSelect(E(), hit);
          if (e.shiftKey) {
            const cur = { ...a.selectedIds } as Record<string, true>;
            const on = ids.every((i) => cur[i]);
            ids.forEach((i) => (on ? delete cur[i] : (cur[i] = true)));
            setApp({ selectedIds: cur });
          } else if (!a.selectedIds[hit.id]) select(ids);
          const cur0 = E().filter((x) => st.current.app.selectedIds[x.id]);
          const have = new Set(cur0.map((x) => x.id));
          const kids = cur0.filter((x) => x.type === 'frame').flatMap((f) => frameChildren(f, E())).filter((x) => !have.has(x.id) && !x.locked);
          const cur = [...cur0, ...kids.filter((x, i) => kids.findIndex((y) => y.id === x.id) === i)];
          drag.current = { kind: 'move', start: raw, snap: cur, dup: e.altKey, started: false, hit, shift: e.shiftKey };
        } else {
          const base = e.shiftKey ? a.selectedIds : {};
          setApp({ selectedIds: base });
          drag.current = { kind: 'box', start: raw, base };
        }
        return;
      }
      case 'eraser': {
        drag.current = { kind: 'erase', last: raw };
        eraseAt(raw);
        return;
      }
      case 'laser':
        drag.current = { kind: 'laser' };
        misc.current.laser = [[raw[0], raw[1], performance.now()]];
        return;
      case 'text':
      case 'image':
      case 'markdown':
      case 'comment':
        drag.current = { kind: 'textClick', p: raw };
        return;
      default: {
        const type = a.tool;
        const extra: Partial<DrawElement> = {};
        if (type === 'arrow') {
          const t = findBindTarget(E(), raw);
          if (t) extra.startBinding = t.id;
        }
        const base = type === 'freedraw' ? raw : p;
        const isFrame = type === 'frame';
        const style = isFrame ? { ...a.style, strokeColor: '#868e96', backgroundColor: 'transparent', fontSize: 14, fontFamily: 2 as const } : a.style;
        if (isFrame) extra.text = `Frame ${E().filter((x) => x.type === 'frame').length + 1}`;
        const el = newElement(type as any, base[0], base[1], style, extra);
        st.current.elements = isFrame ? [el, ...E()] : [...E(), el];
        setApp({ selectedIds: {} });
        drag.current = { kind: 'create', id: el.id, start: base, sx: e.clientX, sy: e.clientY };
      }
    }
  };

  /* ---------- draw-to-shape ---------- */
  /** Replaces a freehand stroke with the clean shape it resembles. Returns false only for dots and tiny strokes. */
  const recognizeNow = (id: string): boolean => {
    const el = E().find((x) => x.id === id);
    if (!el || el.type !== 'freedraw') return false;
    const rec = recognizeShape(absPoints(el));
    if (!rec) return false;
    const style: Style = { ...A().style, strokeColor: el.strokeColor, strokeWidth: el.strokeWidth, strokeStyle: el.strokeStyle, opacity: el.opacity };
    let n: DrawElement;
    if (rec.kind === 'line' || rec.kind === 'triangle') {
      const base = newElement('line', rec.x, rec.y, style, { arrowType: 'sharp', closed: rec.kind === 'triangle' });
      n = withAbsPoints(base, rec.points!);
    } else {
      n = { ...newElement(rec.kind, rec.x, rec.y, style), width: rec.width, height: rec.height };
    }
    n = { ...n, id: el.id, seed: el.seed, groupIds: el.groupIds };
    st.current.elements = E().map((x) => (x.id === id ? n : x));
    return true;
  };
  const snapStroke = (id: string) => {
    const d = drag.current;
    if (!d || d.kind !== 'create' || d.id !== id) return;
    if (!recognizeNow(id)) return;
    drag.current = null; // the stroke ends here; releasing the pen just keeps the shape
    setApp({ selectedIds: { [id]: true } });
    commit();
  };
  const convertToShape = () => {
    const s = sel().filter((x) => x.type === 'freedraw');
    if (!s.length) return;
    let n = 0;
    for (const x of s) if (recognizeNow(x.id)) n++;
    if (!n) return toast("That stroke is too short to turn into a shape.");
    rerender();
    commit();
  };

  /* ---------- bucket fill ---------- */
  const bucketAt = (p: Pt) => {
    const color = A().style.backgroundColor;
    const fillable = (x: DrawElement) => x.type === 'rectangle' || x.type === 'diamond' || x.type === 'ellipse' || x.type === 'markdown' || (x.type === 'line' && !!x.closed);
    const els = E();
    for (let i = els.length - 1; i >= 0; i--) {
      const x = els[i];
      if (x.locked || !fillable(x)) continue;
      if (hitElement({ ...x, backgroundColor: '#000' }, p, 2)) {
        setEls(els.map((y) => (y.id === x.id ? { ...y, backgroundColor: color, fillStyle: 'solid' } : y)));
        commit();
        return;
      }
    }
    if (color === 'transparent') return toast('Pick a background colour for the bucket first.');
    const res = regionAt(els, p);
    if ('error' in res) {
      toast(res.error === 'open' ? "That area isn't closed. Close the gaps in its outline, or click a shape to fill it directly." : res.error === 'line' ? 'Click inside an area, not on a line.' : 'Nothing to fill here.');
      return;
    }
    const base = newElement('line', 0, 0, { ...A().style, strokeColor: color, backgroundColor: color, fillStyle: 'solid', strokeWidth: 1, roughness: 0, opacity: 100 }, { arrowType: 'sharp', closed: true });
    const fill = withAbsPoints(base, res.points);
    const at = els.findIndex((x) => x.type !== 'frame'); // behind everything but frames
    setEls(at < 0 ? [...els, fill] : [...els.slice(0, at), fill, ...els.slice(at)]);
    commit();
  };

  /* ---------- embeds ---------- */
  const submitEmbed = (url: string) => {
    const dlg = A().embedDialog;
    setApp({ embedDialog: null });
    if (!dlg) return;
    if (dlg.id) {
      setEls(E().map((x) => (x.id === dlg.id ? { ...x, url } : x)));
      commit();
      return;
    }
    const c = misc.current.embedAt ?? viewCenter();
    const el = { ...newElement('embed', c[0] - 320, c[1] - 200, { ...A().style, strokeColor: '#868e96' }), width: 640, height: 400, url };
    setEls([...E(), el]);
    setApp({ selectedIds: { [el.id]: true }, tool: 'selection' });
    commit();
  };
  /** Loads an embed after checking the policy, the limit and (unless the host is trusted) asking the user. */
  const requestLoadEmbed = (id: string) => {
    const el = E().find((x) => x.id === id);
    if (!el || el.type !== 'embed') return;
    const d = decideLoad(el, E(), A().loadedEmbeds, { shared: A().sharedView });
    if (d.action === 'blocked') return toast(d.reason);
    if (d.action === 'limit') return toast(`Unload another page first: at most ${MAX_LOADED_EMBEDS} pages can be loaded at once.`);
    if (d.action === 'focus') return setApp({ activeEmbed: id });
    if (d.action === 'load') return doLoadEmbed(id);
    setApp({ embedConfirm: { id } });
  };
  const doLoadEmbed = (id: string) => {
    const el = E().find((x) => x.id === id);
    if (!el?.url) return setApp({ embedConfirm: null });
    setApp({ loadedEmbeds: { ...A().loadedEmbeds, [id]: el.url }, activeEmbed: id, embedConfirm: null });
  };
  const editEmbed = () => { const s = sel().find((x) => x.type === 'embed'); if (s) setApp({ embedDialog: { id: s.id } }); };
  const unloadEmbed = (id: string) => {
    const rest = { ...A().loadedEmbeds };
    delete rest[id];
    setApp({ loadedEmbeds: rest, activeEmbed: A().activeEmbed === id ? null : A().activeEmbed });
  };

  const eraseAt = (p: Pt) => {
    const tol = 4 / A().zoom;
    const els = E();
    for (let i = els.length - 1; i >= 0; i--) {
      if (!els[i].locked && hitElement(els[i], p, tol)) {
        const g = groupSelect(els, els[i]);
        g.forEach((id) => misc.current.erasing.add(id));
        break;
      }
    }
    rerender();
  };

  const snapAngle = (from: Pt, to: Pt): Pt => {
    const dx = to[0] - from[0], dy = to[1] - from[1];
    const l = Math.hypot(dx, dy);
    const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
    return [from[0] + Math.cos(ang) * l, from[1] + Math.sin(ang) * l];
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const a = A();
    const raw = toScene(e);
    misc.current.pointer = raw;
    const d = drag.current;
    const cv = overlayRef.current!;
    if (!d) {
      if (misc.current.multi) {
        const el = E().find((x) => x.id === misc.current.multi);
        if (el) {
          let p: Pt = [snapV(raw[0]), snapV(raw[1])];
          const abs = absPoints(el);
          if (e.shiftKey) p = snapAngle(abs[abs.length - 2], p);
          abs[abs.length - 1] = p;
          st.current.elements = E().map((x) => (x.id === el.id ? withAbsPoints(el, abs) : x));
          misc.current.hoverBind = el.type === 'arrow' ? findBindTarget(E(), p, el.id) : null;
          rerender();
        }
        return;
      }
      if (a.tool === 'selection' && !a.editing) {
        const { box, singleLinear, s } = selBoxInfo();
        let cur = 'default';
        const h = box && !singleLinear ? hitHandle(box, raw, a.zoom, false) : null;
        if (h) cur = cursorFor(h)!;
        else if (singleLinear && absPoints(s[0]).some((q) => dist(q, raw) < 9 / a.zoom)) cur = 'pointer';
        else if (topHit(raw)) cur = 'move';
        cv.style.cursor = cur;
      }
      return;
    }
    switch (d.kind) {
      case 'pan':
        setApp({ scrollX: d.scrollX + (e.clientX - d.sx) / a.zoom, scrollY: d.scrollY + (e.clientY - d.sy) / a.zoom });
        break;
      case 'move': {
        let dx = raw[0] - d.start[0], dy = raw[1] - d.start[1];
        if (!d.started) {
          if (Math.hypot(dx, dy) * a.zoom < 3) return;
          d.started = true;
          if (d.dup || e.altKey) {
            const c = cloneElements(d.snap, 0, 0);
            st.current.elements = [...E(), ...c];
            d.snap = c;
            st.current.app = { ...a, selectedIds: Object.fromEntries(c.map((x) => [x.id, true])) as Record<string, true> };
          } else {
            // unbind arrows moved without their targets
            const ids = new Set(d.snap.map((x) => x.id));
            st.current.elements = E().map((x) =>
              x.type === 'arrow' && d.snap.some((s) => s.id === x.id) && ((x.startBinding && !ids.has(x.startBinding)) || (x.endBinding && !ids.has(x.endBinding)))
                ? { ...x, startBinding: x.startBinding && ids.has(x.startBinding) ? x.startBinding : null, endBinding: x.endBinding && ids.has(x.endBinding) ? x.endBinding : null }
                : x);
          }
        }
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        if (a.grid && d.snap[0]) {
          dx = Math.round((d.snap[0].x + dx) / GRID) * GRID - d.snap[0].x;
          dy = Math.round((d.snap[0].y + dy) / GRID) * GRID - d.snap[0].y;
        }
        const m = new Map(d.snap.map((x) => [x.id, x]));
        st.current.elements = E().map((x) => (m.has(x.id) ? moveEls(m.get(x.id)!, dx, dy) : x));
        st.current.elements = updateBoundArrows(st.current.elements, new Set(m.keys()));
        rerender();
        break;
      }
      case 'box': {
        const b = { x1: Math.min(d.start[0], raw[0]), y1: Math.min(d.start[1], raw[1]), x2: Math.max(d.start[0], raw[0]), y2: Math.max(d.start[1], raw[1]) };
        misc.current.boxSel = b;
        const ids = { ...d.base } as Record<string, true>;
        for (const el of E()) {
          if (el.locked) continue;
          const [x1, y1, x2, y2] = elAABB(el);
          if (x1 >= b.x1 && y1 >= b.y1 && x2 <= b.x2 && y2 <= b.y2) groupSelect(E(), el).forEach((i) => (ids[i] = true));
        }
        setApp({ selectedIds: ids });
        break;
      }
      case 'erase': {
        const n = Math.ceil(dist(d.last, raw) * a.zoom / 4);
        for (let i = 1; i <= n; i++) eraseAt([d.last[0] + ((raw[0] - d.last[0]) * i) / n, d.last[1] + ((raw[1] - d.last[1]) * i) / n]);
        d.last = raw;
        break;
      }
      case 'laser':
        misc.current.laser.push([raw[0], raw[1], performance.now()]);
        runLaser();
        break;
      case 'rotate': {
        const ang = Math.atan2(raw[1] - d.center[1], raw[0] - d.center[0]);
        let delta = ang - d.startAngle;
        if (e.shiftKey) {
          const base = d.snap.length === 1 ? d.snap[0].angle : 0;
          delta = Math.round((base + delta) / (Math.PI / 12)) * (Math.PI / 12) - base;
        }
        const m = new Map(d.snap.map((x) => [x.id, x]));
        st.current.elements = E().map((x) => {
          const o = m.get(x.id);
          if (!o) return x;
          const c = elCenter(o);
          const nc = d.snap.length > 1 ? rotatePt(c, d.center, delta) : c;
          return { ...moveEls(o, nc[0] - c[0], nc[1] - c[1]), angle: (((o.angle + delta) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) };
        });
        st.current.elements = updateBoundArrows(st.current.elements, new Set(m.keys()));
        rerender();
        break;
      }
      case 'resize':
        doResize(d, raw, e.shiftKey, e.altKey);
        break;
      case 'point': {
        const el = E().find((x) => x.id === d.id);
        if (!el) break;
        const c = elCenter(el);
        let p: Pt = el.angle ? rotatePt(raw, c, -el.angle) : raw;
        p = [snapV(p[0]), snapV(p[1])];
        const abs = absPoints(el);
        if (e.shiftKey && abs.length > 1) p = snapAngle(abs[d.idx === 0 ? 1 : d.idx - 1], p);
        abs[d.idx] = p;
        st.current.elements = E().map((x) => (x.id === d.id ? withAbsPoints(el, abs) : x));
        misc.current.hoverBind = el.type === 'arrow' && (d.idx === 0 || d.idx === abs.length - 1) ? findBindTarget(E(), p, el.id) : null;
        rerender();
        break;
      }
      case 'create': {
        const el = E().find((x) => x.id === d.id);
        if (!el) break;
        let p: Pt = el.type === 'freedraw' ? raw : [snapV(raw[0]), snapV(raw[1])];
        let upd: DrawElement = el;
        if (el.type === 'freedraw') {
          upd = { ...el, points: [...el.points, [p[0] - el.x, p[1] - el.y]] };
          const xs = upd.points.map((q) => q[0]), ys = upd.points.map((q) => q[1]);
          upd.width = Math.max(...xs) - Math.min(...xs); upd.height = Math.max(...ys) - Math.min(...ys);
          // pause at the end of a stroke to snap it to a clean shape
          clearTimeout(misc.current.holdT);
          if (A().shapeAssist) misc.current.holdT = window.setTimeout(() => snapStroke(d.id), 550);
        } else if (isLinear(el)) {
          if (e.shiftKey) p = snapAngle(d.start, p);
          upd = withAbsPoints(el, [d.start, p]);
          misc.current.hoverBind = el.type === 'arrow' ? findBindTarget(E(), p, el.id) : null;
        } else {
          let dx = p[0] - d.start[0], dy = p[1] - d.start[1];
          if (e.shiftKey) { const m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
          let x1 = d.start[0], y1 = d.start[1];
          const x2 = x1 + dx, y2 = y1 + dy;
          if (e.altKey) { x1 = d.start[0] - dx; y1 = d.start[1] - dy; }
          upd = { ...el, x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
        }
        st.current.elements = E().map((x) => (x.id === d.id ? upd : x));
        rerender();
        break;
      }
    }
  };

  const doResize = (d: Extract<Drag, { kind: 'resize' }>, raw: Pt, shift: boolean, alt: boolean) => {
    const h = d.handle;
    const single = d.snap.length === 1 ? d.snap[0] : null;
    const { x1, y1, x2, y2 } = d.box;
    const corner = h.length === 2;
    const c0: Pt = [(x1 + x2) / 2, (y1 + y2) / 2];
    const q = single && single.angle ? rotatePt(raw, c0, -single.angle) : raw;
    let nx1 = x1, ny1 = y1, nx2 = x2, ny2 = y2;
    if (h.includes('w')) nx1 = q[0];
    if (h.includes('e')) nx2 = q[0];
    if (h.includes('n')) ny1 = q[1];
    if (h.includes('s')) ny2 = q[1];
    if (alt) {
      if (h.includes('w')) nx2 = x1 + x2 - nx1;
      if (h.includes('e')) nx1 = x1 + x2 - nx2;
      if (h.includes('n')) ny2 = y1 + y2 - ny1;
      if (h.includes('s')) ny1 = y1 + y2 - ny2;
    }
    const keep = corner && (shift || (single && (single.type === 'image' || single.type === 'text')));
    if (keep && x2 > x1 && y2 > y1) {
      const ratio = (x2 - x1) / (y2 - y1);
      const w = nx2 - nx1, hh = ny2 - ny1;
      const s = Math.max(Math.abs(w) / (x2 - x1), Math.abs(hh) / (y2 - y1));
      const nw = Math.sign(w || 1) * s * (x2 - x1), nh = Math.sign(hh || 1) * (s * (x2 - x1)) / ratio;
      if (h.includes('w')) nx1 = nx2 - nw; else nx2 = nx1 + nw;
      if (h.includes('n')) ny1 = ny2 - nh; else ny2 = ny1 + nh;
      if (alt) { nx1 = c0[0] - nw / 2; nx2 = c0[0] + nw / 2; ny1 = c0[1] - nh / 2; ny2 = c0[1] + nh / 2; }
    }
    const sx = (nx2 - nx1) / (x2 - x1 || 1), sy = (ny2 - ny1) / (y2 - y1 || 1);
    if (Math.abs(nx2 - nx1) < 2 || Math.abs(ny2 - ny1) < 2) { if (!single || single.type !== 'text') return; }
    const m = new Map(d.snap.map((x) => [x.id, x]));
    st.current.elements = E().map((el) => {
      const o = m.get(el.id);
      if (!o) return el;
      if (single) {
        const lc: Pt = [(nx1 + nx2) / 2, (ny1 + ny2) / 2];
        const tc = single.angle ? rotatePt(lc, c0, single.angle) : lc;
        if (isPoints(o)) {
          const abs = absPoints(o).map(([px, py]) => [nx1 + (px - x1) * sx + (tc[0] - lc[0]), ny1 + (py - y1) * sy + (tc[1] - lc[1])] as Pt);
          return withAbsPoints(o, abs);
        }
        if (o.type === 'text') {
          const fs = clamp(Math.round(o.fontSize * Math.abs(sy)), 6, 400);
          const t = fitText({ ...o, fontSize: fs });
          return { ...t, x: tc[0] - t.width / 2, y: tc[1] - t.height / 2 };
        }
        if (o.type === 'markdown') {
          const w = Math.max(160, Math.abs(nx2 - nx1));
          const f = fitMarkdown({ ...o, width: w });
          return { ...f, x: h.includes('w') ? o.x + o.width - w : o.x, y: h.includes('n') ? o.y + o.height - f.height : o.y };
        }
        const w = Math.abs(nx2 - nx1), hh = Math.abs(ny2 - ny1);
        return { ...o, width: w, height: hh, x: tc[0] - w / 2, y: tc[1] - hh / 2 };
      }
      const [bx1, by1, bx2, by2] = elBounds(o);
      const mx = (v: number) => nx1 + (v - x1) * sx, my = (v: number) => ny1 + (v - y1) * sy;
      if (isPoints(o)) return withAbsPoints(o, absPoints(o).map(([px, py]) => [mx(px), my(py)] as Pt));
      const ax = mx(bx1), bx = mx(bx2), ay = my(by1), by = my(by2);
      if (o.type === 'markdown') {
        const f = fitMarkdown({ ...o, width: Math.max(160, Math.abs(bx - ax)) });
        return { ...f, x: Math.min(ax, bx), y: Math.min(ay, by) };
      }
      if (o.type === 'text') {
        const fs = clamp(Math.round(o.fontSize * Math.abs(sy)), 6, 400);
        const t = fitText({ ...o, fontSize: fs });
        return { ...t, x: Math.min(ax, bx), y: Math.min(ay, by) };
      }
      return { ...o, x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
    });
    st.current.elements = updateBoundArrows(st.current.elements, new Set(m.keys()));
    rerender();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    clearTimeout(misc.current.holdT);
    const d = drag.current;
    drag.current = null;
    const a = A();
    misc.current.boxSel = null;
    if (!d) return;
    switch (d.kind) {
      case 'move':
        if (d.started) commit();
        else if (d.hit?.type === 'comment') setApp({ activeComment: d.hit.id });
        else if (!d.shift && Object.keys(a.selectedIds).length > 1 && d.hit) select(groupSelect(E(), d.hit));
        break;
      case 'box': rerender(); commit(); break;
      case 'resize': case 'rotate': commit(); break;
      case 'point': {
        const el = E().find((x) => x.id === d.id);
        if (el && el.type === 'arrow') {
          const n = el.points.length - 1;
          let n2 = el;
          const abs = absPoints(el);
          if (d.idx === 0) { const t = findBindTarget(E(), abs[0], el.id); n2 = { ...n2, startBinding: t?.id ?? null }; }
          if (d.idx === n) { const t = findBindTarget(E(), abs[n], el.id); n2 = { ...n2, endBinding: t?.id ?? null }; }
          st.current.elements = E().map((x) => (x.id === el.id ? n2 : x));
          st.current.elements = updateBoundArrows(st.current.elements, new Set([n2.startBinding, n2.endBinding].filter(Boolean) as string[]));
        }
        misc.current.hoverBind = null;
        commit();
        break;
      }
      case 'erase': {
        const ids = Object.fromEntries([...misc.current.erasing].map((i) => [i, true])) as Record<string, true>;
        misc.current.erasing = new Set();
        if (Object.keys(ids).length) deleteIds(ids); else rerender();
        break;
      }
      case 'textClick': {
        if (a.tool === 'comment') {
          const hitC = topHit(d.p);
          if (hitC && hitC.type === 'comment') { setApp({ activeComment: hitC.id }); break; }
          const c = newElement('comment', d.p[0], d.p[1], a.style, { thread: [] });
          st.current.elements = [...E(), c];
          setApp({ activeComment: c.id, selectedIds: {} });
          break;
        }
        if (a.tool === 'image') { misc.current.imageAt = d.p; imgPick.open(); break; }
        const hit = topHit(d.p);
        if (hit && (hit.type === 'text' || hit.type === 'markdown')) { startEdit(hit, false); break; }
        if (a.tool === 'markdown') {
          const md = newElement('markdown', snapV(d.p[0]), snapV(d.p[1]), { ...a.style, fontSize: 18, fontFamily: 2 }, { text: '', width: 440, height: 80 });
          startEdit(md, true);
          break;
        }
        const el = fitText(newElement('text', snapV(d.p[0]), snapV(d.p[1]), a.style, { text: ' ' }));
        startEdit({ ...el, text: '' }, true);
        break;
      }
      case 'create': {
        const el = E().find((x) => x.id === d.id);
        if (!el) break;
        const moved = Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
        if (el.type === 'freedraw') {
          let n = el;
          if (el.points.length < 2) n = { ...el, points: [[0, 0], [0.01, 0.01]] };
          st.current.elements = E().map((x) => (x.id === el.id ? n : x));
          st.current.app = { ...a, selectedIds: {} };
          commit();
          break;
        }
        if (isLinear(el)) {
          if (moved < 4) {
            if (el.type === 'arrow' && el.startBinding) { /* click on shape, keep start bound */ }
            misc.current.multi = el.id;
            st.current.elements = E().map((x) => (x.id === el.id ? withAbsPoints(el, [[d.start[0], d.start[1]], [d.start[0], d.start[1]]]) : x));
            rerender();
            break;
          }
          let n = el;
          if (el.type === 'arrow') {
            const end = absPoints(el).slice(-1)[0];
            const t = findBindTarget(E(), end, el.id);
            n = { ...el, endBinding: t?.id ?? null };
          }
          st.current.elements = E().map((x) => (x.id === el.id ? n : x));
          st.current.elements = updateBoundArrows(st.current.elements, new Set([n.startBinding, n.endBinding].filter(Boolean) as string[]));
        } else if (moved < 3 || (el.width < 2 && el.height < 2)) {
          st.current.elements = E().filter((x) => x.id !== el.id);
          rerender();
          break;
        }
        misc.current.hoverBind = null;
        st.current.app = { ...a, selectedIds: { [el.id]: true }, tool: a.toolLocked ? a.tool : 'selection' };
        commit();
        break;
      }
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (misc.current.multi) { finishMulti(false); return; }
    const a = A();
    if (a.tool !== 'selection') return;
    const p = toScene(e);
    const hit = topHit(p);
    if (hit) {
      if (hit.type === 'embed') { requestLoadEmbed(hit.id); return; }
      if (hit.type === 'text' || hit.type === 'markdown' || canHaveLabel(hit)) startEdit(hit, false);
      return;
    }
    const el = newElement('text', snapV(p[0]), snapV(p[1]), a.style, { text: '' });
    startEdit(el, true);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const p = toScene(e);
    const hit = topHit(p);
    if (hit && !A().selectedIds[hit.id]) select(groupSelect(E(), hit));
    else if (!hit) setApp({ selectedIds: {} });
    const { clientX: cx, clientY: cy } = e;
    ctxMenu.open({ anchor: { getBoundingClientRect: () => ({ x: cx, y: cy, width: 0, height: 0 }) } as any });
  };

  /* ---------- laser animation ---------- */
  const runLaser = () => {
    if (misc.current.raf) return;
    const tick = () => {
      misc.current.laser = misc.current.laser.filter((p) => performance.now() - p[2] < 900);
      drawOverlay();
      misc.current.raf = misc.current.laser.length ? requestAnimationFrame(tick) : 0;
    };
    misc.current.raf = requestAnimationFrame(tick);
  };

  /* ---------- drawing ---------- */
  const drawScene = () => {
    const c = sceneRef.current;
    if (!c) return;
    const a = A();
    const dpr = window.devicePixelRatio || 1;
    renderScene(c, E(), {
      scrollX: a.scrollX, scrollY: a.scrollY, zoom: a.zoom, width: a.width, height: a.height, dpr, bg: a.viewBg, grid: a.grid,
      erasing: misc.current.erasing, hideId: a.editing && !a.editing.isNew ? a.editing.id : null, onImageLoad: () => drawScene(),
    });
  };
  const drawOverlay = () => {
    const c = overlayRef.current;
    if (!c) return;
    renderOverlay(c, {
      app: A(), selected: sel(), elements: E(), boxSel: misc.current.boxSel, hoverBind: misc.current.hoverBind,
      highlight: misc.current.hl, laser: misc.current.laser, dpr: window.devicePixelRatio || 1,
    });
  };
  useEffect(() => { drawScene(); drawOverlay(); });
  // a pending load confirmation must not outlive its embed (deleted, undone, project switched)
  useEffect(() => { const c = A().embedConfirm; if (c && !E().some((x) => x.id === c.id && x.url)) setApp({ embedConfirm: null }); });

  /* ---------- global effects ---------- */
  useEffect(() => {
    // load
    try {
      const legacy = migrateLegacy();
      loadProject(ensureCurrent());
      if (legacy === 'migrated') toast('Your drawing from an older version was recovered. You can find it in Projects.');
      if (legacy === 'failed') toast('A drawing saved by an older version could not be moved because browser storage is full. Free some space and reload to recover it.');
      st.current.app = { ...st.current.app, shapeAssist: localStorage.getItem('draw:shapeAssist') !== '0', theme: localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light' };
      const lib = localStorage.getItem(LIBKEY);
      if (lib) {
        const raw = JSON.parse(lib) as any[];
        misc.current.lib = raw.map((it, i) => (Array.isArray(it) ? { id: uid(), name: `Item ${raw.length - i}`, elements: it } : it));
        setLibraryState(misc.current.lib);
      }
      if (location.hash.startsWith('#v=')) {
        decodeScene(location.hash.slice(3)).then((d) => {
          const els = ((d.elements || []) as any[]).map((r) => normalizeImported(r, DEFAULT_STYLE)).filter(Boolean) as DrawElement[];
          misc.current.shared = { elements: els, viewBg: d.viewBg || '#ffffff' };
          misc.current.projectId = '';
          st.current.elements = els;
          st.current.hist = { stack: [{ elements: els, sel: {} }], idx: 0 };
          setApp({ viewOnly: true, sharedView: true, tool: 'hand', viewBg: d.viewBg || '#ffffff', projectName: 'Shared drawing' });
          setTimeout(() => zoomToElements(els), 50);
        }).catch(() => {
          history.replaceState(null, '', location.pathname);
          toast('This share link is invalid, damaged or too large to open.');
        });
      }
    } catch {}
    const resize = () => setApp({ width: window.innerWidth, height: window.innerHeight });
    resize();
    window.addEventListener('resize', resize);
    // Web-font faces (latin-ext, cyrillic, ...) load lazily on first use; re-measure text and redraw whenever one arrives.
    const refit = () => {
      clearMarkdownCache();
      // History snapshots share element objects, so each element is re-measured once (memo) and only objects whose
      // size actually changed are replaced. Snapshots get the same treatment so undo doesn't bring back sizes
      // measured with the fallback font.
      const memo = new Map<DrawElement, DrawElement>();
      const refitOne = (el: DrawElement): DrawElement => {
        if (el.type !== 'text' && el.type !== 'markdown') return el;
        let n = memo.get(el);
        if (!n) {
          const m = el.type === 'text' ? fitText(el) : fitMarkdown(el);
          n = m.width === el.width && m.height === el.height ? el : m;
          memo.set(el, n);
        }
        return n;
      };
      const fix = (list: DrawElement[]) => {
        const out = list.map(refitOne);
        return out.some((el, i) => el !== list[i]) ? out : list;
      };
      const h = st.current.hist;
      const cur = st.current.elements;
      const next = fix(cur);
      h.stack = h.stack.map((snap) => {
        const els = snap.elements === cur ? next : fix(snap.elements);
        return els === snap.elements ? snap : { ...snap, elements: els };
      });
      st.current.elements = next;
      rerender();
    };
    document.fonts?.load("24px Caveat").then(refit).catch(() => {});
    document.fonts?.ready.then(refit).catch(() => {});
    document.fonts?.addEventListener('loadingdone', refit);

    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const a = A();
      if (isTyping(e.target)) return;
      if (a.presenting || a.mermaidOpen) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f' && !(a.exportOpen || a.helpOpen || a.projectsOpen || a.confirmClear || a.confirmDiscard || a.embedDialog || a.embedConfirm)) { e.preventDefault(); openSidebar('search'); return; }
      if (a.viewOnly) {
        if (e.key === 'Escape') { if (!a.sharedView) setApp({ viewOnly: false, tool: 'selection' }); }
        else if (e.key === '+' || e.key === '=') zoomAt(a.zoom * 1.1);
        else if (e.key === '-' || e.key === '_') zoomAt(a.zoom / 1.1);
        else if (e.shiftKey && e.key === '!') zoomToElements(E(), 1);
        else if (e.altKey && e.key.toLowerCase() === 'p') setApp({ presenting: true });
        return;
      }
      if (a.exportOpen || a.helpOpen || a.projectsOpen || a.confirmClear || a.confirmDiscard || a.embedDialog || a.embedConfirm) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.key === ' ' ) { misc.current.space = true; e.preventDefault(); if (overlayRef.current) overlayRef.current.style.cursor = 'grab'; return; }
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); redo(); return; }
      if (mod && k === 'a') { e.preventDefault(); selectAll(); return; }
      if (mod && k === 'd') { e.preventDefault(); duplicate(); return; }
      if (mod && k === 'g') { e.preventDefault(); if (e.shiftKey) ungroup(); else group(); return; }
      if (mod && k === 's') { e.preventDefault(); saveFile(); return; }
      if (mod && k === 'o') { e.preventDefault(); filePick.open(); return; }
      if (mod && e.shiftKey && k === 'e') { e.preventDefault(); setApp({ exportOpen: true }); return; }
      if (mod && e.shiftKey && k === 'l') { e.preventDefault(); toggleLock(); return; }
      if (mod && k === "'") { e.preventDefault(); setApp({ grid: !a.grid }); return; }
      if (mod && e.shiftKey && k === ']' || mod && e.shiftKey && e.key === '}') { e.preventDefault(); layer('front'); return; }
      if (mod && e.shiftKey && k === '[' || mod && e.shiftKey && e.key === '{') { e.preventDefault(); layer('back'); return; }
      if (mod && k === ']') { e.preventDefault(); layer('forward'); return; }
      if (mod && k === '[') { e.preventDefault(); layer('backward'); return; }
      if (mod && e.altKey && k === 'c') { e.preventDefault(); copyStyle(); return; }
      if (mod && e.altKey && k === 'v') { e.preventDefault(); pasteStyle(); return; }
      if (e.shiftKey && e.altKey && k === 'c') { e.preventDefault(); copyPNG(); return; }
      if (e.shiftKey && e.altKey && k === 'd') { e.preventDefault(); setApp({ theme: a.theme === 'dark' ? 'light' : 'dark' }); return; }
      if (e.altKey && k === 'p') { e.preventDefault(); setApp({ presenting: true }); return; }
      if (e.altKey && k === 'z') { e.preventDefault(); setApp({ zen: !a.zen }); return; }
      if (mod) return;
      if (e.key === 'Escape') {
        if (misc.current.multi) return finishMulti(true);
        if (a.exportOpen || a.helpOpen || a.projectsOpen || a.confirmClear || a.contextMenu || a.menuOpen) return setApp({ exportOpen: false, helpOpen: false, projectsOpen: false, confirmClear: false, contextMenu: null, menuOpen: false });
        return setApp({ selectedIds: {}, tool: 'selection' });
      }
      if (e.key === 'Enter') { if (misc.current.multi) return finishMulti(true); return editSelected(); }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return deleteSelected(); }
      if (e.key === '?') return setApp({ helpOpen: true });
      if (e.key.startsWith('Arrow') && Object.keys(a.selectedIds).length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : a.grid ? GRID : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const ids = a.selectedIds;
        setEls(E().map((x) => (ids[x.id] ? moveEls(x, dx, dy) : x)));
        afterMove(new Set(Object.keys(ids)));
        commit();
        return;
      }
      if (e.shiftKey && k === 'h') return flip('h');
      if (e.shiftKey && k === 'v') return flip('v');
      if (e.shiftKey && e.key === '!') return zoomToElements(E(), 1);
      if (e.shiftKey && e.key === '@') return zoomToElements(sel(), 30);
      if (e.shiftKey && e.key === ')') return setApp({ zoom: 1 });
      if (e.key === '+' || e.key === '=') return zoomAt(a.zoom * 1.1);
      if (e.key === '-' || e.key === '_') return zoomAt(a.zoom / 1.1);
      if (k === 'q' && !e.shiftKey) return setApp({ toolLocked: !a.toolLocked });
      if (!e.shiftKey && TOOL_KEYS[k]) setTool(TOOL_KEYS[k]);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') { misc.current.space = false; if (overlayRef.current) overlayRef.current.style.cursor = ''; }
    };
    const onCopy = (e: ClipboardEvent) => { if (!isTyping(e.target)) copySelected(e); };
    const onCut = (e: ClipboardEvent) => { if (!isTyping(e.target) && sel().length) { copySelected(e); deleteSelected(); } };
    const onPaste = async (e: ClipboardEvent) => {
      if (isTyping(e.target) || A().viewOnly) return;
      e.preventDefault();
      const items = Array.from(e.clipboardData?.items || []);
      const img = items.find((i) => i.type.startsWith('image/'));
      if (img) { const f = img.getAsFile(); if (f) return void insertImageFile(f, misc.current.pointer); }
      const text = e.clipboardData?.getData('text/plain') || '';
      if (text) {
        try {
          const d = JSON.parse(text);
          if (d?.type === 'draw/clipboard') return pasteElements(d.elements);
          if (d?.type === 'excalidraw/clipboard' && Array.isArray(d.elements)) {
            return pasteElements(importInterchange(d).elements);
          }
        } catch {}
        return insertText(text);
      }
      if (misc.current.clip.length) pasteElements(misc.current.clip);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const a = A();
      if (e.ctrlKey || e.metaKey) zoomAt(a.zoom * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
      else if (e.shiftKey) setApp({ scrollX: a.scrollX - (e.deltaY || e.deltaX) / a.zoom });
      else setApp({ scrollX: a.scrollX - e.deltaX / a.zoom, scrollY: a.scrollY - e.deltaY / a.zoom });
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      if (f.type.startsWith('image/')) insertImageFile(f, toScene(e));
      else openFile(f);
    };
    const ov = overlayRef.current!;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCut);
    window.addEventListener('paste', onPaste);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    ov.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('resize', resize);
      document.fonts?.removeEventListener('loadingdone', refit);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('cut', onCut);
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      ov.removeEventListener('wheel', onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { document.documentElement.dataset.theme = st.current.app.theme; });
  // autosave
  const app = st.current.app;
  const elements = st.current.elements;
  // saveNow/writeLinked are recreated every render but only read refs, so they are deliberately not dependencies
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    clearTimeout(misc.current.saveT);
    misc.current.saveT = window.setTimeout(() => { if (!misc.current.shared) saveNow(); writeLinked(); }, 400);
    try { localStorage.setItem(THEME_KEY, app.theme); } catch {}
  }, [elements, app.viewBg, app.grid, app.theme, app.scrollX, app.scrollY, app.zoom]);
  /* eslint-enable react-hooks/exhaustive-deps */

  /* ---------- render ---------- */
  const selected = useMemo(() => elements.filter((e) => app.selectedIds[e.id]), [elements, app.selectedIds]);
  const searchOpen = app.showLibrary && !app.zen && app.sidebarTab === 'search';
  const searchHits: SearchHit[] = useMemo(() => (searchOpen ? searchElements(elements, app.search) : []), [searchOpen, elements, app.search]);
  misc.current.hl = { ids: searchHits.map((h) => h.id), cur: searchHits[Math.min(app.searchIdx, searchHits.length - 1)]?.id ?? null };
  const dark = app.theme === 'dark';
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const baseCursor = app.tool === 'hand' ? 'grab' : app.tool === 'selection' ? undefined : app.tool === 'eraser' ? 'cell' : (app.tool === 'text' || app.tool === 'markdown') ? 'text' : 'crosshair';
  const editingEl = app.editing ? (app.editing.isNew ? misc.current.pending : elements.find((e) => e.id === app.editing!.id)) : null;
  const canUndo = st.current.hist.idx > 0, canRedo = st.current.hist.idx < st.current.hist.stack.length - 1;
  const showProps = !app.zen && !app.viewOnly && (selected.length > 0 || !['selection', 'eraser', 'hand', 'laser', 'image', 'comment'].includes(app.tool));

  const actions = {
    setApp, setTool, applyStyle, undo, redo, canUndo, canRedo, duplicate, deleteSelected, layer, group, ungroup, toggleLock,
    align, distribute, flip, zoomAt, zoomToElements: () => zoomToElements(E(), 1), resetZoom: () => setApp({ zoom: 1 }),
    saveFile, exportJsonFile, exportMarkdownFile, switchProject, newProject, removeProject, saveNow, refreshName, openFile: () => filePick.open(), clearCanvas, copyStyle, pasteStyle, addToLibrary, selectAll,
    copy: () => copySelected(), cut: async () => { await copySelected(); deleteSelected(); },
    paste: async () => {
      try { const t = await navigator.clipboard.readText(); try { const d = JSON.parse(t); if (d?.type === 'draw/clipboard') return pasteElements(d.elements); } catch {} if (t) return insertText(t); } catch {}
      if (misc.current.clip.length) pasteElements(misc.current.clip);
    },
    copyPNG, insertLibrary: (it: LibItem) => addElements(it.elements, viewCenter()),
    deleteLibrary: (id: string) => setLibrary(misc.current.lib.filter((x) => x.id !== id)),
    renameLibrary: (id: string, name: string) => setLibrary(misc.current.lib.map((x) => (x.id === id ? { ...x, name: name.trim() || x.name } : x))),
    exportLibrary: () => download(new Blob([JSON.stringify({ type: 'draw-library', version: 1, items: misc.current.lib }, null, 2)], { type: 'application/json' }), 'library.json'),
    importLibrary: async (f: File) => {
      try {
        const d = JSON.parse(await f.text());
        const items = (d.items || d.library || []) as any[];
        const conv: LibItem[] = items.map((it, i) => (Array.isArray(it) ? { id: uid(), name: `Imported ${i + 1}`, elements: it } : { id: uid(), name: it.name || `Imported ${i + 1}`, elements: it.elements || [] }))
          .map((it) => ({ ...it, elements: it.elements.map((r: any) => normalizeImported(r, DEFAULT_STYLE)).filter(Boolean) as DrawElement[] }))
          .filter((it) => it.elements.length);
        if (!conv.length) throw new Error('empty');
        setLibrary([...conv, ...misc.current.lib]);
      } catch { toast('Could not read this library file.'); }
    },
    insertMermaid: (els: DrawElement[]) => addElements(els, viewCenter()),
    copyShareLink, editCopy, linkSaveFile, linkOpenFile, unlinkFile, convertToShape, editEmbed, unloadEmbed, requestLoadEmbed, openSidebar, setSearch, goToSearch, openComment,
    toggleShapeAssist: () => { const on = !A().shapeAssist; setApp({ shapeAssist: on }); try { localStorage.setItem('draw:shapeAssist', on ? '1' : '0'); } catch {} },
    addComment: (id: string, text: string) => { setEls(E().map((e) => (e.id === id ? { ...e, thread: [...(e.thread || []), { text, at: Date.now() }] } : e))); commit(); },
    toggleResolve: (id: string) => { setEls(E().map((e) => (e.id === id ? { ...e, resolved: !e.resolved } : e))); commit(); setApp({ activeComment: null }); },
    deleteComment: (id: string) => { setApp({ activeComment: null }); deleteIds({ [id]: true }); },
    closeComment: () => {
      const id = A().activeComment;
      const c = E().find((e) => e.id === id);
      if (c && !(c.thread || []).length) { setApp({ activeComment: null }); deleteIds({ [c.id]: true }); } else { setApp({ activeComment: null }); commit(); }
    },
  };

  return (
    <div className="app" data-theme={app.theme}>
      <div className="canvas-wrap" style={{ filter: dark ? DARK_FILTER : undefined }}>
        <canvas ref={sceneRef} width={app.width * dpr} height={app.height * dpr} style={{ width: app.width, height: app.height }} />
      </div>
      <EmbedLayer app={app} elements={elements} actions={actions} />
      <canvas
        ref={overlayRef} className="overlay" width={app.width * dpr} height={app.height * dpr}
        style={{ width: app.width, height: app.height, cursor: misc.current.space ? 'grab' : baseCursor }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick} onContextMenu={onContextMenu}
      />
      {editingEl && app.editing && (
        <TextEditor key={app.editing.id} el={editingEl} app={app} dark={dark} onCommit={commitText} />
      )}
      {!app.zen && (
        <>
          <MainMenu app={app} actions={actions} />
          {!app.viewOnly && <Toolbar app={app} actions={actions} />}
          <BottomLeft app={app} actions={actions} />
          <Button className="lib-btn" aria-expanded={app.showLibrary} onClick={() => setApp({ showLibrary: !app.showLibrary })}>Sidebar</Button>
        </>
      )}
      {showProps && <PropertiesPanel app={app} selected={selected} actions={actions} />}
      {app.showLibrary && !app.zen && <Sidebar app={app} elements={elements} library={library} hits={searchHits} actions={actions} />}
      {elements.length === 0 && !app.editing && app.tool === 'selection' && (
        <div className="welcome">
          <div className="welcome-logo">draw</div>
          <p>All your data is saved locally in your browser.</p>
          <p className="hint">Pick a tool &amp; start drawing! &nbsp;·&nbsp; Press <kbd>?</kbd> for shortcuts</p>
        </div>
      )}
      {app.viewOnly && (
        <div className="view-badge" role="status">
          <span>{app.sharedView ? 'Shared drawing · view only' : 'View only'}</span>
          <Button className="btn" style={{ padding: '0 12px', height: 30 }} onClick={() => setApp({ presenting: true })}>Present</Button>
          {app.sharedView ? (
            <Button className="btn primary" style={{ padding: '0 12px', height: 30 }} onClick={actions.editCopy}>Edit a copy</Button>
          ) : (
            <Button className="btn primary" style={{ padding: '0 12px', height: 30 }} onClick={() => setApp({ viewOnly: false, tool: 'selection' })}>Exit view mode</Button>
          )}
        </div>
      )}
      {app.presenting && <Presenter app={app} elements={elements} onClose={() => setApp({ presenting: false })} />}
      {app.embedDialog && (() => { const cur = app.embedDialog.id ? elements.find((x) => x.id === app.embedDialog!.id) : null; return <EmbedDialog initial={cur?.url ?? ''} onSubmit={submitEmbed} onClose={() => setApp({ embedDialog: null })} />; })()}
      {app.embedConfirm && (() => { const c = elements.find((x) => x.id === app.embedConfirm!.id); return c?.url ? <EmbedConfirm url={embedTarget(c.url)} shared={app.sharedView} onClose={() => setApp({ embedConfirm: null })} onLoad={(remember) => { if (remember) trustHost(hostOf(embedTarget(c.url!))); doLoadEmbed(c.id); }} /> : null; })()}
      {app.mermaidOpen && <MermaidDialog app={app} actions={actions} onClose={() => setApp({ mermaidOpen: false })} />}
      {app.activeComment && (() => { const c = elements.find((x) => x.id === app.activeComment); return c ? <CommentPopover key={c.id} el={c} app={app} actions={actions} /> : null; })()}
      <ToastRegion className="toast-region">{() => <Toast className="toast"><ToastTitle /></Toast>}</ToastRegion>
      {app.zen && <Button className="zen-exit" onClick={() => setApp({ zen: false })}>Exit zen mode</Button>}
      <ContextMenu controller={ctxMenu} app={app} selected={selected} actions={actions} />
      {app.exportOpen && <ExportDialog app={app} elements={elements} selected={selected} onClose={() => setApp({ exportOpen: false })} />}
      {app.projectsOpen && <ProjectsDialog actions={actions} onClose={() => setApp({ projectsOpen: false })} />}
      {app.confirmDiscard && (
        <Modal title="This project couldn't be saved" width={440} onClose={() => { misc.current.pendingLeave = null; setApp({ confirmDiscard: false }); }}>
          <p className="muted">Browser storage is full, so your latest changes exist only on screen. Download a backup before leaving, or the changes will be lost.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button className="btn" style={{ padding: '0 14px' }} onClick={() => { misc.current.pendingLeave = null; setApp({ confirmDiscard: false }); }}>Stay here</Button>
            <Button className="btn" style={{ padding: '0 14px' }} onClick={saveFile}>Download backup (.draw)</Button>
            <Button className="btn danger-btn" style={{ padding: '0 14px' }} onClick={() => { const go = misc.current.pendingLeave; misc.current.pendingLeave = null; setApp({ confirmDiscard: false }); go?.(); }}>Discard changes</Button>
          </div>
        </Modal>
      )}
      {app.confirmClear && (
        <Modal title="Reset the canvas?" width={400} onClose={() => setApp({ confirmClear: false })}>
          <p className="muted">This removes everything in the current project. You can still undo it.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button className="btn" style={{ padding: '0 14px' }} onClick={() => setApp({ confirmClear: false })}>Cancel</Button>
            <Button className="btn danger-btn" style={{ padding: '0 14px' }} onClick={clearCanvas}>Reset</Button>
          </div>
        </Modal>
      )}
      {app.helpOpen && <HelpDialog onClose={() => setApp({ helpOpen: false })} />}
      <FilePick controller={filePick} onFile={(f) => openFile(f)} />
      <FilePick controller={imgPick} accept="image/*" onFile={(f) => insertImageFile(f, misc.current.imageAt ?? undefined)} />
    </div>
  );
}
