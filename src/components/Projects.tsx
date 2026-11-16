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
import { Button, IconButton, Input, SelectField } from './ui';

const load = (id: string) => {
  const d = getProject(id);
  if (!d) return null;
  return { d, els: d.elements.map((r) => normalizeImported(r, DEFAULT_STYLE)).filter(Boolean) as any[] };
};

function EmptyThumb() {
  return (
    <div className="empty-thumb" role="img" aria-label="Blank canvas">
      <svg viewBox="0 0 220 120" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.1" fill="currentColor" opacity=".22" /></pattern>
        </defs>
        <rect width="220" height="120" fill="url(#dots)" />
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".38">
          <path d="M38 34c18-3 40-2 56 0 2 12 2 24 0 34-18 3-38 3-57 0-2-11-2-23 1-34z" />
          <path d="M150 28c14-6 32 4 31 20-1 16-18 24-32 17-13-7-14-30 1-37z" />
          <path d="M98 52c14 0 26-2 40-2" /><path d="M130 44l9 6-9 7" />
          <path d="M70 96c12-6 22 6 34-1s20 4 32-1" />
        </g>
      </svg>
      <span className="empty-label"><b>Blank canvas</b><small>Open it and start drawing</small></span>
    </div>
  );
}

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
        <Input className="field" aria-label="New project name" value={name} placeholder="New project name" onValueChange={setName} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') create(); }} />
        <Button className="btn primary" style={{ padding: '0 14px' }} onClick={create}>Create</Button>
        <Button className="btn" style={{ padding: '0 14px' }} onClick={() => { actions.openFile(); onClose(); }}>Import…</Button>
      </div>
      <div className="proj-new">
        <Input className="field" aria-label="Search projects" value={q} placeholder="Search projects…" onValueChange={setQ} onKeyDown={(e) => e.stopPropagation()} />
        <SelectField label="Sort projects" className="w170" value={sort} onChange={(v) => setSort(v as any)} items={[{ value: 'updated', label: 'Recently updated' }, { value: 'name', label: 'Name' }]} />
      </div>
      {!shown.length && <p className="muted">No projects match.</p>}
      <div className="proj-grid">
        {shown.map((p) => (
          <div key={p.id} className={`proj-card ${p.id === cur ? 'current' : ''}`}>
            <Button className="proj-thumb" aria-label={`Open ${p.name}`} onClick={() => { actions.switchProject(p.id); onClose(); }}>
              {thumbs[p.id]?.url ? <img src={thumbs[p.id].url} alt="" draggable={false} /> : <EmptyThumb />}
            </Button>
            <div className="proj-meta">
              {editId === p.id ? (
                <Input
                  className="proj-edit" aria-label="Project name" autoFocus value={editName} onValueChange={setEditName}
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
                  <Button className="btn danger-btn" style={ibtn} autoFocus onClick={() => { actions.removeProject(p.id); setConfirmId(null); refresh(); }}>Delete</Button>
                  <Button className="btn" style={ibtn} onClick={() => setConfirmId(null)}>Cancel</Button>
                </div>
              </div>
            )}
            {(
              <div className="proj-actions">
                <IconButton className="opt" label="Rename" onClick={() => { setEditId(p.id); setEditName(p.name); }}>{Icons.edit}</IconButton>
                <IconButton className="opt" label="Duplicate" onClick={() => { duplicateProject(p.id); refresh(); }}>{Icons.copy}</IconButton>
                <IconButton className="opt" label="Export as compatible .json" onClick={() => exportOne(p.id, p.name)}>{Icons.export}</IconButton>
                <IconButton className="opt danger" label="Delete" onClick={() => setConfirmId(p.id)}>{Icons.trash}</IconButton>
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
