import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '@/lib/types';
import { parseMermaid } from '@/lib/mermaid';

const parse = (src: string) => parseMermaid(src, DEFAULT_STYLE);

describe('flowcharts', () => {
  it('creates shapes by bracket style and keeps their labels', () => {
    const { elements, kind } = parse('flowchart TD\n  A[Rect] --> B(Round)\n  B --> C{Choice}\n  C --> D((Dot))');
    expect(kind).toBe('flowchart');
    const shapes = elements!.filter((e) => e.type !== 'arrow');
    const byText = (t: string) => shapes.find((e) => e.text === t)!;
    expect(byText('Rect').type).toBe('rectangle');
    expect(byText('Round').type).toBe('rectangle');
    expect(byText('Round').roundness).toBe(true);
    expect(byText('Choice').type).toBe('diamond');
    expect(byText('Dot').type).toBe('ellipse');
  });

  it('binds each edge to its two shapes and carries edge labels and styles', () => {
    const { elements } = parse('graph LR\n  A -->|yes| B\n  B -.-> C\n  C ==> D\n  D --- E');
    const arrows = elements!.filter((e) => e.type === 'arrow');
    expect(arrows).toHaveLength(4);
    expect(arrows[0].text).toBe('yes');
    expect(arrows[0].startBinding).toBeTruthy();
    expect(arrows[0].endBinding).toBeTruthy();
    expect(arrows[1].strokeStyle).toBe('dashed');
    expect(arrows[2].strokeWidth).toBe(4);
    expect(arrows[3].endArrowhead).toBeNull(); // --- has no head
  });

  it('supports chains and ranks nodes along the flow direction', () => {
    const { elements } = parse('flowchart TD\n  A --> B --> C');
    const y = (t: string) => elements!.find((e) => e.text === t)!.y;
    expect(y('A')).toBeLessThan(y('B'));
    expect(y('B')).toBeLessThan(y('C'));
    const lr = parse('flowchart LR\n  A --> B').elements!;
    const x = (t: string) => lr.find((e) => e.text === t)!.x;
    expect(x('A')).toBeLessThan(x('B'));
  });

  it('survives cycles', () => {
    const { elements } = parse('flowchart TD\n  A --> B\n  B --> A');
    expect(elements!.filter((e) => e.type !== 'arrow')).toHaveLength(2);
  });

  it('ignores comments and styling lines', () => {
    const { elements } = parse('flowchart TD\n  %% a comment\n  A --> B\n  classDef x fill:#f00\n  style A fill:#fff');
    expect(elements!.filter((e) => e.type !== 'arrow')).toHaveLength(2);
  });
});

describe('sequence diagrams', () => {
  it('lays out participants with lifelines and messages', () => {
    const { elements, kind } = parse('sequenceDiagram\n  participant A as Alice\n  A->>B: hello\n  B-->>A: hi');
    expect(kind).toBe('sequence diagram');
    expect(elements!.filter((e) => e.type === 'rectangle').map((e) => e.text)).toEqual(['Alice', 'B']);
    const msgs = elements!.filter((e) => e.type === 'arrow');
    expect(msgs.map((m) => m.text)).toEqual(['hello', 'hi']);
    expect(msgs[1].strokeStyle).toBe('dashed');
    expect(elements!.filter((e) => e.type === 'line')).toHaveLength(2);
  });
});

describe('other input', () => {
  it('reports unsupported diagram types and empty input without throwing', () => {
    expect(parse('pie title x\n "a": 1')).toEqual({ elements: null, kind: 'pie' });
    expect(parse('')).toEqual({ elements: null, kind: '' });
    expect(parse('flowchart TD').elements).toBeNull();
  });
});
