import type { Pt } from './types';
import { dist, distToSegment } from './utils';

export interface Recognized {
  kind: 'line' | 'rectangle' | 'ellipse' | 'diamond' | 'triangle';
  x: number;
  y: number;
  width: number;
  height: number;
  /** Absolute vertices for lines and triangles. */
  points?: Pt[];
}

const pathLength = (p: Pt[]) => p.slice(1).reduce((s, q, i) => s + dist(p[i], q), 0);

/** Equal arc-length resampling, so recognition doesn't depend on how fast the pen moved. */
export function resample(p: Pt[], n: number): Pt[] {
  const total = pathLength(p);
  if (total === 0) return [p[0]];
  const step = total / (n - 1);
  const out: Pt[] = [p[0]];
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    let a = p[i - 1];
    const b = p[i];
    let seg = dist(a, b);
    while (acc + seg >= step && seg > 0) {
      const t = (step - acc) / seg;
      const q: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      out.push(q);
      a = q;
      seg = dist(a, b);
      acc = 0;
    }
    acc += seg;
  }
  while (out.length < n) out.push(p[p.length - 1]);
  return out.slice(0, n);
}

/** Ramer–Douglas–Peucker polyline simplification. */
export function rdp(p: Pt[], eps: number): Pt[] {
  if (p.length < 3) return p;
  let idx = 0, max = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const d = distToSegment(p[i], p[0], p[p.length - 1]);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [p[0], p[p.length - 1]];
  const left = rdp(p.slice(0, idx + 1), eps);
  const right = rdp(p.slice(idx), eps);
  return [...left.slice(0, -1), ...right];
}

const edgeDist = (pt: Pt, poly: Pt[]) => {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) m = Math.min(m, distToSegment(pt, poly[i], poly[(i + 1) % poly.length]));
  return m;
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Guesses which clean shape a freehand stroke was meant to be: a straight line, rectangle, ellipse, diamond
 * or triangle. Returns null when the stroke doesn't clearly match any of them (e.g. a scribble or an open arc).
 */
export function recognizeShape(raw: Pt[]): Recognized | null {
  if (raw.length < 6) return null;
  const len = pathLength(raw);
  if (len < 40) return null;
  const pts = resample(raw, 72);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = x1 - x0, h = y1 - y0;
  const chord = dist(pts[0], pts[pts.length - 1]);

  // straight line: the path barely leaves the chord
  const first = pts[0], last = pts[pts.length - 1];
  const maxDev = Math.max(...pts.map((p) => distToSegment(p, first, last)));
  if (chord > 0.5 * len && len / chord < 1.12 && maxDev < 0.07 * chord) {
    let end: Pt = last;
    const dx = last[0] - first[0], dy = last[1] - first[1];
    const ang = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
    if (ang < 5) end = [last[0], first[1]]; // snap near-horizontal
    else if (ang > 85) end = [first[0], last[1]]; // snap near-vertical
    return { kind: 'line', x: Math.min(first[0], end[0]), y: Math.min(first[1], end[1]), width: Math.abs(end[0] - first[0]), height: Math.abs(end[1] - first[1]), points: [first, end] };
  }

  // everything else has to be a closed loop
  if (chord > 0.25 * len) return null;
  if (w < 12 || h < 12) return null;

  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, a = w / 2, b = h / 2;
  const norm = (w + h) / 4;
  const ellipseErr = mean(pts.map((p) => Math.abs(Math.hypot((p[0] - cx) / a, (p[1] - cy) / b) - 1)));
  const rectPoly: Pt[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const rectErr = mean(pts.map((p) => edgeDist(p, rectPoly))) / norm;
  const diaPoly: Pt[] = [[cx, y0], [x1, cy], [cx, y1], [x0, cy]];
  const diaErr = mean(pts.map((p) => edgeDist(p, diaPoly))) / norm;

  // triangle: simplify the loop; it must collapse to three corners
  let triErr = Infinity;
  let tri: Pt[] | null = null;
  const loop = [...pts, pts[0]];
  const corners = rdp(loop, 0.09 * Math.hypot(w, h));
  if (corners.length === 4 && dist(corners[0], corners[3]) < 1e-6) {
    tri = corners.slice(0, 3);
    triErr = mean(pts.map((p) => edgeDist(p, tri!))) / norm;
  }

  const candidates: { kind: Recognized['kind']; err: number; max: number }[] = [
    { kind: 'ellipse', err: ellipseErr, max: 0.1 },
    { kind: 'rectangle', err: rectErr, max: 0.1 },
    { kind: 'diamond', err: diaErr, max: 0.1 },
    { kind: 'triangle', err: triErr, max: 0.1 },
  ];
  const best = candidates.filter((c) => c.err <= c.max).sort((p, q) => p.err - q.err)[0];
  if (!best) return null;
  if (best.kind === 'triangle') return { kind: 'triangle', x: x0, y: y0, width: w, height: h, points: tri! };
  return { kind: best.kind, x: x0, y: y0, width: w, height: h };
}
