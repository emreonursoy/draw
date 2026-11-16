import rough from 'roughjs';
import type { DrawElement, Pt } from './types';
import { commonBounds } from './element';
import { drawElement } from './render';
import { rdp } from './shape';

/* ---------- pure raster helpers (unit-tested) ---------- */

export interface Region { mask: Uint8Array; area: number; open: boolean }

/** Scanline flood fill over free (non-barrier) pixels. `open` is true when the region touches the image edge. */
export function floodRegion(barrier: Uint8Array, w: number, h: number, sx: number, sy: number): Region | null {
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || barrier[sy * w + sx]) return null;
  const mask = new Uint8Array(w * h);
  const stack: number[] = [sx, sy];
  let area = 0, open = false;
  while (stack.length) {
    const y = stack.pop()!, x0 = stack.pop()!;
    if (mask[y * w + x0] || barrier[y * w + x0]) continue;
    let l = x0, r = x0;
    while (l > 0 && !barrier[y * w + l - 1] && !mask[y * w + l - 1]) l--;
    while (r < w - 1 && !barrier[y * w + r + 1] && !mask[y * w + r + 1]) r++;
    if (l === 0 || r === w - 1 || y === 0 || y === h - 1) open = true;
    for (let x = l; x <= r; x++) {
      mask[y * w + x] = 1;
      area++;
      if (y > 0 && !mask[(y - 1) * w + x] && !barrier[(y - 1) * w + x]) stack.push(x, y - 1);
      if (y < h - 1 && !mask[(y + 1) * w + x] && !barrier[(y + 1) * w + x]) stack.push(x, y + 1);
    }
  }
  return { mask, area, open };
}

/** Grows every barrier pixel by `r` pixels, sealing hairline gaps left by sketchy strokes. */
export function dilate(src: Uint8Array, w: number, h: number, r = 1): Uint8Array {
  const out = new Uint8Array(src);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!src[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) out[ny * w + nx] = 1;
      }
    }
  }
  return out;
}

const DIRS: Pt[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/** Moore-neighbour trace of the outer boundary of the region, as pixel-centre coordinates. */
export function traceContour(mask: Uint8Array, w: number, h: number): Pt[] {
  let sx = -1, sy = -1;
  outer: for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { sx = x; sy = y; break outer; }
  if (sx < 0) return [];
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const out: Pt[] = [];
  let x = sx, y = sy, dir = 6; // arrived from above (start is the top-left-most pixel)
  const limit = w * h * 4;
  for (let i = 0; i < limit; i++) {
    out.push([x + 0.5, y + 0.5]);
    let found = false;
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) % 8; // start just past the direction we came from
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
      if (at(nx, ny)) { x = nx; y = ny; dir = d; found = true; break; }
    }
    if (!found) break; // single isolated pixel
    if (x === sx && y === sy) break;
  }
  return out;
}

/** Simplifies a closed loop with Ramer–Douglas–Peucker (the loop is split in two so both halves are kept). */
export function simplifyLoop(loop: Pt[], eps: number): Pt[] {
  if (loop.length < 4) return loop;
  const mid = Math.floor(loop.length / 2);
  const a = rdp(loop.slice(0, mid + 1), eps);
  const b = rdp([...loop.slice(mid), loop[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

/* ---------- scene → region (needs a canvas) ---------- */

const NON_BARRIER = new Set(['frame', 'comment', 'text', 'image', 'markdown', 'embed']);

export type RegionResult = { points: Pt[] } | { error: 'open' | 'line' | 'none' };

/**
 * Finds the closed area under a scene point by rasterising every stroke as a barrier and flood filling from
 * the click. The result is a polygon in scene coordinates.
 */
export function regionAt(all: DrawElement[], p: Pt): RegionResult {
  const els = all.filter((e) => !NON_BARRIER.has(e.type)).map((e) => ({ ...e, backgroundColor: 'transparent' }));
  if (!els.length) return { error: 'none' };
  const [bx1, by1, bx2, by2] = commonBounds(els);
  const pad = 24;
  const ox = bx1 - pad, oy = by1 - pad;
  const bw = bx2 - bx1 + pad * 2, bh = by2 - by1 + pad * 2;
  if (p[0] < ox || p[1] < oy || p[0] > ox + bw || p[1] > oy + bh) return { error: 'open' };
  const k = Math.min(2, 1400 / Math.max(bw, bh));
  const W = Math.max(1, Math.ceil(bw * k)), H = Math.max(1, Math.ceil(bh * k));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.scale(k, k);
  ctx.translate(-ox, -oy);
  const rc = rough.canvas(canvas);
  for (const el of els) drawElement(ctx, rc, { ...el, strokeColor: '#000', opacity: 100 }, { bg: '#fff' });
  const data = ctx.getImageData(0, 0, W, H).data;
  let barrier: Uint8Array = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) barrier[i] = data[i * 4 + 3] > 30 ? 1 : 0;
  barrier = dilate(barrier, W, H, 1);
  const region = floodRegion(barrier, W, H, Math.floor((p[0] - ox) * k), Math.floor((p[1] - oy) * k));
  if (!region) return { error: 'line' };
  if (region.open) return { error: 'open' };
  if (region.area < 25) return { error: 'none' };
  const loop = simplifyLoop(traceContour(region.mask, W, H), 1.2);
  if (loop.length < 3) return { error: 'none' };
  return { points: loop.map(([x, y]) => [ox + x / k, oy + y / k] as Pt) };
}
