import type { DrawElement } from './types';
import { uid } from './utils';

export interface ProjectMeta { id: string; name: string; updatedAt: number }
export interface ProjectData { elements: DrawElement[]; viewBg: string; grid: boolean; scrollX: number; scrollY: number; zoom: number }

const INDEX = 'draw:projects:v1';
const CUR = 'draw:current:v1';
const OLD = 'draw:scene:v1';
const pk = (id: string) => `draw:project:${id}`;
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch {} },
};

export function listProjects(): ProjectMeta[] {
  try { return (JSON.parse(ls.get(INDEX) || '[]') as ProjectMeta[]).sort((a, b) => b.updatedAt - a.updatedAt); } catch { return []; }
}
const writeIndex = (l: ProjectMeta[]) => ls.set(INDEX, JSON.stringify(l));
export const emptyData = (): ProjectData => ({ elements: [], viewBg: '#ffffff', grid: false, scrollX: 0, scrollY: 0, zoom: 1 });

export function getProject(id: string): ProjectData | null {
  const raw = ls.get(pk(id));
  if (!raw) return null;
  try { return { ...emptyData(), ...JSON.parse(raw) }; } catch { return null; }
}
export function saveProject(id: string, data: ProjectData): boolean {
  if (!ls.set(pk(id), JSON.stringify(data))) return false; // nothing changed; leave the index alone
  const list = listProjects();
  const cur = list.find((p) => p.id === id) ?? { id, name: 'Untitled', updatedAt: 0 }; // re-index an unlisted project
  writeIndex([{ ...cur, updatedAt: Date.now() }, ...list.filter((p) => p.id !== id)]);
  return true;
}
/** Creates a project; returns its id, or null when browser storage rejected the data. */
export function createProject(name: string, data: ProjectData = emptyData()): string | null {
  const id = uid();
  if (!ls.set(pk(id), JSON.stringify(data))) return null;
  if (!writeIndex([{ id, name: name.trim() || 'Untitled', updatedAt: Date.now() }, ...listProjects()])) {
    ls.del(pk(id)); // never leave project data that the index doesn't know about
    return null;
  }
  return id;
}
export function renameProject(id: string, name: string) {
  writeIndex(listProjects().map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)));
}
export type DuplicateResult = { id: string } | { error: 'missing' | 'storage' };
export function duplicateProject(id: string): DuplicateResult {
  const d = getProject(id), m = listProjects().find((p) => p.id === id);
  if (!d || !m) return { error: 'missing' };
  const copy = createProject(`${m.name} copy`, d);
  return copy ? { id: copy } : { error: 'storage' };
}
export function deleteProject(id: string) {
  ls.del(pk(id));
  writeIndex(listProjects().filter((p) => p.id !== id));
}
export const getCurrentId = () => ls.get(CUR);
export const setCurrentId = (id: string) => ls.set(CUR, id);

/**
 * Moves a scene saved by an early version (a single draw:scene:v1 key) into a project. The legacy key is only
 * deleted once the project is stored; 'failed' means it is still waiting (no space), so callers can tell the user.
 */
export function migrateLegacy(): 'none' | 'migrated' | 'failed' {
  const old = ls.get(OLD);
  if (!old) return 'none';
  let data: ProjectData;
  try { data = { ...emptyData(), ...JSON.parse(old) }; } catch { ls.del(OLD); return 'none'; } // unreadable: nothing to recover
  const id = createProject(listProjects().length ? 'Recovered drawing' : 'Untitled', data);
  if (!id) return 'failed';
  ls.del(OLD);
  if (!getCurrentId()) setCurrentId(id);
  return 'migrated';
}

/** Returns a valid current project id, creating it if needed. */
export function ensureCurrent(): string {
  const list = listProjects();
  let id = getCurrentId();
  if (id && list.some((p) => p.id === id)) return id;
  id = list.length ? list[0].id : createProject('Untitled') ?? uid(); // saveProject re-indexes an unlisted id
  setCurrentId(id);
  return id;
}
