import type { DrawElement, Style } from './types';
import { commonBounds, fitText, frameChildren, measureText, newElement, orderedFrames } from './element';
import { parseMermaid } from './mermaid';
import { uid } from './utils';

const WIDTH = 640;
const GAP = 18;

const inline = (s: string) =>
  s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n');

function wrap(text: string, size: number, family: 1 | 2 | 3, width: number, indent = ''): string {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measureText(indent + next, size, family).w > width) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out.map((l, i) => (i ? indent : '') + l).join('\n');
}

/** Turn Markdown into positioned canvas elements (stacked top to bottom from 0,0). */
export function parseMarkdown(src: string, base: Style): DrawElement[] {
  const out: DrawElement[] = [];
  let y = 0;
  const text = (t: string, size: number, family: 1 | 2 | 3 = 2, color = base.strokeColor, x = 0) => {
    const el = fitText(newElement('text', x, y, { ...base, fontSize: size, fontFamily: family, strokeColor: color }, { text: t }));
    out.push(el);
    y += el.height + GAP;
    return el;
  };
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    // fenced code
    const fence = /^\s*(```|~~~)\s*([\w-]*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      if (fence[2].toLowerCase() === 'mermaid') {
        const r = parseMermaid(body.join('\n'), base);
        if (r.elements?.length) {
          const [x1, y1, x2, y2] = commonBounds(r.elements);
          const map = new Map(r.elements.map((e) => [e.id, uid()]));
          for (const e of r.elements) {
            out.push({ ...e, id: map.get(e.id)!, x: e.x - x1, y: e.y - y1 + y, startBinding: e.startBinding ? map.get(e.startBinding) ?? null : null, endBinding: e.endBinding ? map.get(e.endBinding) ?? null : null });
          }
          y += y2 - y1 + GAP * 2;
          continue;
        }
      }
      const code = body.join('\n') || ' ';
      const m = measureText(code, 15, 3);
      const w = m.w + 28, h = m.h + 24;
      out.push(newElement('rectangle', 0, y, { ...base, backgroundColor: '#f1f3f5', fillStyle: 'solid', strokeColor: '#ced4da', strokeWidth: 1, roughness: 0, roundness: true }, { width: w, height: h }));
      out.push(fitText(newElement('text', 14, y + 12, { ...base, fontSize: 15, fontFamily: 3 }, { text: code })));
      y += h + GAP;
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) { text(inline(h[2]), [40, 32, 26, 22, 20, 18][h[1].length - 1], 2); i++; continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push({ ...newElement('line', 0, y + 4, { ...base, strokeColor: '#adb5bd', roughness: 0, arrowType: 'sharp' }), points: [[0, 0], [WIDTH, 0]], width: WIDTH });
      y += GAP + 8; i++; continue;
    }
    if (/^\s*>/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      text('▎ ' + wrap(inline(q.join(' ')), 18, 2, WIDTH - 24, '▎ '), 18, 2, '#6b6b76');
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] || '')) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        if (!/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim())));
        i++;
      }
      const cols = Math.max(...rows.map((r) => r.length));
      const wds = Array.from({ length: cols }, (_, c) => Math.max(...rows.map((r) => (r[c] || '').length)));
      const fmt = (r: string[]) => wds.map((w, c) => (r[c] || '').padEnd(w)).join('  │  ');
      const body = [fmt(rows[0]), wds.map((w) => '─'.repeat(w)).join('──┼──'), ...rows.slice(1).map(fmt)];
      text(body.join('\n'), 15, 3);
      continue;
    }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        const depth = Math.floor(m[1].replace(/\t/g, '  ').length / 2);
        let content = inline(m[3]);
        const task = /^\[( |x|X)\]\s+(.*)$/.exec(content);
        if (task) content = (task[1] === ' ' ? '☐ ' : '☑ ') + task[2];
        const marker = /^\d/.test(m[2]) ? m[2] + ' ' : task ? '' : '• ';
        items.push(wrap(content, 18, 2, WIDTH - 30 - depth * 24, '    ' + '  '.repeat(depth)).replace(/^/, '  '.repeat(depth) + marker));
        i++;
      }
      text(items.join('\n'), 18, 2);
      continue;
    }
    // paragraph
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(\s*(```|~~~)|#{1,6}\s|\s*>|\s*([-*+]|\d+[.)])\s)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) { para.push(lines[i++]); }
    text(wrap(inline(para.join(' ')), 18, 2, WIDTH), 18, 2);
  }
  return out;
}

/* ---------------- export ---------------- */
const isShape = (e: DrawElement) => (e.type === 'rectangle' || e.type === 'diamond' || e.type === 'ellipse') && !!e.text.trim();

