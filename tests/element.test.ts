import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '@/lib/types';
import {
  boundaryPoint, elBounds, frameChildren, groupSelect, hitElement, newElement, normalizeImported, orderedFrames,
  updateBoundArrows, withAbsPoints,
} from '@/lib/element';

const rect = (x: number, y: number, w: number, h: number, extra: any = {}) => ({ ...newElement('rectangle', x, y, DEFAULT_STYLE), width: w, height: h, ...extra });
const norm = (raw: any) => normalizeImported(raw, DEFAULT_STYLE);

describe('normalizeImported (untrusted data)', () => {
  it('rejects non-objects, deleted elements and unknown types', () => {
    expect(norm(null)).toBeNull();
    expect(norm('x')).toBeNull();
    expect(norm(5)).toBeNull();
    expect(norm({ type: 'rectangle', isDeleted: true })).toBeNull();
    expect(norm({ type: 'spaceship' })).toBeNull();
  });

  it('coerces bad numbers, colours and ids to safe defaults', () => {
    const el = norm({ type: 'rectangle', x: 'abc', y: {}, width: 'x', strokeColor: { evil: 1 }, backgroundColor: 'url(javascript:alert(1))', strokeWidth: -5, opacity: 500, fontSize: 'big', id: 42 })!;
    expect(el.x).toBe(0);
    expect(el.y).toBe(0);
    expect(el.width).toBe(0);
    expect(el.strokeColor).toBe(DEFAULT_STYLE.strokeColor);
    expect(el.backgroundColor).toBe('transparent');
    expect(el.strokeWidth).toBe(0.5);
    expect(el.opacity).toBe(100);
    expect(el.fontSize).toBe(20);
    expect(typeof el.id).toBe('string');
  });

  it('keeps valid colours', () => {
    const el = norm({ type: 'rectangle', strokeColor: '#e03131', backgroundColor: 'rgba(0, 0, 0, 0.5)' })!;
    expect(el.strokeColor).toBe('#e03131');
    expect(el.backgroundColor).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('filters malformed points and never leaves a linear element without points', () => {
    const el = norm({ type: 'line', points: [null, 's', [1, 2], [NaN, 3], [5, 6]] })!;
    expect(el.points).toEqual([[1, 2], [5, 6]]);
    expect(norm({ type: 'arrow', points: [null, 'x'] })!.points).toEqual([[0, 0]]);
  });

  it('caps text length and point count', () => {
    expect(norm({ type: 'text', text: 'a'.repeat(300_000) })!.text.length).toBe(200_000);
    const pts = Array.from({ length: 60_000 }, (_, i) => [i, i]);
    expect(norm({ type: 'freedraw', points: pts })!.points.length).toBe(50_000);
  });

  it('only accepts data:image URLs, and drops images without one', () => {
    expect(norm({ type: 'image', dataURL: 'https://evil.example/x.png' })).toBeNull();
    expect(norm({ type: 'image', dataURL: 'javascript:alert(1)' })).toBeNull();
    expect(norm({ type: 'image' })).toBeNull();
    const ok = norm({ type: 'image', dataURL: 'data:image/x-icon;base64,AAAA' })!;
    expect(ok.dataURL).toBe('data:image/x-icon;base64,AAAA');
    expect(norm({ type: 'rectangle', dataURL: 'https://evil.example' })!.dataURL).toBeUndefined();
  });

  it('maps over-long ids to short ids consistently so references stay linked', () => {
    const a = 'a'.repeat(100), b = 'b'.repeat(100), g = 'g'.repeat(80);
    const r1 = norm({ id: a, type: 'rectangle', groupIds: [g] })!;
    const r2 = norm({ id: b, type: 'rectangle', groupIds: [g] })!;
    const arrow = norm({ type: 'arrow', startBinding: { elementId: a }, endBinding: { elementId: b } })!;
    expect(r1.id.length).toBeLessThanOrEqual(64);
    expect(r1.id).not.toBe(r2.id);
    expect(r1.groupIds[0]).toBe(r2.groupIds[0]);
    expect(arrow.startBinding).toBe(r1.id);
    expect(arrow.endBinding).toBe(r2.id);
  });

  it('drops non-string group ids and whitelists arrowheads', () => {
    const el = norm({ type: 'arrow', groupIds: [1, {}, 'g1'], startArrowhead: { x: 1 }, endArrowhead: 'weird' })!;
    expect(el.groupIds).toEqual(['g1']);
    expect(el.startArrowhead).toBeNull();
    expect(el.endArrowhead).toBeNull();
    expect(norm({ type: 'arrow', endArrowhead: 'triangle' })!.endArrowhead).toBe('triangle');
    expect(norm({ type: 'arrow' })!.endArrowhead).toBe('arrow'); // default
  });

  it('sanitises comment threads', () => {
    const el = norm({ type: 'comment', thread: [{ text: 'hi', at: 5 }, null, { text: 7 }, { text: 'x'.repeat(9000) }] })!;
    expect(el.thread).toHaveLength(2);
    expect(el.thread![1].text.length).toBe(5000);
  });

  it('keeps the arrow type that was saved, falling back to roundness only for foreign data', () => {
    expect(norm({ type: 'arrow', arrowType: 'sharp', roundness: true })!.arrowType).toBe('sharp');
    expect(norm({ type: 'arrow', roundness: { type: 2 } })!.arrowType).toBe('round');
    expect(norm({ type: 'arrow', elbowed: true })!.arrowType).toBe('elbow');
  });

  it('never throws, whatever it is given', () => {
    const nasty: any[] = [{ type: 'rectangle', get x() { throw new Error('boom'); } }, { type: 'text', text: Symbol('s') }];
    for (const n of nasty) expect(() => norm(n)).not.toThrow();
  });
});

describe('geometry', () => {
  it('computes bounds for shapes and linear elements', () => {
    expect(elBounds(rect(10, 20, 30, 40))).toEqual([10, 20, 40, 60]);
    const line = withAbsPoints(newElement('line', 0, 0, DEFAULT_STYLE), [[5, 5], [25, -5]]);
    expect(line.x).toBe(5);
    expect(line.points[0]).toEqual([0, 0]);
    expect(elBounds(line)).toEqual([5, -5, 25, 5]);
  });

  it('hit-tests outlines of unfilled rectangles and the inside of filled ones', () => {
    const hollow = rect(0, 0, 100, 100);
    expect(hitElement(hollow, [50, 50], 6)).toBe(false);
    expect(hitElement(hollow, [0, 50], 6)).toBe(true);
    const filled = rect(0, 0, 100, 100, { backgroundColor: '#ffc9c9' });
    expect(hitElement(filled, [50, 50], 6)).toBe(true);
    expect(hitElement(filled, [200, 200], 6)).toBe(false);
  });

  it('hit-tests rotated elements in their own frame', () => {
    const r = rect(0, 0, 100, 20, { backgroundColor: '#fff', angle: Math.PI / 2 });
    // rotated 90° about (50,10): now roughly 20 wide and 100 tall around that centre
    expect(hitElement(r, [50, 55], 2)).toBe(true);
    expect(hitElement(r, [95, 10], 2)).toBe(false);
  });

  it('hit-tests ellipses, diamonds and line segments', () => {
    const e = { ...newElement('ellipse', 0, 0, DEFAULT_STYLE), width: 100, height: 100, backgroundColor: '#fff' };
    expect(hitElement(e, [50, 50], 4)).toBe(true);
    expect(hitElement(e, [2, 2], 0)).toBe(false); // corner of the box is outside the ellipse
    const d = { ...newElement('diamond', 0, 0, DEFAULT_STYLE), width: 100, height: 100, backgroundColor: '#fff' };
    expect(hitElement(d, [50, 50], 4)).toBe(true);
    expect(hitElement(d, [5, 5], 0)).toBe(false);
    const l = withAbsPoints(newElement('line', 0, 0, DEFAULT_STYLE), [[0, 0], [100, 0]]);
    expect(hitElement(l, [50, 3], 4)).toBe(true);
    expect(hitElement(l, [50, 30], 4)).toBe(false);
  });
});

describe('arrow bindings', () => {
  it('finds the outline point of a rectangle along a ray from its centre', () => {
    const r = rect(0, 0, 100, 100);
    const p = boundaryPoint(r, [300, 50], 0);
    expect(p[0]).toBeCloseTo(100);
    expect(p[1]).toBeCloseTo(50);
  });

  it('re-routes bound arrows when their shapes move', () => {
    const a = rect(0, 0, 100, 100, { id: 'A' });
    const b = rect(300, 0, 100, 100, { id: 'B' });
    const arrow = withAbsPoints({ ...newElement('arrow', 0, 0, DEFAULT_STYLE), id: 'AR', startBinding: 'A', endBinding: 'B' }, [[100, 50], [300, 50]]);
    const movedB = { ...b, y: 200 };
    const out = updateBoundArrows([a, movedB, arrow], new Set(['B']));
    const moved = out.find((e) => e.id === 'AR')!;
    const end = [moved.x + moved.points[moved.points.length - 1][0], moved.y + moved.points[moved.points.length - 1][1]];
    expect(end[1]).toBeGreaterThan(100); // follows B downward
    expect(out.find((e) => e.id === 'A')).toBe(a); // untouched elements keep identity
  });

  it('leaves arrows alone when none of their shapes moved', () => {
    const arrow = withAbsPoints({ ...newElement('arrow', 0, 0, DEFAULT_STYLE), id: 'AR', startBinding: 'A', endBinding: 'B' }, [[0, 0], [10, 10]]);
    const out = updateBoundArrows([arrow], new Set(['Z']));
    expect(out[0]).toBe(arrow);
  });
});

describe('frames and groups', () => {
  const frame = (name: string, x: number, y: number) => ({ ...newElement('frame', x, y, DEFAULT_STYLE), width: 200, height: 100, text: name });

  it('finds the elements whose centre lies inside a frame', () => {
    const f = frame('F', 0, 0);
    const inside = rect(20, 20, 20, 20);
    const outside = rect(500, 500, 20, 20);
    expect(frameChildren(f, [f, inside, outside]).map((e) => e.id)).toEqual([inside.id]);
  });

  it('orders frames by natural name, then position', () => {
    const a = frame('Frame 10', 0, 0), b = frame('Frame 2', 300, 0), c = frame('Frame 1', 600, 0);
    expect(orderedFrames([a, b, c]).map((f) => f.text)).toEqual(['Frame 1', 'Frame 2', 'Frame 10']);
  });

  it('selects the whole outermost group', () => {
    const g = rect(0, 0, 10, 10, { groupIds: ['inner', 'outer'] });
    const h = rect(20, 0, 10, 10, { groupIds: ['outer'] });
    const lone = rect(40, 0, 10, 10);
    expect(groupSelect([g, h, lone], g).sort()).toEqual([g.id, h.id].sort());
    expect(groupSelect([g, h, lone], lone)).toEqual([lone.id]);
  });
});

describe('embeds and closed polygons', () => {
  it('keeps only safe http(s) embed URLs and defaults the size', () => {
    const ok = norm({ type: 'embed', url: 'example.com/page' })!;
    expect(ok.url).toBe('https://example.com/page');
    expect(ok.width).toBe(640);
    expect(ok.height).toBe(400);
    expect(norm({ type: 'embed', url: 'javascript:alert(1)' })).toBeNull();
    expect(norm({ type: 'embed', url: 'data:text/html,hi' })).toBeNull();
    expect(norm({ type: 'embed' })).toBeNull();
    expect(norm({ type: 'embed', link: 'https://example.com' })!.url).toBe('https://example.com/');
  });

  it('only treats lines with at least three points as closed', () => {
    expect(norm({ type: 'line', closed: true, points: [[0, 0], [10, 0], [10, 10]] })!.closed).toBe(true);
    expect(norm({ type: 'line', closed: true, points: [[0, 0], [10, 0]] })!.closed).toBeUndefined();
    expect(norm({ type: 'rectangle', closed: true })!.closed).toBeUndefined();
  });

  it('hit-tests the inside of a filled closed polygon but not an open or unfilled one', () => {
    const tri = withAbsPoints({ ...newElement('line', 0, 0, DEFAULT_STYLE), closed: true, backgroundColor: '#ffc9c9' }, [[0, 0], [100, 0], [50, 100]]);
    expect(hitElement(tri, [50, 30], 2)).toBe(true);
    expect(hitElement(tri, [5, 90], 2)).toBe(false);
    const hollow = { ...tri, backgroundColor: 'transparent' };
    expect(hitElement(hollow, [50, 30], 2)).toBe(false);
    expect(hitElement(hollow, [50, 0], 2)).toBe(true); // outline still hits
    // the closing edge counts even though it has no stored point
    expect(hitElement(hollow, [25, 50], 2)).toBe(true);
  });

  it('hit-tests embeds like images (the whole box)', () => {
    const e = norm({ type: 'embed', url: 'https://example.com', x: 10, y: 10, width: 200, height: 100 })!;
    expect(hitElement(e, [100, 60], 2)).toBe(true);
    expect(hitElement(e, [500, 500], 2)).toBe(false);
  });
});
