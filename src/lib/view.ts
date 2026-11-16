import { clamp } from './utils';

export interface ViewState { zoom: number; scrollX: number; scrollY: number }

/** Never zoom in past this just to reveal something: 100% is where text is comfortably readable. */
export const REVEAL_ZOOM = 1;

/**
 * The view that brings a box (scene coordinates) to the centre of the visible area.
 * Zooms in to a readable level when the canvas is zoomed far out, keeps a closer zoom as it is,
 * and zooms out only as far as needed when the box is bigger than the visible area.
 */
export function revealView(box: [number, number, number, number], viewW: number, viewH: number, zoom: number, pad = 60): ViewState {
  const [x1, y1, x2, y2] = box;
  const fit = clamp(Math.min(viewW / (x2 - x1 + pad * 2), viewH / (y2 - y1 + pad * 2)), 0.1, 30);
  const z = Math.min(fit, Math.max(zoom, REVEAL_ZOOM));
  return { zoom: z, scrollX: viewW / 2 / z - (x1 + x2) / 2, scrollY: viewH / 2 / z - (y1 + y2) / 2 };
}
