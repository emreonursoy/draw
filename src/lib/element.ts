import type { DrawElement, ElType, Pt, Style } from './types';
import { FONTS } from './types';
import { fitMarkdown } from './mdrender';
import { sanitizeUrl } from './embed';
import { clamp, dist, distToSegment, pointInPolygon, rotatePt, seedRand, uid } from './utils';

export const LINE_HEIGHT = 1.25;
export const isLinear = (e: DrawElement) => e.type === 'arrow' || e.type === 'line';
export const isPoints = (e: DrawElement) => isLinear(e) || e.type === 'freedraw';
export const isFilled = (e: DrawElement) => e.backgroundColor !== 'transparent';
export const canHaveLabel = (e: DrawElement) =>
  e.type === 'rectangle' || e.type === 'diamond' || e.type === 'ellipse' || e.type === 'arrow' || e.type === 'frame';
export const FRAME_LABEL = 14;

export function newElement(type: ElType, x: number, y: number, style: Style, extra: Partial<DrawElement> = {}): DrawElement {
  return {
    ...style,
    id: uid(),
    type,
    x,
    y,
    width: 0,
    height: 0,
    angle: 0,
    seed: seedRand(),
    groupIds: [],
    locked: false,
    points: type === 'arrow' || type === 'line' || type === 'freedraw' ? [[0, 0]] : [],
    text: '',
    startBinding: null,
    endBinding: null,
    ...extra,
  };
}

/* ---------- text measuring ---------- */
let mctx: CanvasRenderingContext2D | null = null;
export function fontString(size: number, family: 1 | 2 | 3) {
  return `${size}px ${FONTS[family]}`;
}
export function measureText(text: string, size: number, family: 1 | 2 | 3) {
  if (!mctx) mctx = document.createElement('canvas').getContext('2d')!;
  mctx.font = fontString(size, family);
  const lines = text.split('\n');
  const w = Math.max(...lines.map((l) => mctx!.measureText(l).width), 1);
  return { w, h: lines.length * size * LINE_HEIGHT };
}
export function fitText(el: DrawElement): DrawElement {
  const { w, h } = measureText(el.text || ' ', el.fontSize, el.fontFamily);
  return { ...el, width: w, height: h };
}

/* ---------- linear points ---------- */
export function elbowPoints(pts: Pt[]): Pt[] {
  if (pts.length < 2) return pts;
  if (pts.length === 2) {
    const [a, b] = pts;
    if (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1])) {
      const mx = (a[0] + b[0]) / 2;
      return [a, [mx, a[1]], [mx, b[1]], b];
    }
    const my = (a[1] + b[1]) / 2;
    return [a, [a[0], my], [b[0], my], b];
  }
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i];
    if (i % 2 === 1) out.push([q[0], p[1]]);
    else out.push([p[0], q[1]]);
    out.push(q);
  }
  return out;
}
export function renderPoints(el: DrawElement): Pt[] {
  if (el.type === 'arrow' && el.arrowType === 'elbow') return elbowPoints(el.points);
  return el.points;
}
/** Re-anchor points so points[0] = [0,0] and refresh width/height */
export function withAbsPoints(el: DrawElement, abs: Pt[]): DrawElement {
  const [ox, oy] = abs[0];
  const points = abs.map(([x, y]) => [x - ox, y - oy] as Pt);
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  return {
    ...el,
    x: ox,
    y: oy,
    points,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}
export const absPoints = (el: DrawElement): Pt[] => el.points.map(([x, y]) => [x + el.x, y + el.y] as Pt);

/* ---------- bounds ---------- */
export type Bounds = [number, number, number, number];
export function elBounds(el: DrawElement): Bounds {
  if (isPoints(el)) {
    const pts = el.type === 'freedraw' ? el.points : renderPoints(el);
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const [px, py] of pts) {
      x1 = Math.min(x1, px); y1 = Math.min(y1, py); x2 = Math.max(x2, px); y2 = Math.max(y2, py);
    }
    return [x1 + el.x, y1 + el.y, x2 + el.x, y2 + el.y];
  }
  return [el.x, el.y, el.x + el.width, el.y + el.height];
}
export const elCenter = (el: DrawElement): Pt => {
  const [a, b, c, d] = elBounds(el);
  return [(a + c) / 2, (b + d) / 2];
};
export function elCorners(el: DrawElement): Pt[] {
  const [x1, y1, x2, y2] = elBounds(el);
  const c = elCenter(el);
  return ([[x1, y1], [x2, y1], [x2, y2], [x1, y2]] as Pt[]).map((p) => rotatePt(p, c, el.angle));
}
export function elAABB(el: DrawElement): Bounds {
  const cs = elCorners(el);
  const xs = cs.map((p) => p[0]), ys = cs.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
export function commonBounds(els: DrawElement[]): Bounds {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const e of els) {
    const [a, b, c, d] = elAABB(e);
    x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d);
  }
  return [x1, y1, x2, y2];
}

