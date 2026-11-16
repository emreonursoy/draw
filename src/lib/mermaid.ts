import type { DrawElement, Pt, Style } from './types';
import { measureText, newElement, updateBoundArrows, withAbsPoints } from './element';

type Shape = 'rect' | 'round' | 'ellipse' | 'diamond';
interface Node { id: string; label: string; shape: Shape; rank: number; w: number; h: number; x: number; y: number }
interface Edge { from: string; to: string; label: string; dashed: boolean; thick: boolean; arrow: boolean }

const clean = (t: string) => t.trim().replace(/^"(.*)"$/, '$1').replace(/<br\s*\/?>/gi, '\n');
const NODE = /^\s*([A-Za-z_][\w-]*)(?:\(\(([^)]*)\)\)|\(\[([^\]]*)\]\)|\[\[([^\]]*)\]\]|\[([^\]]*)\]|\{\{([^}]*)\}\}|\{([^}]*)\}|\(([^)]*)\))?/;
const EDGE = /^\s*(<?(?:-\.+->|-\.+-|==+>|===+|--+>|---+|--[xo]))\s*(?:\|([^|]*)\|)?/;

function parseFlow(lines: string[], dir: string, style: Style): DrawElement[] | null {
  const nodes = new Map<string, Node>();
  const edges: Edge[] = [];
  const touch = (m: RegExpExecArray): string => {
    const id = m[1];
    const text = m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? m[7] ?? m[8];
    const shape: Shape = m[2] !== undefined || m[6] !== undefined ? 'ellipse' : m[7] !== undefined ? 'diamond' : m[8] !== undefined || m[3] !== undefined ? 'round' : 'rect';
    const ex = nodes.get(id);
    if (!ex) nodes.set(id, { id, label: text !== undefined ? clean(text) : id, shape, rank: 0, w: 0, h: 0, x: 0, y: 0 });
    else if (text !== undefined) { ex.label = clean(text); ex.shape = shape; }
    return id;
  };
  for (let raw of lines) {
    raw = raw.replace(/--\s+([^->|]+?)\s+-->/g, '-->|$1|').trim();
    if (!raw || /^(%%|subgraph|end\b|classDef|class\b|style|click|linkStyle|direction)/.test(raw)) continue;
    let rest = raw;
    const m0 = NODE.exec(rest);
    if (!m0) continue;
    let prev = touch(m0);
    rest = rest.slice(m0[0].length);
    for (;;) {
      const e = EDGE.exec(rest);
      if (!e) break;
      rest = rest.slice(e[0].length);
      const n = NODE.exec(rest);
      if (!n) break;
      const id = touch(n);
      rest = rest.slice(n[0].length);
      edges.push({ from: prev, to: id, label: e[2] ? clean(e[2]) : '', dashed: e[1].includes('.'), thick: e[1].includes('='), arrow: e[1].includes('>') });
      prev = id;
    }
  }
  if (!nodes.size) return null;
  // ranks: longest path, ignoring back edges
  const out = new Map<string, string[]>();
  edges.forEach((e) => out.set(e.from, [...(out.get(e.from) || []), e.to]));
  const state = new Map<string, number>();
  const back = new Set<string>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const t of out.get(id) || []) {
      if (state.get(t) === 1) back.add(id + '>' + t);
      else if (!state.has(t)) visit(t);
    }
    state.set(id, 2);
  };
  nodes.forEach((_, id) => { if (!state.has(id)) visit(id); });
  const dag = edges.filter((e) => !back.has(e.from + '>' + e.to));
  for (let i = 0; i < nodes.size; i++) for (const e of dag) nodes.get(e.to)!.rank = Math.max(nodes.get(e.to)!.rank, nodes.get(e.from)!.rank + 1);
  // sizes
  nodes.forEach((n) => {
    const m = measureText(n.label, 20, 1);
    n.w = Math.max(130, m.w + 40); n.h = Math.max(60, m.h + 30);
    if (n.shape === 'diamond') { n.w *= 1.5; n.h *= 1.7; }
    if (n.shape === 'ellipse') { n.w *= 1.2; n.h *= 1.2; }
  });
  const horiz = dir === 'LR' || dir === 'RL';
  const ranks = new Map<number, Node[]>();
  nodes.forEach((n) => ranks.set(n.rank, [...(ranks.get(n.rank) || []), n]));
  const sorted = [...ranks.keys()].sort((a, b) => a - b);
  let pos = 0;
  for (const r of sorted) {
    const row = ranks.get(r)!;
    const depth = Math.max(...row.map((n) => (horiz ? n.w : n.h)));
    const span = row.reduce((t, n) => t + (horiz ? n.h : n.w) + 50, -50);
    let cur = -span / 2;
    for (const n of row) {
      const lat = horiz ? n.h : n.w;
      const center = cur + lat / 2;
      if (horiz) { n.x = pos + (depth - n.w) / 2; n.y = center - n.h / 2; } else { n.x = center - n.w / 2; n.y = pos + (depth - n.h) / 2; }
      cur += lat + 50;
    }
    pos += depth + (edges.some((e) => e.label) ? 110 : 80);
  }
  if (dir === 'BT') { const maxY = Math.max(...[...nodes.values()].map((n) => n.y + n.h)); nodes.forEach((n) => (n.y = maxY - n.y - n.h)); }
  if (dir === 'RL') { const maxX = Math.max(...[...nodes.values()].map((n) => n.x + n.w)); nodes.forEach((n) => (n.x = maxX - n.x - n.w)); }

  const els: DrawElement[] = [];
  nodes.forEach((n) => {
    const type = n.shape === 'diamond' ? 'diamond' : n.shape === 'ellipse' ? 'ellipse' : 'rectangle';
    els.push({ ...newElement(type, n.x, n.y, { ...style, roundness: n.shape === 'round' || n.shape === 'rect' ? n.shape === 'round' : true }, { id: 'mm_' + n.id, text: n.label, width: n.w, height: n.h, fontSize: 20, fontFamily: 1 }) });
  });
  edges.forEach((e, i) => {
    const a = nodes.get(e.from)!, b = nodes.get(e.to)!;
    const ca: Pt = [a.x + a.w / 2, a.y + a.h / 2], cb: Pt = [b.x + b.w / 2, b.y + b.h / 2];
    const base = newElement('arrow', ca[0], ca[1], style, {
      id: 'mmedge_' + i, text: e.label, fontSize: 16, fontFamily: 1, arrowType: 'sharp', endArrowhead: e.arrow ? 'arrow' : null, startArrowhead: null,
      strokeStyle: e.dashed ? 'dashed' : 'solid', strokeWidth: e.thick ? 4 : 2, startBinding: 'mm_' + e.from, endBinding: 'mm_' + e.to,
    });
    els.push(withAbsPoints(base, e.from === e.to ? [[ca[0] + a.w / 2, ca[1] - 10], [ca[0] + a.w / 2 + 40, ca[1] + 10]] : [ca, cb]));
  });
  return updateBoundArrows(els, new Set(els.filter((e) => e.type !== 'arrow').map((e) => e.id)));
}

