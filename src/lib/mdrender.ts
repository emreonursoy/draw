import type { DrawElement } from './types';
import { FONTS } from './types';

/** Renders Markdown text as formatted content on the canvas (the "markdown block" element). */
export const MD_PAD = 14;
type Tone = 'fg' | 'muted' | 'link' | 'code';
type Op =
  | { k: 'text'; x: number; y: number; t: string; font: string; tone: Tone; u?: boolean; s?: boolean }
  | { k: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; r?: number }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number };
interface Layout { ops: Op[]; height: number }
interface Run { t: string; b?: boolean; i?: boolean; c?: boolean; l?: boolean; s?: boolean }

const cache = new Map<string, Layout>();
let mctx: CanvasRenderingContext2D | null = null;
const measure = (font: string, t: string) => {
  if (!mctx) mctx = document.createElement('canvas').getContext('2d')!;
  mctx.font = font;
  return mctx.measureText(t).width;
};

function inlineRuns(src: string): Run[] {
  const runs: Run[] = [];
  let b = false, it = false, st = false, buf = '';
  const flush = () => { if (buf) { runs.push({ t: buf, b, i: it, s: st }); buf = ''; } };
  for (let i = 0; i < src.length; ) {
    const rest = src.slice(i);
    let m: RegExpExecArray | null;
    if (rest[0] === '\\' && rest.length > 1) { buf += rest[1]; i += 2; continue; }
    if (rest[0] === '`' && (m = /^`([^`]+)`/.exec(rest))) { flush(); runs.push({ t: m[1], c: true }); i += m[0].length; continue; }
    if ((m = /^!\[([^\]]*)\]\([^)]*\)/.exec(rest))) { buf += m[1]; i += m[0].length; continue; }
    if ((m = /^\[([^\]]+)\]\(([^)]*)\)/.exec(rest))) { flush(); runs.push({ t: m[1], l: true, b, i: it }); i += m[0].length; continue; }
    if (rest.startsWith('**') || rest.startsWith('__')) { flush(); b = !b; i += 2; continue; }
    if (rest.startsWith('~~')) { flush(); st = !st; i += 2; continue; }
    if ((rest[0] === '*' && /\S/.test(rest[1] || '')) || (rest[0] === '*' && it)) { flush(); it = !it; i += 1; continue; }
    if (rest[0] === '_' && (it || (!/\w/.test(src[i - 1] || ' ') && /\S/.test(rest[1] || '')))) { flush(); it = !it; i += 1; continue; }
    buf += rest[0]; i += 1;
  }
  flush();
  return runs;
}

export function layoutMarkdown(el: Pick<DrawElement, 'text' | 'width' | 'fontSize' | 'fontFamily'>): Layout {
  const key = `${el.width}|${el.fontSize}|${el.fontFamily}|${el.text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = el.fontSize || 18, fam = FONTS[el.fontFamily || 2], mono = FONTS[3];
  const lh = size * 1.5;
  const W = Math.max(80, el.width - MD_PAD * 2);
  const ops: Op[] = [];
  let y = 0;
  const fontOf = (r: Run, sz: number, bold = false) => (r.c ? `${sz * 0.9}px ${mono}` : `${r.i ? 'italic ' : ''}${r.b || bold ? '600 ' : ''}${sz}px ${fam}`);

  /** Lay out inline runs wrapped inside [x0, x0+width]; returns the height used. */
  const flow = (runs: Run[], x0: number, width: number, sz: number, tone: Tone = 'fg', bold = false): number => {
    let x = 0, line = 0;
    const pending: Op[] = [];
    const nl = () => { x = 0; line++; };
    for (const r of runs) {
      const font = fontOf(r, sz, bold);
      const t: Tone = r.l ? 'link' : r.c ? 'code' : tone;
      for (const tok of r.t.split(/(\s+)/)) {
        if (!tok) continue;
        const isSpace = /^\s+$/.test(tok);
        const w = measure(font, tok);
        if (isSpace && x === 0) continue;
        if (!isSpace && x + w > width && x > 0) nl();
        const ty = y + line * sz * 1.5 + (sz * 1.5 - sz) / 2 - sz * 0.05;
        if (r.c && !isSpace) pending.push({ k: 'rect', x: x0 + x - 2, y: ty - 1, w: w + 4, h: sz * 1.15, fill: '#f1f3f5', r: 4 });
        if (!isSpace || (r.c && x > 0)) pending.push({ k: 'text', x: x0 + x, y: ty, t: tok, font, tone: t, u: r.l, s: r.s });
        x += w;
      }
    }
    ops.push(...pending);
    return (line + 1) * sz * 1.5;
  };

  const lines = el.text.replace(/\r\n?/g, '\n').split('\n');
  const gap = size * 0.55;
  let i = 0;
  const blockStart = (l: string) => /^(\s*(```|~~~)|#{1,6}\s|\s*>|\s*([-*+]|\d+[.)])\s|\s*([-*_])(\s*\4){2,}\s*$|\s*\|.*\|\s*$)/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m: RegExpExecArray | null;
    if ((m = /^\s*(```|~~~)/.exec(line))) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(m[1])) body.push(lines[i++]);
      i++;
      const csz = size * 0.85, clh = csz * 1.5;
      const h = Math.max(1, body.length) * clh + 20;
      ops.push({ k: 'rect', x: 0, y, w: W, h, fill: '#f1f3f5', stroke: '#ced4da', r: 8 });
      body.forEach((l, n) => ops.push({ k: 'text', x: 12, y: y + 10 + n * clh + (clh - csz) / 2 - 1, t: l, font: `${csz}px ${mono}`, tone: 'fg' }));
      y += h + gap;
      continue;
    }
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
      const sz = size * [1.9, 1.6, 1.35, 1.2, 1.1, 1][m[1].length - 1];
      y += m[1].length <= 2 && y > 0 ? gap * 0.6 : 0;
      y += flow(inlineRuns(m[2]), 0, W, sz, 'fg', true) + (m[1].length <= 2 ? 0 : 0);
      if (m[1].length <= 2) { ops.push({ k: 'line', x1: 0, y1: y - sz * 0.1, x2: W, y2: y - sz * 0.1 }); y += 4; }
      y += gap * 0.6; i++; continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { ops.push({ k: 'line', x1: 0, y1: y + 4, x2: W, y2: y + 4 }); y += gap + 8; i++; continue; }
    if (/^\s*>/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      const h = flow(inlineRuns(q.join(' ')), 16, W - 16, size, 'muted');
      ops.push({ k: 'rect', x: 0, y, w: 3, h, fill: '#adb5bd' });
      y += h + gap; continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] || '')) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        if (!/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        i++;
      }
      const cols = Math.max(...rows.map((r) => r.length));
      const cw = Array.from({ length: cols }, (_, c) => Math.max(...rows.map((r, ri) => measure(`${ri === 0 ? '600 ' : ''}${size}px ${fam}`, (r[c] || '').replace(/[*_`]/g, '')))) + 20);
      const total = cw.reduce((a, b) => a + b, 0);
      const k = total > W ? W / total : 1;
      const rh = lh + 8;
      rows.forEach((r, ri) => {
        let cx = 0;
        cw.forEach((w0, c) => {
          const w = w0 * k;
          ops.push({ k: 'rect', x: cx, y: y + ri * rh, w, h: rh, fill: ri === 0 ? '#f1f3f5' : undefined, stroke: '#ced4da' });
          ops.push({ k: 'text', x: cx + 10 * k, y: y + ri * rh + (rh - size) / 2 - 1, t: (r[c] || '').replace(/[*_`]/g, ''), font: `${ri === 0 ? '600 ' : ''}${size * (k < 1 ? k : 1)}px ${fam}`, tone: 'fg' });
          cx += w;
        });
      });
      y += rows.length * rh + gap; continue;
    }
    if ((m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line))) {
      while (i < lines.length) {
        const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!li) break;
        const depth = Math.floor(li[1].replace(/\t/g, '  ').length / 2);
        const x0 = depth * 22;
        let content = li[3];
        const task = /^\[( |x|X)\]\s+(.*)$/.exec(content);
        if (task) content = task[2];
        const marker = task ? (task[1] === ' ' ? '☐' : '☑') : /^\d/.test(li[2]) ? li[2] : depth % 2 ? '◦' : '•';
        ops.push({ k: 'text', x: x0, y: y + (lh - size) / 2 - 1, t: marker, font: `${size}px ${fam}`, tone: task && task[1] !== ' ' ? 'muted' : 'fg' });
        const h = flow(inlineRuns(content), x0 + 24, W - x0 - 24, size, task && task[1] !== ' ' ? 'muted' : 'fg');
        y += h + 2; i++;
      }
      y += gap; continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && (para.length === 0 || !blockStart(lines[i]))) para.push(lines[i++]);
    y += flow(inlineRuns(para.join(' ')), 0, W, size) + gap;
  }
  const out: Layout = { ops, height: Math.max(size * 1.5, y - gap) };
  if (cache.size > 300) cache.clear();
  cache.set(key, out);
  return out;
}

