import { describe, expect, it } from 'vitest';
import { newElement } from '@/lib/element';
import { DEFAULT_STYLE } from '@/lib/types';
import type { DrawElement, ElType } from '@/lib/types';
import { listComments, searchElements, stepIndex } from '@/lib/search';

const el = (type: ElType, x: number, y: number, extra: Partial<DrawElement> = {}): DrawElement => ({ ...newElement(type, x, y, DEFAULT_STYLE), ...extra });

describe('searchElements', () => {
  it('finds text case-insensitively and splits around the match', () => {
    const [h] = searchElements([el('text', 0, 0, { text: 'Hello World' })], 'WORLD');
    expect(h).toMatchObject({ label: 'Text', before: 'Hello ', match: 'World', after: '' });
  });

  it('searches labels on shapes, frame names, markdown and embed addresses', () => {
    const els = [
      el('rectangle', 0, 0, { text: 'Login box' }),
      el('frame', 0, 10, { text: 'Login flow' }),
      el('markdown', 0, 20, { text: '# Login notes' }),
      el('embed', 0, 30, { url: 'https://example.com/login' }),
    ];
    expect(searchElements(els, 'login').map((h) => h.label)).toEqual(['Rectangle', 'Frame', 'Markdown', 'Embed']);
  });

  it('searches comment threads and reports one result per element', () => {
    const c = el('comment', 0, 0, { thread: [{ text: 'first', at: 1 }, { text: 'fix the login', at: 2 }, { text: 'login again', at: 3 }] });
    const hits = searchElements([c], 'login');
    expect(hits).toHaveLength(1);
    expect(hits[0].label).toBe('Comment');
  });

  it('orders results top to bottom, then left to right', () => {
    const a = el('text', 200, 50, { text: 'x' }), b = el('text', 10, 50, { text: 'x' }), c = el('text', 500, 0, { text: 'x' });
    expect(searchElements([a, b, c], 'x').map((h) => h.id)).toEqual([c.id, b.id, a.id]);
  });

  it('ignores empty queries, shapes without text and non-matches', () => {
    const els = [el('rectangle', 0, 0), el('text', 0, 0, { text: 'abc' })];
    expect(searchElements(els, '')).toEqual([]);
    expect(searchElements(els, '   ')).toEqual([]);
    expect(searchElements(els, 'zzz')).toEqual([]);
  });

  it('trims long text around the match with ellipses and flattens line breaks', () => {
    const text = `${'a'.repeat(80)}\nNEEDLE ${'b'.repeat(80)}`;
    const [h] = searchElements([el('text', 0, 0, { text })], 'needle');
    expect(h.before.startsWith('…')).toBe(true);
    expect(h.after.endsWith('…')).toBe(true);
    expect(h.before + h.match + h.after).not.toContain('\n');
  });
});

describe('listComments', () => {
  it('lists threads in reading order with reply counts and resolved state', () => {
    const late = el('comment', 0, 100, { thread: [{ text: 'b', at: 5 }], resolved: true });
    const early = el('comment', 0, 0, { thread: [{ text: 'a', at: 1 }, { text: 'reply', at: 9 }] });
    const list = listComments([late, el('text', 0, 0), early]);
    expect(list.map((c) => c.id)).toEqual([early.id, late.id]);
    expect(list[0]).toMatchObject({ first: 'a', replies: 1, last: 9, resolved: false });
    expect(list[1].resolved).toBe(true);
  });
});

describe('stepIndex', () => {
  it('wraps around both ends', () => {
    expect(stepIndex(0, -1, 4)).toBe(3);
    expect(stepIndex(3, 1, 4)).toBe(0);
    expect(stepIndex(1, 1, 4)).toBe(2);
    expect(stepIndex(0, 1, 1)).toBe(0);
  });
  it('returns -1 without results', () => { expect(stepIndex(0, 1, 0)).toBe(-1); });
});