/* ---------- hit testing ---------- */
export function diamondPts(el: DrawElement): Pt[] {
  const { x, y, width: w, height: h } = el;
  return [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]];
}
export function hitElement(el: DrawElement, p: Pt, tol: number): boolean {
  const c = elCenter(el);
  const q = el.angle ? rotatePt(p, c, -el.angle) : p;
  const t = tol + el.strokeWidth / 2;
  const [x1, y1, x2, y2] = elBounds(el);
  if (el.text && (el.type === 'rectangle' || el.type === 'diamond' || el.type === 'ellipse')) {
    const m = measureText(el.text, el.fontSize, el.fontFamily);
    if (Math.abs(q[0] - c[0]) <= m.w / 2 + 4 && Math.abs(q[1] - c[1]) <= m.h / 2 + 4) return true;
  }
  const inRect = q[0] >= x1 - t && q[0] <= x2 + t && q[1] >= y1 - t && q[1] <= y2 + t;
  switch (el.type) {
    case 'text':
    case 'image':
    case 'markdown':
    case 'embed':
      return inRect;
    case 'comment':
      return Math.hypot(q[0] - el.x, q[1] - el.y) <= tol + 12;
    case 'frame': {
      const m = measureText(el.text || ' ', FRAME_LABEL, 2);
      if (q[0] >= x1 && q[0] <= x1 + m.w + 4 && q[1] >= y1 - FRAME_LABEL * 1.5 - 6 && q[1] <= y1) return true;
      const inner = q[0] > x1 + t && q[0] < x2 - t && q[1] > y1 + t && q[1] < y2 - t;
      return inRect && !inner;
    }
    case 'rectangle': {
      if (!inRect) return false;
      if (isFilled(el)) return true;
      const inner = q[0] > x1 + t && q[0] < x2 - t && q[1] > y1 + t && q[1] < y2 - t;
      return !inner;
    }
    case 'ellipse': {
      const a = (x2 - x1) / 2, b = (y2 - y1) / 2;
      if (a <= 0 || b <= 0) return inRect;
      const v = Math.hypot((q[0] - c[0]) / a, (q[1] - c[1]) / b);
      if (isFilled(el)) return v <= 1 + t / Math.min(a, b);
      return Math.abs(v - 1) * Math.min(a, b) <= t;
    }
    case 'diamond': {
      const poly = diamondPts(el);
      if (isFilled(el) && pointInPolygon(q, poly)) return true;
      for (let i = 0; i < 4; i++) if (distToSegment(q, poly[i], poly[(i + 1) % 4]) <= t) return true;
      return false;
    }
    default: {
      const pts = (el.type === 'freedraw' ? el.points : renderPoints(el)).map(([a, b]) => [a + el.x, b + el.y] as Pt);
      if (pts.length === 1) return dist(q, pts[0]) <= t + 2;
      if (el.closed && pts.length >= 3) {
        if (isFilled(el) && pointInPolygon(q, pts)) return true;
        if (distToSegment(q, pts[pts.length - 1], pts[0]) <= t) return true;
      }
      for (let i = 0; i < pts.length - 1; i++) if (distToSegment(q, pts[i], pts[i + 1]) <= t + (el.type === 'freedraw' ? 2 : 0)) return true;
      // label hit
      if (el.text) {
        const m = measureText(el.text, el.fontSize, el.fontFamily);
        const mid = midPoint(pts);
        if (Math.abs(q[0] - mid[0]) < m.w / 2 && Math.abs(q[1] - mid[1]) < m.h / 2) return true;
      }
      return false;
    }
  }
}
export function midPoint(pts: Pt[]): Pt {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += dist(pts[i], pts[i + 1]);
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = dist(pts[i], pts[i + 1]);
    if (acc + l >= total / 2 && l > 0) {
      const t = (total / 2 - acc) / l;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
    }
    acc += l;
  }
  return pts[0];
}

