import type { DrawElement, ElType } from './types';

export interface SearchHit {
  id: string;
  type: ElType;
  /** What the match was found in, e.g. "Text", "Frame", "Comment". */
  label: string;
  /** The matching line split around the first match, so the match can be emphasised. */
  before: string;
  match: string;
  after: string;
}

const LABELS: Record<ElType, string> = {
  rectangle: 'Rectangle', diamond: 'Diamond', ellipse: 'Ellipse', arrow: 'Arrow', line: 'Line', freedraw: 'Drawing',
  text: 'Text', image: 'Image', frame: 'Frame', comment: 'Comment', markdown: 'Markdown', embed: 'Embed',
};

const CONTEXT = 32;

/** Every piece of text an element carries: its text or label, an embed's address, a comment's thread. */
export function elementTexts(el: DrawElement): string[] {
  const out: string[] = [];
  if (el.text) out.push(el.text);
  if (el.type === 'embed' && el.url) out.push(el.url);
  if (el.type === 'comment') for (const c of el.thread ?? []) out.push(c.text);
  return out;
}

const snippet = (text: string, at: number, len: number): Pick<SearchHit, 'before' | 'match' | 'after'> => {
  const flat = (s: string) => s.replace(/\s+/g, ' ');
  const start = Math.max(0, at - CONTEXT);
  const end = Math.min(text.length, at + len + CONTEXT);
  return {
    before: (start > 0 ? '…' : '') + flat(text.slice(start, at)),
    match: flat(text.slice(at, at + len)),
    after: flat(text.slice(at + len, end)) + (end < text.length ? '…' : ''),
  };
};

/**
 * Finds elements whose text contains the query (case-insensitive). Results come in reading order
 * (top to bottom, then left to right) so "next" and "previous" move predictably across the canvas.
 */
export function searchElements(elements: DrawElement[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: { hit: SearchHit; x: number; y: number }[] = [];
  for (const el of elements) {
    for (const t of elementTexts(el)) {
      const at = t.toLowerCase().indexOf(q);
      if (at < 0) continue;
      hits.push({ hit: { id: el.id, type: el.type, label: LABELS[el.type], ...snippet(t, at, q.length) }, x: el.x, y: el.y });
      break; // one result per element
    }
  }
  hits.sort((a, b) => a.y - b.y || a.x - b.x);
  return hits.map((h) => h.hit);
}

export interface CommentInfo { id: string; first: string; replies: number; last: number; resolved: boolean; x: number; y: number }

/** The comment threads on the canvas in reading order. */
export function listComments(elements: DrawElement[]): CommentInfo[] {
  return elements
    .filter((e) => e.type === 'comment')
    .map((e) => {
      const thread = e.thread ?? [];
      return { id: e.id, first: thread[0]?.text ?? '', replies: Math.max(0, thread.length - 1), last: thread[thread.length - 1]?.at ?? 0, resolved: !!e.resolved, x: e.x, y: e.y };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);
}
