'use client';
import { useEffect, useRef, useState } from 'react';
import type { AppState, DrawElement } from '@/lib/types';
import { frameChildren, orderedFrames } from '@/lib/element';
import { DARK_FILTER, renderScene } from '@/lib/render';

export default function Presenter({ app, elements, onClose }: { app: AppState; elements: DrawElement[]; onClose: () => void }) {
  const frames = orderedFrames(elements);
  const [idx, setIdx] = useState(0);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const ref = useRef<HTMLCanvasElement>(null);
  const n = frames.length;

  useEffect(() => {
    try { document.documentElement.requestFullscreen?.(); } catch {}
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    const onFs = () => { if (!document.fullscreenElement) { /* keep presenting windowed */ } };
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); setIdx((i) => Math.min(n - 1, i + 1)); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
      else if (e.key === 'Home') setIdx(0);
      else if (e.key === 'End') setIdx(n - 1);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [n, onClose]);

  const f = frames[Math.min(idx, n - 1)];
  const pad = 32;
  const z = f ? Math.min((size.w - pad * 2) / f.width, (size.h - pad * 2) / f.height) : 1;
  const cw = f ? Math.floor(f.width * z) : 0, ch = f ? Math.floor(f.height * z) : 0;

  useEffect(() => {
    const c = ref.current;
    if (!c || !f) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = cw * dpr; c.height = ch * dpr;
    renderScene(c, frameChildren(f, elements), {
      scrollX: -f.x, scrollY: -f.y, zoom: z, width: cw, height: ch, dpr, bg: app.viewBg, grid: false,
      clip: [f.x, f.y, f.x + f.width, f.y + f.height], hideFrames: true, onImageLoad: () => setIdx((i) => i),
    });
  });

  if (!n) {
    return (
      <div className="presenter" onClick={onClose}>
        <p style={{ color: '#fff' }}>Add frames with the Frame tool (F) to build slides. Click to exit.</p>
      </div>
    );
  }
  return (
    <div className="presenter" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setIdx((i) => (e.clientX - r.left < r.width * 0.3 ? Math.max(0, i - 1) : Math.min(n - 1, i + 1))); }}>
      <canvas ref={ref} style={{ width: cw, height: ch, filter: app.theme === 'dark' ? DARK_FILTER : undefined, borderRadius: 4 }} />
      <div className="presenter-bar" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} aria-label="Previous slide">‹</button>
        <span>{Math.min(idx, n - 1) + 1} / {n}{f?.text ? ` · ${f.text}` : ''}</span>
        <button onClick={() => setIdx((i) => Math.min(n - 1, i + 1))} disabled={idx >= n - 1} aria-label="Next slide">›</button>
        <button onClick={onClose} aria-label="Exit presentation">Exit</button>
      </div>
    </div>
  );
}
