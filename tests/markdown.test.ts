import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '@/lib/types';
import { newElement, withAbsPoints } from '@/lib/element';
import { parseMarkdown, toMarkdown } from '@/lib/markdown';

const parse = (src: string) => parseMarkdown(src, DEFAULT_STYLE);
const texts = (els: ReturnType<typeof parse>) => els.filter((e) => e.type === 'text');

describe('parseMarkdown', () => {
  it('turns headings into sized text elements', () => {
    const [h1, h2] = texts(parse('# Title\n\n## Sub'));
    expect(h1.text).toBe('Title');
    expect(h1.fontSize).toBeGreaterThan(h2.fontSize);
  });

  it('strips inline formatting', () => {
    const [p] = texts(parse('This is **bold**, *italic*, `code`, a [link](https://x.test) and ~~gone~~.'));
    expect(p.text).toBe('This is bold, italic, code, a link and gone.');
  });

  it('renders bullet, numbered and task lists', () => {
    const [list] = texts(parse('- one\n- two\n  - nested'));
    expect(list.text).toContain('• one');
    expect(list.text).toContain('• two');
    expect(list.text).toMatch(/\n\s+• nested/);
    const [tasks] = texts(parse('- [ ] todo\n- [x] done'));
    expect(tasks.text).toBe('☐ todo\n☑ done');
    expect(texts(parse('1. a\n2. b'))[0].text).toBe('1. a\n2. b');
  });

  it('draws code fences as a boxed monospace block', () => {
    const els = parse('```js\nconst a = 1;\n```');
    expect(els.some((e) => e.type === 'rectangle')).toBe(true);
    const code = texts(els)[0];
    expect(code.text).toBe('const a = 1;');
    expect(code.fontFamily).toBe(3);
  });

  it('formats tables as aligned columns', () => {
    const [t] = texts(parse('| Name | Role |\n| --- | --- |\n| Ann | Dev |'));
    expect(t.fontFamily).toBe(3);
    const lines = t.text.split('\n');
    expect(lines[0]).toContain('Name');
    expect(lines[1]).toMatch(/^[─┼\s]+$/);
    expect(lines[2]).toContain('Ann');
  });

  it('turns mermaid blocks into diagram elements instead of code', () => {
    const els = parse('```mermaid\nflowchart TD\n  A[Start] --> B[End]\n```');
    expect(els.filter((e) => e.type === 'rectangle').length).toBe(2);
    expect(els.some((e) => e.type === 'arrow')).toBe(true);
  });

  it('adds a rule for ---, and stacks blocks top to bottom', () => {
    const els = parse('# A\n\ntext\n\n---\n\nend');
    expect(els.some((e) => e.type === 'line')).toBe(true);
    const ys = els.map((e) => e.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  it('returns nothing for empty input', () => {
    expect(parse('')).toEqual([]);
    expect(parse('\n\n  \n')).toEqual([]);
  });
});

describe('toMarkdown', () => {
  it('writes headings from font size and lists with markers', () => {
    const md = toMarkdown(parse('# Title\n\n- a\n- b\n\n1. x\n2. y'));
    expect(md).toContain('# Title');
    expect(md).toContain('- a\n- b');
    expect(md).toContain('1. x\n2. y');
  });

  it('round-trips tables, code and quotes', () => {
    const src = '# Doc\n\n> quoted\n\n```\ncode here\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n';
    const md = toMarkdown(parse(src));
    expect(md).toContain('> quoted');
    expect(md).toContain('```\ncode here\n```');
    expect(md).toContain('| A | B |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| 1 | 2 |');
  });

  it('writes bound shapes as a mermaid flowchart', () => {
    const a = { ...newElement('rectangle', 0, 0, { ...DEFAULT_STYLE, roundness: false }), id: 'a', width: 100, height: 50, text: 'Start' };
    const b = { ...newElement('diamond', 300, 0, DEFAULT_STYLE), id: 'b', width: 100, height: 50, text: 'Ok?' };
    const arrow = withAbsPoints({ ...newElement('arrow', 0, 0, DEFAULT_STYLE), id: 'ar', startBinding: 'a', endBinding: 'b', text: 'yes' }, [[100, 25], [300, 25]]);
    const md = toMarkdown([a, b, arrow]);
    expect(md).toContain('```mermaid');
    expect(md).toContain('flowchart TD');
    expect(md).toMatch(/N1\["Start"\] -->\|yes\| N2\{"Ok\?"\}/);
  });

  it('uses frame names as sections and leaves comments out', () => {
    const f = { ...newElement('frame', 0, 0, DEFAULT_STYLE), width: 400, height: 300, text: 'Intro' };
    const t = { ...newElement('text', 10, 10, DEFAULT_STYLE, { text: 'inside' }), width: 50, height: 20 };
    const c = { ...newElement('comment', 5, 5, DEFAULT_STYLE), text: 'secret' };
    const md = toMarkdown([f, t, c]);
    expect(md).toContain('# Intro');
    expect(md).toContain('inside');
    expect(md).not.toContain('secret');
  });

  it('exports markdown blocks as their raw source', () => {
    const block = { ...newElement('markdown', 0, 0, DEFAULT_STYLE, { text: '## Raw **md**' }), width: 400, height: 80 };
    expect(toMarkdown([block])).toContain('## Raw **md**');
  });
});
