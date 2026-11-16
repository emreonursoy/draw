import { beforeEach, vi } from 'vitest';

// jsdom has no canvas, but the element model measures text through a 2D context. A deterministic stub
// (8px per character) is enough for layout-dependent assertions.
const ctx = {
  font: '',
  measureText: (t: string) => ({ width: t.length * 8 }),
};
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as any;
}

beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