/** Layouts depend on font metrics, so drop them when web fonts finish loading. */
export const clearMarkdownCache = () => cache.clear();

export function fitMarkdown(el: DrawElement): DrawElement {
  const l = layoutMarkdown(el);
  return { ...el, height: l.height + MD_PAD * 2 };
}

const TONES: Record<Exclude<Tone, 'fg'>, string> = { muted: '#6b6b76', link: '#1971c2', code: '#c92a2a' };

export function drawMarkdown(ctx: CanvasRenderingContext2D, el: DrawElement) {
  ctx.save();
  if (el.backgroundColor !== 'transparent') {
    ctx.fillStyle = el.backgroundColor;
    ctx.beginPath(); ctx.roundRect(el.x, el.y, el.width, el.height, 10); ctx.fill();
  }
  ctx.translate(el.x + MD_PAD, el.y + MD_PAD);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const L = layoutMarkdown(el);
  for (const op of L.ops) {
    if (op.k === 'text') {
      ctx.font = op.font;
      ctx.fillStyle = op.tone === 'fg' ? el.strokeColor : TONES[op.tone];
      ctx.fillText(op.t, op.x, op.y);
      if (op.u || op.s) {
        const w = ctx.measureText(op.t).width, sz = parseFloat(/(\d+(?:\.\d+)?)px/.exec(op.font)?.[1] || '16');
        ctx.fillRect(op.x, op.y + (op.u ? sz * 1.08 : sz * 0.55), w, Math.max(1, sz / 16));
      }
    } else if (op.k === 'rect') {
      if (op.fill) { ctx.fillStyle = op.fill; ctx.beginPath(); ctx.roundRect(op.x, op.y, op.w, op.h, op.r || 0); ctx.fill(); }
      if (op.stroke) { ctx.strokeStyle = op.stroke; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(op.x, op.y, op.w, op.h, op.r || 0); ctx.stroke(); }
    } else {
      ctx.strokeStyle = '#ced4da'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(op.x1, op.y1); ctx.lineTo(op.x2, op.y2); ctx.stroke();
    }
  }
  ctx.restore();
}
