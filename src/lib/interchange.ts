import type { DrawElement, Style } from './types';
import { DEFAULT_STYLE } from './types';
import { elCenter, measureText, normalizeImported } from './element';

const HEAD_IN: Record<string, string | null> = { arrow: 'arrow', bar: 'bar', dot: 'dot', circle: 'dot', circle_outline: 'dot', triangle: 'triangle', triangle_outline: 'triangle', diamond: 'triangle', diamond_outline: 'triangle', crowfoot_one: 'bar', crowfoot_many: 'arrow', crowfoot_one_or_many: 'arrow' };
const fontIn = (f: number): 1 | 2 | 3 => (f === 3 ? 3 : [2, 6, 7, 9].includes(f) ? 2 : 1);

export function isInterchangeData(d: any) {
  return d && (d.type === 'excalidraw' || d.type === 'excalidraw/clipboard' || (Array.isArray(d.elements) && d.elements[0]?.versionNonce !== undefined));
}

export function importInterchange(data: any): { elements: DrawElement[]; viewBg: string; grid: boolean } {
  const raws: any[] = (data.elements || []).filter((e: any) => !e.isDeleted && e.type !== 'magicframe');
  const files = data.files || {};
  const byId = new Map<string, any>(raws.map((r) => [r.id, r]));
  const out: any[] = [];
  for (const r of raws) {
    if (r.type === 'text' && r.containerId && byId.has(r.containerId)) {
      const c = byId.get(r.containerId);
      c.__label = r;
      continue;
    }
    out.push(r);
  }
  const els: DrawElement[] = [];
  for (const r of out) {
    const raw = { ...r };
    if (raw.type === 'image') raw.dataURL = files[raw.fileId]?.dataURL;
    if (raw.type === 'image' && !raw.dataURL) continue;
    if (!['rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'freedraw', 'text', 'image', 'frame'].includes(raw.type)) continue;
    if (raw.type === 'frame') { raw.strokeColor = '#868e96'; raw.backgroundColor = 'transparent'; }
    raw.fontFamily = fontIn(raw.fontFamily);
    raw.startArrowhead = HEAD_IN[raw.startArrowhead] ?? null;
    raw.endArrowhead = raw.type === 'arrow' ? (raw.endArrowhead === null ? null : HEAD_IN[raw.endArrowhead] ?? null) : null;
    if (raw.type === 'text') raw.roundness = null;
    const el = normalizeImported(raw, DEFAULT_STYLE);
    if (!el) continue;
    if (raw.type === 'arrow' || raw.type === 'line') el.arrowType = raw.elbowed ? 'elbow' : raw.roundness ? 'round' : 'sharp';
    if (raw.type === 'line') el.endArrowhead = null;
    if (raw.__label) {
      el.text = raw.__label.text || '';
      el.fontSize = raw.__label.fontSize ?? el.fontSize;
      el.fontFamily = fontIn(raw.__label.fontFamily);
      el.strokeColor = raw.type === 'arrow' ? el.strokeColor : raw.__label.strokeColor ?? el.strokeColor;
    }
    els.push(el);
  }
  const ids = new Set(els.map((e) => e.id));
  for (const e of els) {
    if (e.startBinding && !ids.has(e.startBinding)) e.startBinding = null;
    if (e.endBinding && !ids.has(e.endBinding)) e.endBinding = null;
  }
  const a = data.appState || {};
  return { elements: els, viewBg: a.viewBackgroundColor || '#ffffff', grid: !!a.gridSize };
}

export function exportInterchange(all: DrawElement[], viewBg: string, grid: boolean) {
  const elements = all.filter((e) => e.type !== 'comment');
  const now = Date.now();
  const out: any[] = [];
  const files: Record<string, any> = {};
  const boundTo = new Map<string, any[]>();
  const addBound = (id: string, b: any) => boundTo.set(id, [...(boundTo.get(id) || []), b]);
  for (const e of elements) {
    if (e.type === 'arrow') {
      if (e.startBinding) addBound(e.startBinding, { type: 'arrow', id: e.id });
      if (e.endBinding) addBound(e.endBinding, { type: 'arrow', id: e.id });
    }
  }
  const base = (e: DrawElement) => ({
    id: e.id, type: e.type, x: e.x, y: e.y, width: e.width, height: e.height, angle: e.angle,
    strokeColor: e.strokeColor, backgroundColor: e.backgroundColor, fillStyle: e.fillStyle, strokeWidth: e.strokeWidth,
    strokeStyle: e.strokeStyle, roughness: e.roughness, opacity: e.opacity, groupIds: e.groupIds, frameId: null, index: null,
    roundness: null as any, seed: e.seed, version: 1, versionNonce: e.seed, isDeleted: false, boundElements: null as any,
    updated: now, link: null, locked: e.locked,
  });
  const textEl = (id: string, x: number, y: number, w: number, h: number, e: DrawElement, container: string | null) => ({
    ...base(e), id, type: 'text', x, y, width: w, height: h, angle: container ? 0 : e.angle, backgroundColor: 'transparent', roundness: null,
    text: e.text, originalText: e.text, fontSize: e.fontSize, fontFamily: e.fontFamily, textAlign: container ? 'center' : e.textAlign,
    verticalAlign: container ? 'middle' : 'top', containerId: container, autoResize: true, lineHeight: 1.25, boundElements: null,
  });
  for (const e of elements) {
    const b: any = base(e);
    const bound = [...(boundTo.get(e.id) || [])];
    switch (e.type) {
      case 'markdown': { out.push(textEl(e.id, e.x, e.y, e.width, e.height, { ...e, fontFamily: 3, fontSize: 14 }, null)); continue; }
      case 'frame': { b.name = e.text; b.roundness = null; break; }
      case 'rectangle': case 'diamond': b.roundness = e.roundness ? { type: 3 } : null; break;
      case 'arrow': case 'line':
        b.roundness = e.arrowType === 'round' ? { type: 2 } : null;
        b.points = e.points; b.lastCommittedPoint = null;
        b.startBinding = e.startBinding ? { elementId: e.startBinding, focus: 0, gap: 6 } : null;
        b.endBinding = e.endBinding ? { elementId: e.endBinding, focus: 0, gap: 6 } : null;
        b.startArrowhead = e.type === 'arrow' ? e.startArrowhead : null;
        b.endArrowhead = e.type === 'arrow' ? e.endArrowhead : null;
        if (e.type === 'arrow') b.elbowed = e.arrowType === 'elbow';
        break;
      case 'freedraw': b.points = e.points; b.pressures = []; b.simulatePressure = true; b.lastCommittedPoint = null; break;
      case 'text': {
        const t = textEl(e.id, e.x, e.y, e.width, e.height, e, null);
        out.push(t);
        continue;
      }
      case 'image': {
        const fileId = e.id;
        const m = /^data:([^;]+);/.exec(e.dataURL || '');
        files[fileId] = { id: fileId, mimeType: m?.[1] || 'image/png', dataURL: e.dataURL, created: now, lastRetrieved: now };
        b.fileId = fileId; b.status = 'saved'; b.scale = [1, 1];
        break;
      }
    }
    if (e.text && e.type !== 'image' && e.type !== 'freedraw' && e.type !== 'frame') {
      const m = measureText(e.text, e.fontSize, e.fontFamily);
      const c = e.type === 'arrow' ? (() => { const p = e.points[Math.floor(e.points.length / 2)]; return [e.x + p[0], e.y + p[1]]; })() : elCenter(e);
      const tid = e.id + '_label';
      bound.push({ type: 'text', id: tid });
      out.push({ ...b, boundElements: bound });
      out.push(textEl(tid, c[0] - m.w / 2, c[1] - m.h / 2, m.w, m.h, e, e.id));
      continue;
    }
    b.boundElements = bound.length ? bound : null;
    out.push(b);
  }
  return {
    type: 'excalidraw', version: 2, source: 'draw', elements: out,
    appState: { gridSize: grid ? 20 : null, viewBackgroundColor: viewBg },
    files,
  };
}
export type { Style };