function parseSequence(lines: string[], style: Style): DrawElement[] | null {
  const names = new Map<string, string>();
  const order: string[] = [];
  const add = (id: string, label?: string) => { if (!names.has(id)) { names.set(id, label ?? id); order.push(id); } else if (label) names.set(id, label); };
  const msgs: { from: string; to: string; text: string; dashed: boolean; arrow: boolean }[] = [];
  for (const raw of lines) {
    const l = raw.trim();
    let m = /^(?:participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/.exec(l);
    if (m) { add(m[1], m[2] && clean(m[2])); continue; }
    m = /^(\S+?)\s*(-->>|->>|-->|->|--x|-x|--\)|-\))\s*(\S+?)\s*:\s*(.*)$/.exec(l);
    if (m) { add(m[1]); add(m[3]); msgs.push({ from: m[1], to: m[3], text: clean(m[4]), dashed: m[2].startsWith('--'), arrow: m[2].includes('>') }); }
  }
  if (!order.length) return null;
  const els: DrawElement[] = [];
  const gap = 220, topH = 50;
  const total = 120 + msgs.length * 60;
  order.forEach((id, i) => {
    const w = Math.max(140, measureText(names.get(id)!, 20, 1).w + 30);
    els.push(newElement('rectangle', i * gap - w / 2, 0, style, { text: names.get(id)!, width: w, height: topH, fontSize: 20, fontFamily: 1 }));
    els.push(withAbsPoints(newElement('line', i * gap, topH, { ...style, strokeStyle: 'dashed', arrowType: 'sharp', strokeColor: '#868e96' } as Style), [[i * gap, topH], [i * gap, topH + total]]));
  });
  msgs.forEach((m, i) => {
    const y = topH + 50 + i * 60, a = order.indexOf(m.from) * gap, b = order.indexOf(m.to) * gap;
    const pts: Pt[] = a === b ? [[a, y - 12], [a + 60, y + 12]] : [[a, y], [b, y]];
    els.push(withAbsPoints(newElement('arrow', a, y, style, { text: m.text, fontSize: 16, fontFamily: 1, arrowType: 'sharp', endArrowhead: m.arrow ? 'arrow' : null, strokeStyle: m.dashed ? 'dashed' : 'solid' }), pts));
  });
  return els;
}

export function parseMermaid(text: string, style: Style): { elements: DrawElement[] | null; kind: string } {
  const lines = text.split(/\r?\n|;/).map((l) => l.replace(/%%.*$/, '')).filter((l) => l.trim());
  if (!lines.length) return { elements: null, kind: '' };
  const head = lines[0].trim();
  const f = /^(?:graph|flowchart)\s*(TD|TB|BT|LR|RL)?/i.exec(head);
  if (f) return { elements: parseFlow(lines.slice(1), (f[1] || 'TD').toUpperCase().replace('TB', 'TD'), style), kind: 'flowchart' };
  if (/^sequenceDiagram/i.test(head)) return { elements: parseSequence(lines.slice(1), style), kind: 'sequence diagram' };
  return { elements: null, kind: head.split(/\s+/)[0] };
}
