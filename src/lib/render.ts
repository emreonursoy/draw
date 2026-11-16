import rough from 'roughjs';
import type { Drawable, Options } from 'roughjs/bin/core';
import { getStroke } from 'perfect-freehand';
import type { Arrowhead, DrawElement, Pt } from './types';
import { FONTS } from './types';
import { commonBounds, elBounds, elCenter, FRAME_LABEL, fontString, isFilled, LINE_HEIGHT, measureText, midPoint, renderPoints } from './element';
import { dist } from './utils';
import { frameChildren } from './element';

const gen = rough.generator();
const drawableCache = new WeakMap<DrawElement, Drawable[]>();
const freedrawCache = new WeakMap<DrawElement, string>();
const images = new Map<string, HTMLImageElement>();
export const DARK_FILTER = 'invert(93%) hue-rotate(180deg)';

export function getImage(dataURL: string, onLoad?: () => void): HTMLImageElement | null {
  let img = images.get(dataURL);
  if (!img) {
    img = new Image();
    img.src = dataURL;
    img.onload = () => onLoad?.();
    images.set(dataURL, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

function roundedPath(pts: Pt[], r: number): string {
  const n = pts.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const v = pts[i], p = pts[(i - 1 + n) % n], nx = pts[(i + 1) % n];
    const lp = dist(v, p) || 1, ln = dist(v, nx) || 1;
    const rr = Math.min(r, lp / 2, ln / 2);
    const a = [v[0] + ((p[0] - v[0]) * rr) / lp, v[1] + ((p[1] - v[1]) * rr) / lp];
    const b = [v[0] + ((nx[0] - v[0]) * rr) / ln, v[1] + ((nx[1] - v[1]) * rr) / ln];
    d += `${i === 0 ? 'M' : 'L'} ${a[0]} ${a[1]} Q ${v[0]} ${v[1]} ${b[0]} ${b[1]} `;
  }
  return d + 'Z';
}

function roughOptions(el: DrawElement): Options {
  const sw = el.strokeWidth;
  return {
    seed: el.seed,
    roughness: el.roughness,
    strokeWidth: sw,
    stroke: el.strokeColor,
    fill: isFilled(el) ? el.backgroundColor : undefined,
    fillStyle: el.fillStyle,
    fillWeight: sw / 2,
    hachureGap: sw * 4,
    hachureAngle: -41,
    curveFitting: 1,
    disableMultiStroke: el.strokeStyle !== 'solid',
    preserveVertices: el.roughness < 2,
    strokeLineDash: el.strokeStyle === 'dashed' ? [8, 8 + sw] : el.strokeStyle === 'dotted' ? [1.5, 6 + sw] : undefined,
  };
}

function headDrawables(tip: Pt, from: Pt, kind: Arrowhead, el: DrawElement, o: Options): Drawable[] {
  if (!kind) return [];
  const ho: Options = { ...o, fill: undefined, strokeLineDash: undefined, disableMultiStroke: true };
  const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const size = 14 + el.strokeWidth * 2;
  const at = (a: number, s: number): Pt => [tip[0] - Math.cos(ang + a) * s, tip[1] - Math.sin(ang + a) * s];
  const spread = (22 * Math.PI) / 180;
  switch (kind) {
    case 'arrow':
      return [gen.linearPath([at(spread, size), tip, at(-spread, size)], ho)];
    case 'triangle':
      return [gen.polygon([tip, at(spread, size), at(-spread, size)], { ...ho, fill: el.strokeColor, fillStyle: 'solid' })];
    case 'bar': {
      const s = size * 0.5;
      const nx = -Math.sin(ang) * s, ny = Math.cos(ang) * s;
      return [gen.line(tip[0] + nx, tip[1] + ny, tip[0] - nx, tip[1] - ny, ho)];
    }
    case 'dot': {
      const d = size * 0.7;
      return [gen.circle(tip[0] - Math.cos(ang) * (d / 2), tip[1] - Math.sin(ang) * (d / 2), d, { ...ho, fill: el.strokeColor, fillStyle: 'solid' })];
    }
  }
}

function buildDrawables(el: DrawElement): Drawable[] {
  const o = roughOptions(el);
  const w = Math.abs(el.width), h = Math.abs(el.height);
  switch (el.type) {
    case 'rectangle': {
      if (el.roundness) {
        const r = Math.min(Math.min(w, h) * 0.25, 32);
        return [gen.path(roundedPath([[0, 0], [w, 0], [w, h], [0, h]], r), o)];
      }
      return [gen.rectangle(0, 0, w, h, o)];
    }
    case 'diamond': {
      const pts: Pt[] = [[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]];
      if (el.roundness) return [gen.path(roundedPath(pts, Math.min(w, h) * 0.2), o)];
      return [gen.polygon(pts, o)];
    }
    case 'ellipse':
      return [gen.ellipse(w / 2, h / 2, w, h, o)];
    case 'line':
    case 'arrow': {
      let pts = renderPoints(el);
      if (pts.length < 2) return [];
      const lo: Options = { ...o, fill: undefined };
      const curved = el.arrowType === 'round';
      if (curved && pts.length === 2) {
        const [a, b] = pts;
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const l = dist(a, b);
        const nx = -(b[1] - a[1]) / (l || 1), ny = (b[0] - a[0]) / (l || 1);
        pts = [a, [mx + nx * l * 0.08, my + ny * l * 0.08], b];
      }
      const body = curved && pts.length > 2 ? gen.curve(pts, lo) : gen.linearPath(pts, lo);
      const out = [body];
      if (el.type === 'arrow') {
        const n = pts.length;
        out.push(...headDrawables(pts[n - 1], pts[n - 2], el.endArrowhead, el, o));
        out.push(...headDrawables(pts[0], pts[1], el.startArrowhead, el, o));
      }
      return out;
    }
    default:
      return [];
  }
}

export function getFreedrawPath(el: DrawElement): string {
  let d = freedrawCache.get(el);
  if (d === undefined) {
    const pts = getStroke(el.points, { size: el.strokeWidth * 4.25, thinning: 0.6, smoothing: 0.5, streamline: 0.5, simulatePressure: true, last: true });
    if (!pts.length) d = '';
    else {
      const parts: (string | number)[] = ['M', pts[0][0], pts[0][1], 'Q'];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        parts.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      }
      parts.push('Z');
      d = parts.join(' ');
    }
    freedrawCache.set(el, d);
  }
  return d;
}

export function getDrawables(el: DrawElement): Drawable[] {
  let d = drawableCache.get(el);
  if (!d) {
    d = buildDrawables(el);
    drawableCache.set(el, d);
  }
  return d;
}

function drawTextBlock(ctx: CanvasRenderingContext2D, text: string, size: number, family: 1 | 2 | 3, color: string, x: number, y: number, w: number, align: 'left' | 'center' | 'right') {
  ctx.font = fontString(size, family);
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = align;
  const ax = align === 'left' ? x : align === 'center' ? x + w / 2 : x + w;
  text.split('\n').forEach((line, i) => ctx.fillText(line, ax, y + i * size * LINE_HEIGHT + size * 0.05));
}

export interface RenderOpts {
  scrollX: number;
  scrollY: number;
  zoom: number;
  width: number;
  height: number;
  dpr: number;
  bg: string;
  grid: boolean;
  erasing?: Set<string>;
  clip?: [number, number, number, number];
  hideFrames?: boolean;
  hideId?: string | null;
  onImageLoad?: () => void;
}

export function drawElement(ctx: CanvasRenderingContext2D, rc: ReturnType<typeof rough.canvas>, el: DrawElement, opts: { bg: string; fade?: boolean; onImageLoad?: () => void; zoom?: number; showComments?: boolean }) {
  if (el.type === 'comment') {
    if (!opts.showComments) return;
    const z = opts.zoom || 1, r = 13 / z;
    ctx.save();
    ctx.globalAlpha = el.resolved ? 0.45 : 1;
    ctx.fillStyle = el.resolved ? '#868e96' : '#6965db';
    ctx.beginPath(); ctx.arc(el.x, el.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / z; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `600 ${12 / z}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(el.thread?.length || 1), el.x, el.y + 0.5 / z);
    ctx.restore();
    return;
  }
  if (el.type === 'frame') {
    ctx.save();
    ctx.strokeStyle = el.strokeColor; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.roundRect(el.x, el.y, el.width, el.height, 6); ctx.stroke();
    ctx.fillStyle = '#868e96'; ctx.font = fontString(FRAME_LABEL, 2); ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
    ctx.fillText(el.text, el.x, el.y - 6);
    ctx.restore();
    return;
  }
  ctx.save();
  const c = elCenter(el);
  ctx.globalAlpha = (el.opacity / 100) * (opts.fade ? 0.25 : 1);
  if (el.angle) {
    ctx.translate(c[0], c[1]);
    ctx.rotate(el.angle);
    ctx.translate(-c[0], -c[1]);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (el.type === 'text') {
    drawTextBlock(ctx, el.text, el.fontSize, el.fontFamily, el.strokeColor, el.x, el.y, el.width, el.textAlign);
  } else if (el.type === 'image') {
    const img = el.dataURL ? getImage(el.dataURL, opts.onImageLoad) : null;
    if (img) ctx.drawImage(img, el.x, el.y, el.width, el.height);
    else {
      ctx.strokeStyle = '#999';
      ctx.strokeRect(el.x, el.y, el.width, el.height);
    }
  } else if (el.type === 'freedraw') {
    ctx.translate(el.x, el.y);
    ctx.fillStyle = el.strokeColor;
    ctx.fill(new Path2D(getFreedrawPath(el)));
  } else {
    ctx.translate(el.x, el.y);
    for (const d of getDrawables(el)) rc.draw(d);
    ctx.translate(-el.x, -el.y);
    if (el.text) {
      const m = measureText(el.text, el.fontSize, el.fontFamily);
      if (el.type === 'arrow') {
        const mid = midPoint(renderPoints(el).map(([a, b]) => [a + el.x, b + el.y] as Pt));
        ctx.globalAlpha = 1;
        ctx.fillStyle = opts.bg;
        ctx.fillRect(mid[0] - m.w / 2 - 4, mid[1] - m.h / 2, m.w + 8, m.h);
        ctx.globalAlpha = el.opacity / 100;
        drawTextBlock(ctx, el.text, el.fontSize, el.fontFamily, el.strokeColor, mid[0] - m.w / 2, mid[1] - m.h / 2, m.w, 'center');
      } else {
        drawTextBlock(ctx, el.text, el.fontSize, el.fontFamily, el.strokeColor, c[0] - m.w / 2, c[1] - m.h / 2, m.w, 'center');
      }
    }
  }
  ctx.restore();
}

export function drawGrid(ctx: CanvasRenderingContext2D, o: RenderOpts) {
  const step = 20;
  const x0 = -o.scrollX, y0 = -o.scrollY;
  const x1 = x0 + o.width / o.zoom, y1 = y0 + o.height / o.zoom;
  if (step * o.zoom < 6) return;
  ctx.save();
  ctx.lineWidth = 1 / o.zoom;
  for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
    ctx.strokeStyle = Math.round(x / step) % 5 === 0 ? '#d0d5da' : '#e9ecef';
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
  }
  for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) {
    ctx.strokeStyle = Math.round(y / step) % 5 === 0 ? '#d0d5da' : '#e9ecef';
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  }
  ctx.restore();
}

export function renderScene(canvas: HTMLCanvasElement, elements: DrawElement[], o: RenderOpts) {
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = o.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(o.dpr * o.zoom, o.dpr * o.zoom);
  ctx.translate(o.scrollX, o.scrollY);
  if (o.clip) { ctx.beginPath(); ctx.rect(o.clip[0], o.clip[1], o.clip[2] - o.clip[0], o.clip[3] - o.clip[1]); ctx.clip(); }
  if (o.grid) drawGrid(ctx, o);
  const rc = rough.canvas(canvas);
  const vx1 = -o.scrollX - 50, vy1 = -o.scrollY - 50, vx2 = vx1 + o.width / o.zoom + 100, vy2 = vy1 + o.height / o.zoom + 100;
  for (const el of elements) {
    if (o.hideId === el.id || (o.hideFrames && el.type === 'frame')) continue;
    const [a, b, c, d] = commonBounds([el]);
    if (c < vx1 || a > vx2 || d < vy1 || b > vy2) continue;
    drawElement(ctx, rc, el, { bg: o.bg, fade: o.erasing?.has(el.id), onImageLoad: o.onImageLoad, zoom: o.zoom, showComments: !o.hideFrames });
  }
}

/* ---------- export ---------- */
export function exportCanvas(all: DrawElement[], opts: { padding: number; scale: number; background: string | null; dark: boolean; frame?: DrawElement }): HTMLCanvasElement | null {
  const elements = opts.frame ? frameChildren(opts.frame, all) : all.filter((e) => e.type !== 'comment');
  if (!elements.length && !opts.frame) return null;
  const [x1, y1, x2, y2] = opts.frame ? [opts.frame.x, opts.frame.y, opts.frame.x + opts.frame.width, opts.frame.y + opts.frame.height] : commonBounds(elements);
  const pad = opts.frame ? 0 : opts.padding;
  const w = Math.ceil(x2 - x1 + pad * 2), h = Math.ceil(y2 - y1 + pad * 2);
  const canvas = document.createElement('canvas');
  canvas.width = w * opts.scale;
  canvas.height = h * opts.scale;
  const ctx = canvas.getContext('2d')!;
  if (opts.dark) ctx.filter = DARK_FILTER;
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.scale(opts.scale, opts.scale);
  ctx.translate(pad - x1, pad - y1);
  if (opts.frame) { ctx.beginPath(); ctx.rect(x1, y1, x2 - x1, y2 - y1); ctx.clip(); }
  const rc = rough.canvas(canvas);
  for (const el of elements) drawElement(ctx, rc, el, { bg: opts.background || '#ffffff' });
  return canvas;
}

export function exportSVG(all: DrawElement[], opts: { padding: number; background: string | null; dark: boolean }): SVGSVGElement | null {
  const elements = all.filter((e) => e.type !== 'comment' && e.type !== 'frame');
  if (!elements.length) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const [x1, y1, x2, y2] = commonBounds(elements);
  const pad = opts.padding;
  const w = Math.ceil(x2 - x1 + pad * 2), h = Math.ceil(y2 - y1 + pad * 2);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('xmlns', NS);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  if (opts.dark) svg.setAttribute('style', `filter: ${DARK_FILTER}`);
  if (opts.background) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('width', '100%'); r.setAttribute('height', '100%'); r.setAttribute('fill', opts.background);
    svg.appendChild(r);
  }
  const rc = rough.svg(svg);
  const root = document.createElementNS(NS, 'g');
  root.setAttribute('transform', `translate(${pad - x1} ${pad - y1})`);
  svg.appendChild(root);
  const textNode = (text: string, size: number, fam: 1 | 2 | 3, color: string, x: number, y: number, w: number, align: string) => {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('font-size', String(size));
    t.setAttribute('font-family', FONTS[fam]);
    t.setAttribute('fill', color);
    t.setAttribute('text-anchor', align === 'left' ? 'start' : align === 'center' ? 'middle' : 'end');
    t.setAttribute('dominant-baseline', 'text-before-edge');
    const ax = align === 'left' ? x : align === 'center' ? x + w / 2 : x + w;
    text.split('\n').forEach((line, i) => {
      const s = document.createElementNS(NS, 'tspan');
      s.setAttribute('x', String(ax));
      s.setAttribute('y', String(y + i * size * LINE_HEIGHT));
      s.textContent = line;
      t.appendChild(s);
    });
    return t;
  };
  for (const el of elements) {
    const g = document.createElementNS(NS, 'g');
    const c = elCenter(el);
    if (el.angle) g.setAttribute('transform', `rotate(${(el.angle * 180) / Math.PI} ${c[0]} ${c[1]})`);
    g.setAttribute('opacity', String(el.opacity / 100));
    if (el.type === 'text') g.appendChild(textNode(el.text, el.fontSize, el.fontFamily, el.strokeColor, el.x, el.y, el.width, el.textAlign));
    else if (el.type === 'image' && el.dataURL) {
      const im = document.createElementNS(NS, 'image');
      im.setAttribute('href', el.dataURL);
      im.setAttribute('x', String(el.x)); im.setAttribute('y', String(el.y));
      im.setAttribute('width', String(el.width)); im.setAttribute('height', String(el.height));
      g.appendChild(im);
    } else if (el.type === 'freedraw') {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', getFreedrawPath(el));
      p.setAttribute('fill', el.strokeColor);
      p.setAttribute('transform', `translate(${el.x} ${el.y})`);
      g.appendChild(p);
    } else {
      const inner = document.createElementNS(NS, 'g');
      inner.setAttribute('transform', `translate(${el.x} ${el.y})`);
      inner.setAttribute('stroke-linecap', 'round');
      for (const d of getDrawables(el)) inner.appendChild(rc.draw(d));
      g.appendChild(inner);
      if (el.text) {
        const m = measureText(el.text, el.fontSize, el.fontFamily);
        const mid = el.type === 'arrow' ? midPoint(renderPoints(el).map(([a, b]) => [a + el.x, b + el.y] as Pt)) : c;
        g.appendChild(textNode(el.text, el.fontSize, el.fontFamily, el.strokeColor, mid[0] - m.w / 2, mid[1] - m.h / 2, m.w, 'center'));
      }
    }
    root.appendChild(g);
  }
  return svg;
}
export { elBounds };
