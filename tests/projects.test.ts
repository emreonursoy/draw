import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createProject, deleteProject, duplicateProject, emptyData, ensureCurrent, getProject, listProjects, migrateLegacy,
  renameProject, saveProject, setCurrentId,
} from '@/lib/projects';

const scene = (n: number) => ({ ...emptyData(), elements: Array.from({ length: n }, (_, i) => ({ id: 'e' + i, type: 'rectangle' })) as any });

/** Makes localStorage reject writes for keys matching `match` (quota exceeded). */
function failWrites(match: (key: string) => boolean) {
  const orig = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
    if (match(k)) throw new DOMException('quota', 'QuotaExceededError');
    return orig.call(this, k, v);
  });
}

afterEach(() => vi.restoreAllMocks());

describe('project store', () => {
  it('creates, lists, reads, renames and deletes projects', () => {
    const id = createProject('First', scene(2))!;
    expect(id).toBeTruthy();
    expect(listProjects().map((p) => p.name)).toEqual(['First']);
    expect(getProject(id)!.elements).toHaveLength(2);
    renameProject(id, '  Renamed  ');
    expect(listProjects()[0].name).toBe('Renamed');
    renameProject(id, '   '); // blank names are ignored
    expect(listProjects()[0].name).toBe('Renamed');
    deleteProject(id);
    expect(listProjects()).toEqual([]);
    expect(getProject(id)).toBeNull();
  });

  it('lists the most recently saved project first', () => {
    const a = createProject('A')!;
    const b = createProject('B')!;
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5000);
    saveProject(a, scene(1));
    expect(listProjects().map((p) => p.id)).toEqual([a, b]);
  });

  it('duplicates a project and reports why it could not', () => {
    const id = createProject('Src', scene(3))!;
    const r = duplicateProject(id);
    expect('id' in r && getProject(r.id)!.elements).toHaveLength(3);
    expect(listProjects().some((p) => p.name === 'Src copy')).toBe(true);
    expect(duplicateProject('nope')).toEqual({ error: 'missing' });
    failWrites((k) => k.startsWith('draw:project:'));
    expect(duplicateProject(id)).toEqual({ error: 'storage' });
  });

  it('returns null and writes nothing when storage rejects the project data', () => {
    failWrites((k) => k.startsWith('draw:project:'));
    expect(createProject('Big', scene(5))).toBeNull();
    expect(listProjects()).toEqual([]);
  });

  it('rolls back the project data when the index write fails', () => {
    failWrites((k) => k === 'draw:projects:v1');
    expect(createProject('X')).toBeNull();
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('draw:project:'));
    expect(keys).toEqual([]); // no orphaned data
  });

  it('saveProject reports failure and leaves the index untouched', () => {
    const id = createProject('A')!;
    const before = localStorage.getItem('draw:projects:v1');
    failWrites((k) => k.startsWith('draw:project:'));
    expect(saveProject(id, scene(9))).toBe(false);
    expect(localStorage.getItem('draw:projects:v1')).toBe(before);
  });

  it('saveProject re-indexes a project that exists but is missing from the index', () => {
    localStorage.setItem('draw:project:ghost', JSON.stringify(emptyData()));
    expect(saveProject('ghost', scene(1))).toBe(true);
    expect(listProjects().map((p) => p.id)).toContain('ghost');
  });

  it('tolerates corrupt stored data', () => {
    localStorage.setItem('draw:projects:v1', '{not json');
    expect(listProjects()).toEqual([]);
    localStorage.setItem('draw:project:bad', '{{{');
    expect(getProject('bad')).toBeNull();
  });
});

describe('ensureCurrent and legacy migration', () => {
  it('creates a first project and remembers it', () => {
    const id = ensureCurrent();
    expect(listProjects().map((p) => p.id)).toEqual([id]);
    expect(ensureCurrent()).toBe(id);
  });

  it('falls back to the first project when the stored current id is stale', () => {
    const a = createProject('A')!;
    setCurrentId('missing');
    expect(ensureCurrent()).toBe(a);
  });

  it('migrates a legacy single-scene key into the first project and deletes the old key', () => {
    localStorage.setItem('draw:scene:v1', JSON.stringify({ elements: [{ type: 'rectangle' }], viewBg: '#fff' }));
    expect(migrateLegacy()).toBe('migrated');
    expect(localStorage.getItem('draw:scene:v1')).toBeNull();
    const id = ensureCurrent();
    expect(getProject(id)!.elements).toHaveLength(1);
    expect(listProjects()[0].name).toBe('Untitled');
  });

  it('names the migrated project "Recovered drawing" when projects already exist', () => {
    createProject('Mine');
    localStorage.setItem('draw:scene:v1', JSON.stringify({ elements: [{ type: 'rectangle' }] }));
    expect(migrateLegacy()).toBe('migrated');
    expect(listProjects().map((p) => p.name)).toContain('Recovered drawing');
  });

  it('keeps the legacy scene when it cannot be stored, and retries later', () => {
    localStorage.setItem('draw:scene:v1', JSON.stringify({ elements: [{ type: 'rectangle' }] }));
    const spy = failWrites((k) => k.startsWith('draw:project:'));
    expect(migrateLegacy()).toBe('failed');
    expect(localStorage.getItem('draw:scene:v1')).not.toBeNull();
    spy.mockRestore();
    expect(migrateLegacy()).toBe('migrated');
    expect(localStorage.getItem('draw:scene:v1')).toBeNull();
  });

  it('discards an unreadable legacy scene instead of failing forever', () => {
    localStorage.setItem('draw:scene:v1', '{broken');
    expect(migrateLegacy()).toBe('none');
    expect(localStorage.getItem('draw:scene:v1')).toBeNull();
  });

  it('reports nothing to do when there is no legacy scene', () => {
    expect(migrateLegacy()).toBe('none');
  });
});