function mermaidFor(els: DrawElement[]): string[] {
  const nodes = els.filter(isShape);
  const ids = new Map(nodes.map((n, i) => [n.id, 'N' + (i + 1)]));
  const edges = els.filter((e) => e.type === 'arrow' && e.startBinding && e.endBinding && ids.has(e.startBinding) && ids.has(e.endBinding));
  if (!edges.length) return [];
  const used = new Set<string>();
  edges.forEach((e) => { used.add(e.startBinding!); used.add(e.endBinding!); });
  const lab = (t: string) => t.replace(/\n/g, '<br/>').replace(/"/g, "'");
  const def = (n: DrawElement) => {
    const id = ids.get(n.id)!, l = `"${lab(n.text)}"`;
    return n.type === 'diamond' ? `${id}{${l}}` : n.type === 'ellipse' ? `${id}((${l}))` : n.roundness ? `${id}(${l})` : `${id}[${l}]`;
  };
  const defined = new Set<string>();
  const ref = (id: string) => {
    const n = nodes.find((x) => x.id === id)!;
    if (defined.has(id)) return ids.get(id)!;
    defined.add(id);
    return def(n);
  };
  const body = edges.map((e) => {
    const op = e.strokeStyle === 'solid' ? (e.endArrowhead ? '-->' : '---') : e.endArrowhead ? '-.->' : '-.-';
    const label = e.text.trim() ? `|${lab(e.text)}|` : '';
    return `  ${ref(e.startBinding!)} ${op}${label} ${ref(e.endBinding!)}`;
  });
  return ['```mermaid', 'flowchart TD', ...body, '```'];
}

function textBlock(t: DrawElement, shift: number): string {
  if (t.type === 'markdown') return t.text.trim();
  const body = t.text.trim();
  const lvl = t.fontSize >= 36 ? 1 : t.fontSize >= 28 ? 2 : t.fontSize >= 22 ? 3 : 0;
  const ls = body.split('\n');
  if (t.fontFamily === 3) {
    if (ls.length >= 2 && ls.some((l) => l.includes('│')) && /^[─┼\s]+$/.test(ls[1])) {
      const rows = ls.filter((_, i) => i !== 1).map((l) => l.split('│').map((c) => c.trim()));
      const cols = Math.max(...rows.map((r) => r.length));
      const row = (r: string[]) => '| ' + Array.from({ length: cols }, (_, i) => r[i] ?? '').join(' | ') + ' |';
      return [row(rows[0]), '|' + ' --- |'.repeat(cols), ...rows.slice(1).map(row)].join('\n');
    }
    return '```\n' + t.text.replace(/\s+$/, '') + '\n```';
  }
  if (lvl && ls.length === 1) return `${'#'.repeat(Math.min(6, lvl + shift))} ${body}`;
  if (ls.every((l) => l.startsWith('▎'))) return ls.map((l) => '> ' + l.replace(/^▎\s?/, '')).join('\n');
  const listy = ls.every((l) => !l.trim() || /^\s*[•☐☑]|^\s*\d+[.)] /.test(l) || /^\s{2,}/.test(l));
  return listy ? ls.map((l) => l.replace(/^(\s*)•\s?/, '$1- ').replace(/^(\s*)☐\s?/, '$1- [ ] ').replace(/^(\s*)☑\s?/, '$1- [x] ')).join('\n') : ls.join('\n');
}

export function toMarkdown(all: DrawElement[], title?: string): string {
  const els = all.filter((e) => e.type !== 'comment');
  const frames = orderedFrames(els);
  const sections = frames.length
    ? frames.map((f) => ({ title: f.text || 'Untitled frame', els: frameChildren(f, els) }))
    : [{ title: '', els: els.filter((e) => e.type !== 'frame') }];
  const hasH1 = els.some((e) => (e.type === 'text' && e.fontSize >= 36) || (e.type === 'markdown' && /^# /m.test(e.text)));
  const useTitle = !!title && !hasH1;
  const out: string[] = [];
  if (useTitle) out.push(`# ${title}`, '');
  const shift = (useTitle ? 1 : 0) + (frames.length ? 1 : 0);
  for (const s of sections) {
    if (s.title) out.push(`${'#'.repeat(useTitle ? 2 : 1)} ${s.title}`, '');
    const used = new Set<string>();
    s.els.forEach((e) => { if (e.type === 'arrow') { if (e.startBinding) used.add(e.startBinding); if (e.endBinding) used.add(e.endBinding); } });
    const items: { y: number; text: string }[] = [];
    for (const t of s.els.filter((e) => (e.type === 'text' || e.type === 'markdown') && e.text.trim())) items.push({ y: t.y, text: textBlock(t, shift) });
    const diagram = mermaidFor(s.els);
    if (diagram.length) items.push({ y: Math.min(...s.els.filter((e) => used.has(e.id)).map((e) => e.y)), text: diagram.join('\n') });
    for (const e of s.els.filter((e) => isShape(e) && !used.has(e.id))) items.push({ y: e.y, text: `- ${e.text.replace(/\n/g, ' ')}` });
    for (const e of s.els.filter((e) => e.type === 'line' && e.points.length === 2 && Math.abs(e.points[1][1]) < 2 && Math.abs(e.points[1][0]) > 400)) items.push({ y: e.y, text: '---' });
    items.sort((a, b) => a.y - b.y);
    items.forEach((it) => out.push(it.text, ''));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
