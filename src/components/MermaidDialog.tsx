'use client';
import { useMemo, useState } from 'react';
import type { AppState } from '@/lib/types';
import { parseMermaid } from '@/lib/mermaid';
import { exportCanvas } from '@/lib/render';
import { Modal } from './Modal';

const SAMPLE = `flowchart TD
  A[Start] --> B{Is it working?}
  B -->|Yes| C(Ship it)
  B -->|No| D[Debug]
  D -.-> B`;

export function MermaidDialog({ app, actions, onClose }: { app: AppState; actions: any; onClose: () => void }) {
  const [src, setSrc] = useState(SAMPLE);
  const res = useMemo(() => { try { return parseMermaid(src, app.style); } catch { return { elements: null, kind: '' }; } }, [src, app.style]);
  const preview = useMemo(() => {
    if (!res.elements) return '';
    try { return exportCanvas(res.elements, { padding: 12, scale: 0.6, background: '#ffffff', dark: false })?.toDataURL() ?? ''; } catch { return ''; }
  }, [res]);
  return (
    <Modal title="Mermaid to diagram" onClose={onClose} width={860}>
      <p className="muted" style={{ marginTop: 0 }}>Supports flowcharts (graph / flowchart) and sequence diagrams.</p>
      <div className="export-body">
        <textarea className="mermaid-src" value={src} spellCheck={false} onChange={(e) => setSrc(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <div className="export-preview" style={{ background: '#fff' }}>
          {preview ? <img src={preview} alt="Preview" /> : <p className="muted">{res.kind ? `Could not read this ${res.kind}.` : 'Write a diagram to see a preview.'}</p>}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button className="btn" style={{ padding: '0 14px' }} onClick={onClose}>Cancel</button>
        <button className="btn primary" style={{ padding: '0 14px' }} disabled={!res.elements} onClick={() => { actions.insertMermaid(res.elements); onClose(); }}>Insert</button>
      </div>
    </Modal>
  );
}