/* ---------- bindings ---------- */
export const isBindable = (e: DrawElement) => e.type === 'rectangle' || e.type === 'diamond' || e.type === 'ellipse';
export function boundaryPoint(shape: DrawElement, from: Pt, gap = 6): Pt {
  const c = elCenter(shape);
  const f = shape.angle ? rotatePt(from, c, -shape.angle) : from;
  const dx = f[0] - c[0], dy = f[1] - c[1];
  const a = Math.max(shape.width / 2, 1), b = Math.max(shape.height / 2, 1);
  let t: number;
  if (dx === 0 && dy === 0) return c;
  if (shape.type === 'ellipse') t = 1 / Math.hypot(dx / a, dy / b);
  else if (shape.type === 'diamond') t = 1 / (Math.abs(dx) / a + Math.abs(dy) / b);
  else t = 1 / Math.max(Math.abs(dx) / a, Math.abs(dy) / b);
  const len = Math.hypot(dx, dy);
  const r = Math.min(t * len + gap, len > 0 ? Infinity : 0);
  const pt: Pt = [c[0] + (dx / len) * r, c[1] + (dy / len) * r];
  return shape.angle ? rotatePt(pt, c, shape.angle) : pt;
}
export function findBindTarget(els: DrawElement[], p: Pt, exclude?: string): DrawElement | null {
  for (let i = els.length - 1; i >= 0; i--) {
    const e = els[i];
    if (e.id === exclude || !isBindable(e) || e.locked) continue;
    if (hitElement({ ...e, backgroundColor: '#000' }, p, 8)) return e;
  }
  return null;
}
/** Recompute endpoints of arrows bound to any element in `ids` */
export function updateBoundArrows(els: DrawElement[], ids: Set<string>): DrawElement[] {
  const byId = new Map(els.map((e) => [e.id, e]));
  return els.map((e) => {
    if (e.type !== 'arrow' || (!e.startBinding && !e.endBinding)) return e;
    const s = e.startBinding ? byId.get(e.startBinding) : undefined;
    const t = e.endBinding ? byId.get(e.endBinding) : undefined;
    if (!((s && ids.has(s.id)) || (t && ids.has(t.id)))) return e;
    const abs = absPoints(e);
    const n = abs.length;
    const first = abs[0], last = abs[n - 1];
    const aimStart = n > 2 ? abs[1] : t ? elCenter(t) : last;
    const aimEnd = n > 2 ? abs[n - 2] : s ? elCenter(s) : first;
    if (s) abs[0] = boundaryPoint(s, aimStart);
    if (t) abs[n - 1] = boundaryPoint(t, aimEnd);
    return withAbsPoints(e, abs);
  });
}

/* ---------- groups ---------- */
export function groupSelect(els: DrawElement[], el: DrawElement): string[] {
  const g = el.groupIds[el.groupIds.length - 1];
  if (!g) return [el.id];
  return els.filter((e) => e.groupIds.includes(g)).map((e) => e.id);
}

/* ---------- import normalization (also accepts compatible JSON) ---------- */
/** Per-field caps for untrusted scenes (shared links, imported files), so one huge field can't freeze the tab. */
const MAX_TEXT = 200_000;
const MAX_POINTS = 50_000;

