'use client';
import { useMemo, useState } from 'react';
import type { AppState, DrawElement } from '@/lib/types';
import { exportCanvas, exportSVG } from '@/lib/render';
import { orderedFrames } from '@/lib/element';
import { download, toast } from '@/lib/utils';
import { Modal } from './Modal';
import { Button, CheckField, OptionGroup, SelectField } from './ui';

export function ExportDialog({ app, elements, selected, onClose }: { app: AppState; elements: DrawElement[]; selected: DrawElement[]; onClose: () => void }) {
  const [bg, setBg] = useState(true);
  const [dark, setDark] = useState(app.theme === 'dark');
  const [scale, setScale] = useState(2);
  const [only, setOnly] = useState(selected.length > 0);
  const els = only && selected.length ? selected : elements;
  const bgColor = bg ? app.viewBg : null;
  const url = useMemo(() => exportCanvas(els, { padding: 16, scale: 1, background: bgColor, dark })?.toDataURL() ?? '', [els, bgColor, dark]);
  const png = () => {
    const c = exportCanvas(els, { padding: 16, scale, background: bgColor, dark });
    c?.toBlob((b) => b && download(b, 'draw.png'));
  };
  const svg = () => {
    const s = exportSVG(els, { padding: 16, background: bgColor, dark });
    if (s) download(new Blob([new XMLSerializer().serializeToString(s)], { type: 'image/svg+xml' }), 'draw.svg');
  };
  const frames = orderedFrames(elements);
  const [pdfMode, setPdfMode] = useState<'frames' | 'scene'>(frames.length ? 'frames' : 'scene');
  const pdf = async () => {
    const { jsPDF } = await import('jspdf');
    const pages: HTMLCanvasElement[] = [];
    if (pdfMode === 'frames' && frames.length) {
      for (const f of frames) { const c = exportCanvas(elements, { padding: 0, scale: 2, background: bgColor ?? '#ffffff', dark, frame: f }); if (c) pages.push(c); }
    } else { const c = exportCanvas(els, { padding: 16, scale: 2, background: bgColor ?? '#ffffff', dark }); if (c) pages.push(c); }
    if (!pages.length) return;
    const sz = (c: HTMLCanvasElement) => [c.width / 2, c.height / 2] as [number, number];
    const [w0, h0] = sz(pages[0]);
    const doc = new jsPDF({ unit: 'px', format: [w0, h0], orientation: w0 >= h0 ? 'l' : 'p', hotfixes: ['px_scaling'] });
    pages.forEach((c, i) => {
      const [w, h] = sz(c);
      if (i) doc.addPage([w, h], w >= h ? 'l' : 'p');
      doc.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h);
    });
    doc.save('draw.pdf');
  };
  const copy = async () => {
    const c = exportCanvas(els, { padding: 16, scale, background: bgColor, dark });
    const b: Blob | null = c ? await new Promise((r) => c.toBlob(r)) : null;
    if (b) try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); } catch { toast('Clipboard not available'); }
  };
  return (
    <Modal title="Export image" onClose={onClose}>
      <div className="export-body">
        <div className="export-preview" style={{ background: bg ? undefined : 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 50% / 16px 16px' }}>
          {url ? <img src={url} alt="preview" /> : <p className="muted">Nothing to export</p>}
        </div>
        <div className="export-opts">
          {selected.length > 0 && <CheckField checked={only} onChange={setOnly}>Only selected</CheckField>}
          <CheckField checked={bg} onChange={setBg}>Background</CheckField>
          <CheckField checked={dark} onChange={setDark}>Dark mode</CheckField>
          <div className="scale-row"><span>Scale</span><OptionGroup label="Export scale" value={scale} onChange={setScale} options={[1, 2, 3].map((n) => ({ value: n, label: `${n}×`, node: `${n}×` }))} /></div>
          <div className="export-btns">
            <Button className="btn primary" disabled={!url} onClick={png}>Export to PNG</Button>
            <Button className="btn primary" disabled={!url} onClick={svg}>Export to SVG</Button>
            {frames.length > 0 && (
              <div className="scale-row"><span>PDF pages</span><SelectField label="PDF pages" className="w170" value={pdfMode} onChange={(v) => setPdfMode(v as any)} items={[{ value: 'frames', label: `One per frame (${frames.length})` }, { value: 'scene', label: 'Whole scene' }]} /></div>
            )}
            <Button className="btn primary" disabled={!url} onClick={pdf}>Export to PDF</Button>
            <Button className="btn" disabled={!url} onClick={copy}>Copy PNG to clipboard</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

const SHORTCUTS: [string, [string, string][]][] = [
  ['Tools', [['Selection', 'V or 1'], ['Rectangle', 'R or 2'], ['Diamond', 'D or 3'], ['Ellipse', 'O or 4'], ['Arrow', 'A or 5'], ['Line', 'L or 6'], ['Draw', 'P or 7'], ['Text', 'T or 8'], ['Insert image', '9'], ['Eraser', 'E'], ['Hand (pan)', 'H or Space+drag'], ['Laser pointer', 'K'], ['Keep tool active', 'Q']]],
  ['Editing', [['Undo / Redo', 'Ctrl+Z / Ctrl+Shift+Z'], ['Copy / Cut / Paste', 'Ctrl+C / X / V'], ['Duplicate', 'Ctrl+D or Alt+drag'], ['Select all', 'Ctrl+A'], ['Find on canvas', 'Ctrl+F'], ['Delete', 'Del'], ['Group / Ungroup', 'Ctrl+G / Ctrl+Shift+G'], ['Lock / Unlock', 'Ctrl+Shift+L'], ['Flip H / V', 'Shift+H / Shift+V'], ['Layers', 'Ctrl+[ ]  (+Shift: front/back)'], ['Copy / Paste style', 'Ctrl+Alt+C / V'], ['Edit text / label', 'Enter or double-click'], ['Finish line/arrow', 'Enter, Esc or double-click'], ['Nudge', 'Arrow keys (Shift ×10)']]],
  ['View', [['Zoom in / out', '+ / −  or Ctrl+wheel'], ['Reset zoom', 'Shift+0'], ['Fit all', 'Shift+1'], ['Fit selection', 'Shift+2'], ['Toggle grid', "Ctrl+'"], ['Zen mode', 'Alt+Z'], ['Dark mode', 'Shift+Alt+D']]],
  ['File', [['Open', 'Ctrl+O'], ['Save to file', 'Ctrl+S'], ['Export image', 'Ctrl+Shift+E'], ['Copy as PNG', 'Shift+Alt+C']]],
  ['Drawing modifiers', [['Square / circle / 15° angle', 'Hold Shift'], ['From center', 'Hold Alt'], ['Keep aspect on resize', 'Hold Shift']]],
];
export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <div className="help-grid">
        {SHORTCUTS.map(([t, rows]) => (
          <div key={t} className="help-col">
            <h3>{t}</h3>
            {rows.map(([a, b]) => <div key={a} className="help-row"><span>{a}</span><kbd>{b}</kbd></div>)}
          </div>
        ))}
      </div>
    </Modal>
  );
}
