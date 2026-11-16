'use client';
import { useEffect, useRef } from 'react';
import type { AppState, DrawElement } from '@/lib/types';
import { DARK_FILTER } from '@/lib/render';
import { fontString, LINE_HEIGHT, measureText } from '@/lib/element';

export default function TextEditor({ el, app, dark, onCommit }: { el: DrawElement; app: AppState; dark: boolean; onCommit: (t: string | null) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const isFrame = el.type === 'frame';
  const isLabel = el.type !== 'text' && !isFrame;
  const fs = isFrame ? 14 : el.fontSize;
  const ff = (isFrame ? 2 : el.fontFamily) as 1 | 2 | 3;
  const z = app.zoom;
  const fit = () => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.width = '0px';
    ta.style.height = '0px';
    ta.style.width = Math.max(ta.scrollWidth + 4, 8) + 'px';
    ta.style.height = ta.scrollHeight + 'px';
  };
  useEffect(() => {
    const ta = ref.current!;
    ta.value = el.text;
    fit();
    const t = setTimeout(() => { ta.focus(); if (isFrame) ta.select(); else ta.setSelectionRange(ta.value.length, ta.value.length); }, 10);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onCommit(v);
  };
  let cx: number, cy: number;
  const m = measureText(el.text || ' ', fs, ff);
  if (isLabel) {
    const bx = el.type === 'arrow' ? null : { x: el.x + el.width / 2, y: el.y + el.height / 2 };
    const mid = bx ?? { x: el.x + el.points[Math.floor(el.points.length / 2)][0], y: el.y + el.points[Math.floor(el.points.length / 2)][1] };
    cx = (mid.x + app.scrollX) * z; cy = (mid.y + app.scrollY) * z;
  } else if (isFrame) { cx = (el.x + app.scrollX) * z; cy = (el.y + app.scrollY) * z - (14 * 1.25 + 6) * z; }
  else { cx = (el.x + app.scrollX) * z; cy = (el.y + app.scrollY) * z; }
  void m;
  return (
    <div className="text-editor-wrap" style={{ filter: dark ? DARK_FILTER : undefined }}>
      <textarea
        id="draw-text-editor"
        ref={ref}
        className="text-editor"
        wrap="off"
        spellCheck={false}
        style={{
          left: cx, top: cy, font: fontString(fs * z, ff), lineHeight: LINE_HEIGHT, color: isFrame ? '#868e96' : el.strokeColor,
          textAlign: isLabel ? 'center' : el.textAlign, transform: isLabel ? 'translate(-50%, -50%)' : undefined, opacity: el.opacity / 100,
        }}
        onInput={fit}
        onBlur={() => finish(null)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); finish(null); }
        }}
      />
    </div>
  );
}
