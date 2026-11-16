import { describe, expect, it } from 'vitest';
import { dilate, floodRegion, simplifyLoop, traceContour } from '@/lib/fill';

/** Builds a w×h barrier grid from ASCII art: '#' is a barrier, anything else is free. */
const grid = (rows: string[]) => ({ w: rows[0].length, h: rows.length, data: Uint8Array.from(rows.join('').split('').map((c) => (c === '#' ? 1 : 0))) });

describe('floodRegion', () => {
  const box = grid([
    '..........',
    '..######..',
    '..#....#..',
    '..#....#..',
    '..######..',
    '..........',
  ]);

  it('fills an enclosed area and reports it as closed', () => {
    const r = floodRegion(box.data, box.w, box.h, 4, 2)!;
    expect(r.open).toBe(false);
    expect(r.area).toBe(8);
  });

  it('reports the outside as open (it touches the image edge)', () => {
    const r = floodRegion(box.data, box.w, box.h, 0, 0)!;
    expect(r.open).toBe(true);
  });

  it('refuses to start on a barrier or outside the image', () => {
    expect(floodRegion(box.data, box.w, box.h, 2, 1)).toBeNull();
    expect(floodRegion(box.data, box.w, box.h, -1, 0)).toBeNull();
    expect(floodRegion(box.data, box.w, box.h, 99, 0)).toBeNull();
  });

  it('leaks out of a shape that has a gap', () => {
    const open = grid([
      '..........',
      '..######..',
      '..#....#..',
      '..#.......',
      '..######..',
      '..........',
    ]);
    // the right wall has a gap on row 3, so the fill escapes to the image edge
    expect(floodRegion(open.data, open.w, open.h, 4, 2)!.open).toBe(true);
  });
});

describe('dilate', () => {
  it('seals a one-pixel gap in a wall', () => {
    const g = grid([
      '..#.#..',
      '..#.#..',
    ]);
    const before = floodRegion(g.data, g.w, g.h, 3, 0)!;
    expect(before.area).toBe(2);
    const d = dilate(g.data, g.w, g.h, 1);
    expect(floodRegion(d, g.w, g.h, 3, 0)).toBeNull(); // the gap itself became a barrier
  });
});

describe('traceContour', () => {
  it('traces the outline of a filled rectangle', () => {
    const g = grid([
      '........',
      '..####..',
      '..####..',
      '..####..',
      '........',
    ]);
    const mask = Uint8Array.from(g.data);
    const loop = traceContour(mask, g.w, g.h);
    const xs = loop.map((p) => p[0]), ys = loop.map((p) => p[1]);
    expect(Math.min(...xs)).toBe(2.5);
    expect(Math.max(...xs)).toBe(5.5);
    expect(Math.min(...ys)).toBe(1.5);
    expect(Math.max(...ys)).toBe(3.5);
    expect(loop.length).toBe(10); // boundary pixels of a 4×3 block
  });

  it('returns nothing for an empty mask and one point for a lone pixel', () => {
    expect(traceContour(new Uint8Array(9), 3, 3)).toEqual([]);
    const lone = new Uint8Array(9); lone[4] = 1;
    expect(traceContour(lone, 3, 3)).toEqual([[1.5, 1.5]]);
  });
});

describe('simplifyLoop', () => {
  it('reduces a dense rectangle outline to about its four corners', () => {
    const loop: [number, number][] = [];
    for (let x = 0; x < 40; x++) loop.push([x, 0]);
    for (let y = 0; y < 20; y++) loop.push([40, y]);
    for (let x = 40; x > 0; x--) loop.push([x, 20]);
    for (let y = 20; y > 0; y--) loop.push([0, y]);
    const s = simplifyLoop(loop, 1);
    expect(s.length).toBeGreaterThanOrEqual(4);
    expect(s.length).toBeLessThanOrEqual(6);
  });
});
