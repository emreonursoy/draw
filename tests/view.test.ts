import { describe, expect, it } from 'vitest';
import { revealView } from '@/lib/view';

describe('revealView', () => {
  const box: [number, number, number, number] = [100, 100, 200, 130];

  it('zooms in to a readable level when the canvas is zoomed far out', () => {
    expect(revealView(box, 800, 600, 0.2).zoom).toBe(1);
  });

  it('keeps a closer zoom that is already readable', () => {
    expect(revealView(box, 800, 600, 2).zoom).toBe(2);
  });

  it('zooms out only as far as needed for a box larger than the view', () => {
    const z = revealView([0, 0, 4000, 3000], 800, 600, 1).zoom;
    expect(z).toBeLessThan(0.3);
    expect(z).toBeGreaterThanOrEqual(0.1);
  });

  it('centres the box in the visible area', () => {
    const v = revealView(box, 800, 600, 1);
    expect((150 + v.scrollX) * v.zoom).toBeCloseTo(400);
    expect((115 + v.scrollY) * v.zoom).toBeCloseTo(300);
  });
});
