import { describe, expect, it } from 'vitest';
import type { Pt } from '@/lib/types';
import { rdp, recognizeShape, resample } from '@/lib/shape';

/** Deterministic pseudo-random wobble so tests don't flake. */
const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
const jitter = (pts: Pt[], amount: number, seed = 7): Pt[] => { const r = rng(seed); return pts.map(([x, y]) => [x + r() * amount, y + r() * amount] as Pt); };
const poly = (vertices: Pt[], perEdge = 30): Pt[] => {
  const out: Pt[] = [];
  vertices.forEach((v, i) => {
    const n = vertices[(i + 1) % vertices.length];
    for (let k = 0; k < perEdge; k++) out.push([v[0] + ((n[0] - v[0]) * k) / perEdge, v[1] + ((n[1] - v[1]) * k) / perEdge]);
  });
  out.push(vertices[0]);
  return out;
};
const ellipse = (cx: number, cy: number, a: number, b: number, n = 90): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => [cx + a * Math.cos((i / n) * 2 * Math.PI), cy + b * Math.sin((i / n) * 2 * Math.PI)] as Pt);

describe('helpers', () => {
  it('resamples to evenly spaced points', () => {
    const r = resample([[0, 0], [100, 0]], 11);
    expect(r).toHaveLength(11);
    expect(r[5][0]).toBeCloseTo(50);
    expect(r[10][0]).toBeCloseTo(100);
  });

  it('simplifies a polyline to its corners', () => {
    const l: Pt[] = [[0, 0], [50, 0.5], [100, 0], [100, 50], [100, 100]];
    expect(rdp(l, 2)).toEqual([[0, 0], [100, 0], [100, 100]]);
  });
});

describe('recognizeShape', () => {
  it('recognises a wobbly straight line and snaps near-horizontal to horizontal', () => {
    const line: Pt[] = Array.from({ length: 40 }, (_, i) => [i * 5, i * 0.4] as Pt);
    const r = recognizeShape(jitter(line, 2))!;
    expect(r.kind).toBe('line');
    expect(r.points![1][1]).toBeCloseTo(r.points![0][1]); // snapped flat
    expect(r.width).toBeGreaterThan(150);
  });

  it('recognises a diagonal line without snapping it', () => {
    const line: Pt[] = Array.from({ length: 40 }, (_, i) => [i * 4, i * 4] as Pt);
    const r = recognizeShape(jitter(line, 2))!;
    expect(r.kind).toBe('line');
    expect(r.height).toBeGreaterThan(100);
  });

  it('recognises a rectangle (even with a small gap and wobble)', () => {
    const rect = poly([[10, 10], [210, 10], [210, 130], [10, 130]]).slice(0, -6);
    const r = recognizeShape(jitter(rect, 4))!;
    expect(r.kind).toBe('rectangle');
    expect(r.x).toBeCloseTo(10, -1);
    expect(r.width).toBeGreaterThan(190);
    expect(r.height).toBeGreaterThan(110);
  });

  it('recognises a circle and an ellipse', () => {
    expect(recognizeShape(jitter(ellipse(100, 100, 60, 60), 4))!.kind).toBe('ellipse');
    const e = recognizeShape(jitter(ellipse(200, 80, 120, 50), 4))!;
    expect(e.kind).toBe('ellipse');
    expect(e.width).toBeGreaterThan(200);
  });

  it('recognises a diamond', () => {
    const d = poly([[100, 0], [200, 70], [100, 140], [0, 70]]);
    expect(recognizeShape(jitter(d, 4))!.kind).toBe('diamond');
  });

  it('recognises a triangle and returns its three corners', () => {
    const t = poly([[100, 0], [200, 150], [0, 150]]);
    const r = recognizeShape(jitter(t, 4))!;
    expect(r.kind).toBe('triangle');
    expect(r.points).toHaveLength(3);
  });

  it('always guesses the closest shape, even for scribbles and open arcs', () => {
    const r = rng(3);
    const scribble: Pt[] = Array.from({ length: 80 }, () => [r() * 200, r() * 200] as Pt);
    expect(recognizeShape(scribble)).not.toBeNull();
    const arc: Pt[] = ellipse(100, 100, 80, 80, 60).slice(0, 30); // half circle
    expect(recognizeShape(arc)).not.toBeNull();
    const thin: Pt[] = Array.from({ length: 30 }, (_, i) => [i * 6, (i % 2) * 3] as Pt);
    expect(recognizeShape(thin)!.kind).toBe('line');
  });

  it('refuses dots and tiny strokes', () => {
    expect(recognizeShape([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5]])).toBeNull();
    expect(recognizeShape([[0, 0]])).toBeNull();
    expect(recognizeShape([])).toBeNull();
  });

  it('is independent of drawing speed (point density)', () => {
    const dense = ellipse(100, 100, 60, 60, 400);
    const sparse = ellipse(100, 100, 60, 60, 24);
    expect(recognizeShape(dense)!.kind).toBe('ellipse');
    expect(recognizeShape(sparse)!.kind).toBe('ellipse');
  });
});
