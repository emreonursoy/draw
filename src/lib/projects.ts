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
  const ok = ls.set(pk(id), JSON.stringify(data));
  const l = listProjects().filter((p) => p.id !== id);
  const cur = listProjects().find((p) => p.id === id);
  if (cur) writeIndex([{ ...cur, updatedAt: Date.now() }, ...l]);
  return ok;
}
export function createProject(name: string, data: ProjectData = emptyData()): string {
  const id = uid();
  ls.set(pk(id), JSON.stringify(data));
  writeIndex([{ id, name: name.trim() || 'Untitled', updatedAt: Date.now() }, ...listProjects()]);
  return id;
}
export function renameProject(id: string, name: string) {
  writeIndex(listProjects().map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)));
}
export function duplicateProject(id: string): string | null {
  const d = getProject(id), m = listProjects().find((p) => p.id === id);
  if (!d || !m) return null;
  return createProject(`${m.name} copy`, d);
}
export function deleteProject(id: string) {
  ls.del(pk(id));
  writeIndex(listProjects().filter((p) => p.id !== id));
}
export const getCurrentId = () => ls.get(CUR);
export const setCurrentId = (id: string) => ls.set(CUR, id);

/** Returns a valid current project id, creating/migrating as needed. */
export function ensureCurrent(): string {
  const list = listProjects();
  let id = getCurrentId();
  if (id && list.some((p) => p.id === id)) return id;
  if (list.length) id = list[0].id;
  else {
    let data = emptyData();
    const old = ls.get(OLD);
    if (old) { try { data = { ...data, ...JSON.parse(old) }; } catch {} ls.del(OLD); }
    id = createProject('Untitled', data);
  }
  setCurrentId(id);
  return id;
}