const COLOR_RE = /^(#[0-9a-f]{3,8}|transparent|[a-z]{3,20}|(?:rgb|hsl)a?\([0-9a-z.,%\s/-]{3,60}\))$/i;
const HEADS = ['arrow', 'bar', 'dot', 'triangle'];
const finite = (v: any, d: number, lo = -1e9, hi = 1e9) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const color = (v: any, d: string) => (typeof v === 'string' && COLOR_RE.test(v.trim()) ? v.trim() : d);
/** Stable short id for over-long ids, so every reference to the same long id maps to the same value. */
const shortId = (v: string) => {
  // cyrb53: a 53-bit hash, so collisions between distinct ids are practically impossible
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `h${hash.toString(36)}${v.length.toString(36)}`;
};
const sid = (v: any): string | null => (typeof v === 'string' && v.length > 0 ? (v.length <= 64 ? v : shortId(v)) : null);

/**
 * Turns untrusted data (saved projects, shared links, imported files) into a well-formed element:
 * every field is type-checked, clamped or defaulted, and anything unusable is dropped, so a malformed
 * scene can never crash rendering or brick startup.
 */
export function normalizeImported(raw: any, defaults: Style): DrawElement | null {
  try {
    return normalizeUnsafe(raw, defaults);
  } catch {
    return null;
  }
}

function normalizeUnsafe(raw: any, defaults: Style): DrawElement | null {
  if (!raw || typeof raw !== 'object' || raw.isDeleted) return null;
  const types = ['rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'freedraw', 'text', 'image', 'frame', 'comment', 'markdown', 'embed'];
  if (!types.includes(raw.type)) return null;
  const el = newElement(raw.type, finite(raw.x, 0), finite(raw.y, 0), defaults);
  const linear = raw.type === 'arrow' || raw.type === 'line' || raw.type === 'freedraw';
  let points: Pt[] = el.points;
  if (linear && Array.isArray(raw.points)) {
    points = raw.points
      .slice(0, MAX_POINTS)
      .filter((p: any) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .map((p: any) => [finite(p[0], 0), finite(p[1], 0)] as Pt);
    if (!points.length) points = [[0, 0]];
  }
  const out: DrawElement = {
    ...el,
    id: sid(raw.id) ?? el.id,
    width: finite(raw.width, 0, 0, 1e7),
    height: finite(raw.height, 0, 0, 1e7),
    angle: finite(raw.angle, 0, -100, 100),
    seed: finite(raw.seed, el.seed, 0, 2 ** 31),
    strokeColor: color(raw.strokeColor, defaults.strokeColor),
    backgroundColor: color(raw.backgroundColor, 'transparent'),
    fillStyle: ['hachure', 'cross-hatch', 'solid', 'zigzag'].includes(raw.fillStyle) ? raw.fillStyle : 'hachure',
    strokeWidth: finite(raw.strokeWidth, 2, 0.5, 32),
    strokeStyle: ['solid', 'dashed', 'dotted'].includes(raw.strokeStyle) ? raw.strokeStyle : 'solid',
    roughness: finite(raw.roughness, 1, 0, 2),
    opacity: finite(raw.opacity, 100, 0, 100),
    roundness: typeof raw.roundness === 'boolean' ? raw.roundness : !!raw.roundness,
    groupIds: Array.isArray(raw.groupIds) ? raw.groupIds.map(sid).filter((g: string | null): g is string => !!g).slice(0, 50) : [],
    locked: !!raw.locked,
    points,
    text: (typeof raw.text === 'string' ? raw.text : typeof raw.name === 'string' ? raw.name : '').slice(0, MAX_TEXT),
    thread: Array.isArray(raw.thread)
      ? raw.thread.slice(0, 500).filter((c: any) => c && typeof c.text === 'string').map((c: any) => ({ text: c.text.slice(0, 5000), at: finite(c.at, 0, 0, 1e15) }))
      : undefined,
    resolved: !!raw.resolved,
    fontSize: finite(raw.fontSize, 20, 4, 400),
    fontFamily: [1, 2, 3].includes(raw.fontFamily) ? raw.fontFamily : 1,
    textAlign: ['left', 'center', 'right'].includes(raw.textAlign) ? raw.textAlign : 'left',
    arrowType: ['sharp', 'round', 'elbow'].includes(raw.arrowType) ? raw.arrowType : raw.elbowed ? 'elbow' : raw.roundness ? 'round' : 'sharp',
    startArrowhead: HEADS.includes(raw.startArrowhead) ? raw.startArrowhead : null,
    endArrowhead: raw.type === 'arrow' ? (raw.endArrowhead === undefined ? 'arrow' : HEADS.includes(raw.endArrowhead) ? raw.endArrowhead : null) : null,
    dataURL: typeof raw.dataURL === 'string' && /^data:image\//i.test(raw.dataURL) ? raw.dataURL : undefined,
    startBinding: sid(raw.startBinding?.elementId) ?? sid(raw.startBinding),
    endBinding: sid(raw.endBinding?.elementId) ?? sid(raw.endBinding),
  };
  if (out.type === 'image' && !out.dataURL) return null;
  if (out.type === 'embed') {
    const url = sanitizeUrl(raw.url ?? raw.link);
    if (!url) return null;
    out.url = url;
    out.width = out.width || 640;
    out.height = out.height || 400;
  }
  if (out.type === 'line' && raw.closed === true && out.points.length >= 3) out.closed = true;
  return out.type === 'text' ? fitText(out) : out.type === 'markdown' ? fitMarkdown(out) : out;
}
export { clamp };

/** Elements whose center lies inside the frame (excluding frames and comments). */
export function frameChildren(frame: DrawElement, els: DrawElement[]): DrawElement[] {
  const x1 = frame.x, y1 = frame.y, x2 = frame.x + frame.width, y2 = frame.y + frame.height;
  return els.filter((e) => {
    if (e.id === frame.id || e.type === 'frame' || e.type === 'comment') return false;
    const c = elCenter(e);
    return c[0] >= x1 && c[0] <= x2 && c[1] >= y1 && c[1] <= y2;
  });
}
/** Frames in presentation order: by name (natural sort, so "Frame 2" < "Frame 10"), then by position. */
export function orderedFrames(els: DrawElement[]): DrawElement[] {
  return els
    .filter((e) => e.type === 'frame')
    .sort((a, b) => a.text.localeCompare(b.text, undefined, { numeric: true, sensitivity: 'base' }) || a.y - b.y || a.x - b.x);
}
