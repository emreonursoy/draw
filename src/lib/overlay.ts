import type { AppState, DrawElement, Pt } from './types';
import { commonBounds, elBounds, elCenter, elCorners, isLinear, renderPoints } from './element';
import { rotatePt } from './utils';

export const ACCENT = '#6965db';
export interface SelBox { x1: number; y1: number; x2: number; y2: number; angle: number }

export function getSelBox(sel: DrawElement[]): SelBox | null {
  if (!sel.length) return null;
  if (sel.length === 1) {
    const [x1, y1, x2, y2] = elBounds(sel[0]);
    return { x1, y1, x2, y2, angle: sel[0].angle };
  }
  const [x1, y1, x2, y2] = commonBounds(sel);
  return { x1, y1, x2, y2, angle: 0 };
}

export function handlePositions(b: SelBox, zoom: number): Record<string, Pt> {
  const pad = 8 / zoom;
  const x1 = b.x1 - pad, y1 = b.y1 - pad, x2 = b.x2 + pad, y2 = b.y2 + pad;
  const c: Pt = [(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2];
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const raw: Record<string, Pt> = {
    nw: [x1, y1], n: [mx, y1], ne: [x2, y1], e: [x2, my], se: [x2, y2], s: [mx, y2], sw: [x1, y2], w: [x1, my],
    rot: [mx, y1 - 26 / zoom],
  };
  const out: Record<string, Pt> = {};
  for (const k in raw) out[k] = rotatePt(raw[k], c, b.angle);
  return out;
}

export function hitHandle(b: SelBox, p: Pt, zoom: number, singleLinear: boolean): string | null {
  const hs = handlePositions(b, zoom);
  const r = 8 / zoom;
  const tall = (b.y2 - b.y1) * zoom < 30, wide = (b.x2 - b.x1) * zoom < 30;
  for (const k in hs) {
    if (singleLinear) continue;
    if ((k === 'n' || k === 's') && wide) continue;
    if ((k === 'e' || k === 'w') && tall) continue;
    if (Math.hypot(p[0] - hs[k][0], p[1] - hs[k][1]) <= r) return k;
  }
  return null;
}

export interface OverlayInfo {
  app: AppState;
  selected: DrawElement[];
  boxSel: { x1: number; y1: number; x2: number; y2: number } | null;
  hoverBind: DrawElement | null;
  laser: [number, number, number][];
  dpr: number;
}

export function renderOverlay(canvas: HTMLCanvasElement, info: OverlayInfo) {
  const { app, selected, dpr } = info;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(dpr * app.zoom, dpr * app.zoom);
  ctx.translate(app.scrollX, app.scrollY);
  const z = app.zoom;
  ctx.lineWidth = 1.5 / z;
  ctx.strokeStyle = ACCENT;
  ctx.fillStyle = '#fff';

  if (info.hoverBind) {
    const e = info.hoverBind;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 4 / z;
    const c = elCenter(e);
    ctx.translate(c[0], c[1]);
    ctx.rotate(e.angle);
    ctx.translate(-c[0], -c[1]);
    ctx.strokeRect(e.x - 3 / z, e.y - 3 / z, e.width + 6 / z, e.height + 6 / z);
    ctx.restore();
  }

  if (!app.editing) {
    const box = getSelBox(selected);
    const singleLinear = selected.length === 1 && isLinear(selected[0]);
    if (box) {
      // per element outlines for multi selection
      if (selected.length > 1) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        for (const e of selected) {
          const cs = elCorners(e);
          ctx.beginPath();
          cs.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          ctx.closePath();
          ctx.stroke();
        }
        ctx.restore();
      }
      const pad = 8 / z;
      const c: Pt = [(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2];
      ctx.save();
      ctx.translate(c[0], c[1]);
      ctx.rotate(box.angle);
      ctx.translate(-c[0], -c[1]);
      if (!singleLinear || true) {
        ctx.setLineDash(singleLinear ? [6 / z, 4 / z] : []);
        ctx.strokeRect(box.x1 - pad, box.y1 - pad, box.x2 - box.x1 + pad * 2, box.y2 - box.y1 + pad * 2);
      }
      ctx.restore();
      if (!singleLinear) {
        const hs = handlePositions(box, z);
        const tall = (box.y2 - box.y1) * z < 30, wide = (box.x2 - box.x1) * z < 30;
        const s = 8 / z;
        for (const k in hs) {
          if ((k === 'n' || k === 's') && wide) continue;
          if ((k === 'e' || k === 'w') && tall) continue;
          const [hx, hy] = hs[k];
          ctx.beginPath();
          if (k === 'rot') ctx.arc(hx, hy, s * 0.6, 0, Math.PI * 2);
          else {
            ctx.save();
            ctx.translate(hx, hy);
            ctx.rotate(box.angle);
            ctx.rect(-s / 2, -s / 2, s, s);
            ctx.restore();
          }
          ctx.fill();
          ctx.stroke();
        }
      } else {
        const e = selected[0];
        const pts = e.points.map(([a, b]) => [a + e.x, b + e.y] as Pt);
        const rc = elCenter(e);
        const rot = (p: Pt) => (e.angle ? rotatePt(p, rc, e.angle) : p);
        // midpoints
        if (!(e.type === 'arrow' && e.arrowType === 'elbow')) {
          ctx.save();
          ctx.globalAlpha = 0.5;
          for (let i = 0; i < pts.length - 1; i++) {
            const m = rot([(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2]);
            ctx.beginPath(); ctx.arc(m[0], m[1], 4 / z, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          }
          ctx.restore();
        }
        for (const p0 of pts) {
          const p = rot(p0);
          ctx.beginPath(); ctx.arc(p[0], p[1], 5.5 / z, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
    }
  }

  if (info.boxSel) {
    const b = info.boxSel;
    ctx.save();
    ctx.fillStyle = 'rgba(105,101,219,0.1)';
    ctx.fillRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
    ctx.lineWidth = 1 / z;
    ctx.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
    ctx.restore();
  }

  if (info.laser.length > 1) {
    const now = performance.now();
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ff2d2d';
    for (let i = 1; i < info.laser.length; i++) {
      const age = now - info.laser[i][2];
      const a = Math.max(0, 1 - age / 900);
      ctx.globalAlpha = a;
      ctx.lineWidth = (3 + 5 * a) / z;
      ctx.beginPath();
      ctx.moveTo(info.laser[i - 1][0], info.laser[i - 1][1]);
      ctx.lineTo(info.laser[i][0], info.laser[i][1]);
      ctx.stroke();
    }
    ctx.restore();
  }
}
export { renderPoints };
