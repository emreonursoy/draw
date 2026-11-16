'use client';
import { useMemo, useState } from 'react';
import type { AppState } from '@/lib/types';
import { DEFAULT_STYLE } from '@/lib/types';
import { duplicateProject, getProject, listProjects, renameProject } from '@/lib/projects';
import { exportInterchange } from '@/lib/interchange';
import { commonBounds, normalizeImported } from '@/lib/element';
import { exportCanvas } from '@/lib/render';
import { download } from '@/lib/utils';
import { Icons } from './icons';
import { Modal } from './Modal';

const load = (id: string) => {
  const d = getProject(id);
  if (!d) return null;
  return { d, els: d.elements.map((r) => normalizeImported(r, DEFAULT_STYLE)).filter(Boolean) as any[] };
};

export function ProjectsDialog({ app, actions, onClose }: { app: AppState; actions: any; onClose: () => void }) {
  const [tick, setTick] = useState(0);
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'updated' | 'name'>('updated');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const refresh = () => { setTick((n) => n + 1); actions.refreshName(); };
  const cur = (() => { try { return localStorage.getItem('draw:current:v1'); } catch { return null; } })();

  const list = useMemo(() => { actions.saveNow(); return listProjects(); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const thumbs = useMemo(() => {
    const out: Record<string, { url: string; count: number }> = {};
    for (const p of list) {
      const l = load(p.id);
      if (!l) continue;
      let url = '';
      try {
        if (l.els.length) {
          const [x1, y1, x2, y2] = commonBounds(l.els.filter((e: any) => e.type !== 'comment'));
          const k = Math.min(1, 300 / Math.max(x2 - x1 + 24, y2 - y1 + 24, 1));
          url = exportCanvas(l.els, { padding: 12, scale: k, background: l.d.viewBg, dark: false })?.toDataURL() ?? '';
        }
      } catch {}
      out[p.id] = { url, count: l.els.length };
    }
    return out;
  }, [list]);
  const shown = list.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt));

  const exportOne = (id: string, pname: string) => {
    const l = load(id);
    if (l) download(new Blob([JSON.stringify(exportInterchange(l.els, l.d.viewBg, l.d.grid), null, 2)], { type: 'application/json' }), `${pname || 'project'}.json`);
  };
  const create = () => { actions.newProject(name || 'Untitled'); setName(''); onClose(); };
  const ibtn = { padding: '0 12px', height: 30 } as const;

  return (
    <Modal title="Projects" onClose={onClose} width={860} height="min(560px, 88vh)">
      <div className="proj-new">
        <input value={name} placeholder="New project name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') create(); }} />
        <button className="btn primary" style={{ padding: '0 14px' }} onClick={create}>Create</button>
        <button className="btn" style={{ padding: '0 14px' }} onClick={() => { actions.openFile(); onClose(); }}>Import…</button>
      </div>
      <div className="proj-new">
        <input value={q} placeholder="Search projects…" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <select className="select" style={{ width: 170 }} value={sort} onChange={(e) => setSort(e.target.value as any)} aria-label="Sort projects">
          <option value="updated">Recently updated</option>
          <option value="name">Name</option>
        </select>
      </div>
      {!shown.length && <p className="muted">No projects match.</p>}
      <div className="proj-grid">
        {shown.map((p) => (
          <div key={p.id} className={`proj-card ${p.id === cur ? 'current' : ''}`}>
            <button className="proj-thumb" aria-label={`Open ${p.name}`} onClick={() => { actions.switchProject(p.id); onClose(); }}>
              {thumbs[p.id]?.url ? <img src={thumbs[p.id].url} alt="" draggable={false} /> : <span className="muted">Empty</span>}
            </button>
            <div className="proj-meta">
              {editId === p.id ? (
                <input
                  className="proj-edit" autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { renameProject(p.id, editName); setEditId(null); refresh(); } if (e.key === 'Escape') setEditId(null); }}
                  onBlur={() => { if (editId === p.id) { renameProject(p.id, editName); setEditId(null); refresh(); } }}
                />
              ) : (
                <b title={p.name}>{p.name}</b>
              )}
              <span className="muted">{thumbs[p.id]?.count ?? 0} elements · {new Date(p.updatedAt).toLocaleDateString()}{p.id === cur ? ' · open' : ''}</span>
            </div>
            {confirmId === p.id && (
              <div className="proj-confirm" role="alertdialog" aria-label={`Delete ${p.name}?`}>
                <span>Delete “{p.name}”?<br /><small>This cannot be undone.</small></span>
                <div>
                  <button className="btn danger-btn" style={ibtn} autoFocus onClick={() => { actions.removeProject(p.id); setConfirmId(null); refresh(); }}>Delete</button>
                  <button className="btn" style={ibtn} onClick={() => setConfirmId(null)}>Cancel</button>
                </div>
              </div>
            )}
            {(
              <div className="proj-actions">
                <button className="opt" title="Rename" aria-label="Rename" onClick={() => { setEditId(p.id); setEditName(p.name); }}>{Icons.edit}</button>
                <button className="opt" title="Duplicate" aria-label="Duplicate" onClick={() => { duplicateProject(p.id); refresh(); }}>{Icons.copy}</button>
                <button className="opt" title="Export as compatible .json" aria-label="Export" onClick={() => exportOne(p.id, p.name)}>{Icons.export}</button>
                <button className="opt danger" title="Delete" aria-label="Delete" onClick={() => setConfirmId(p.id)}>{Icons.trash}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
