import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE } from '@/lib/types';
import { newElement, withAbsPoints } from '@/lib/element';
import { exportInterchange, importInterchange, isInterchangeData } from '@/lib/interchange';

const shape = (type: any, id: string, x: number, y: number, extra: any = {}) => ({ ...newElement(type, x, y, DEFAULT_STYLE), id, width: 100, height: 60, ...extra });

describe('compatible JSON export', () => {
  it('writes labels as separate text elements bound to their container', () => {
    const out = exportInterchange([shape('rectangle', 'r1', 0, 0, { text: 'Hello' })], '#ffffff', false);
    const [box, label] = out.elements as any[];
    expect(box.type).toBe('rectangle');
    expect(box.boundElements).toEqual([{ type: 'text', id: 'r1_label' }]);
    expect(label.type).toBe('text');
    expect(label.containerId).toBe('r1');
    expect(label.text).toBe('Hello');
  });

  it('records arrow bindings on both the arrow and the shapes', () => {
    const arrow = withAbsPoints({ ...newElement('arrow', 0, 0, DEFAULT_STYLE), id: 'ar', startBinding: 'a', endBinding: 'b' }, [[100, 30], [300, 30]]);
    const out: any = exportInterchange([shape('rectangle', 'a', 0, 0), shape('ellipse', 'b', 300, 0), arrow], '#fff', false);
    const byId = (id: string) => out.elements.find((e: any) => e.id === id);
    expect(byId('ar').startBinding.elementId).toBe('a');
    expect(byId('a').boundElements).toContainEqual({ type: 'arrow', id: 'ar' });
    expect(byId('b').boundElements).toContainEqual({ type: 'arrow', id: 'ar' });
  });

  it('leaves comments out and reports the grid and background', () => {
    const out: any = exportInterchange([shape('rectangle', 'r', 0, 0), shape('comment', 'c', 0, 0)], '#f8f9fa', true);
    expect(out.elements.map((e: any) => e.id)).toEqual(['r']);
    expect(out.appState).toEqual({ gridSize: 20, viewBackgroundColor: '#f8f9fa' });
  });

  it('puts images into the files map', () => {
    const img = shape('image', 'img', 0, 0, { dataURL: 'data:image/png;base64,AAAA' });
    const out: any = exportInterchange([img], '#fff', false);
    expect(out.files.img.dataURL).toBe('data:image/png;base64,AAAA');
    expect(out.files.img.mimeType).toBe('image/png');
  });
});

describe('compatible JSON import', () => {
  it('recognises the format', () => {
    expect(isInterchangeData({ type: 'excalidraw', elements: [] })).toBe(true);
    expect(isInterchangeData({ type: 'draw', elements: [{ type: 'rectangle' }] })).toBeFalsy();
  });

  it('merges bound text into its container as a label', () => {
    const data = {
      elements: [
        { id: 'a', type: 'rectangle', x: 0, y: 0, width: 100, height: 50, versionNonce: 1 },
        { id: 't', type: 'text', x: 10, y: 10, text: 'Boxed', containerId: 'a', fontSize: 20, fontFamily: 1 },
      ],
    };
    const { elements } = importInterchange(data);
    expect(elements).toHaveLength(1);
    expect(elements[0].text).toBe('Boxed');
  });

  it('keeps bindings only when the target exists, and maps arrowheads', () => {
    const data = {
      elements: [
        { id: 'a', type: 'rectangle', x: 0, y: 0, width: 10, height: 10 },
        { id: 'ar', type: 'arrow', x: 0, y: 0, points: [[0, 0], [10, 10]], startBinding: { elementId: 'a' }, endBinding: { elementId: 'gone' }, endArrowhead: 'triangle_outline' },
      ],
    };
    const arrow = importInterchange(data).elements.find((e) => e.id === 'ar')!;
    expect(arrow.startBinding).toBe('a');
    expect(arrow.endBinding).toBeNull();
    expect(arrow.endArrowhead).toBe('triangle');
  });

  it('skips deleted elements and images whose file is missing', () => {
    const data = { elements: [{ id: 'd', type: 'rectangle', isDeleted: true }, { id: 'i', type: 'image', fileId: 'f1' }, { id: 'k', type: 'ellipse', x: 0, y: 0 }], files: {} };
    expect(importInterchange(data).elements.map((e) => e.id)).toEqual(['k']);
  });

  it('reads frames, using their name as the label', () => {
    const { elements } = importInterchange({ elements: [{ id: 'f', type: 'frame', x: 0, y: 0, width: 300, height: 200, name: 'Intro' }] });
    expect(elements[0].type).toBe('frame');
    expect(elements[0].text).toBe('Intro');
  });

  it('round-trips an exported scene', () => {
    const original = [
      shape('rectangle', 'a', 0, 0, { text: 'One', strokeColor: '#e03131' }),
      shape('ellipse', 'b', 300, 0),
      withAbsPoints({ ...newElement('arrow', 0, 0, DEFAULT_STYLE), id: 'ar', startBinding: 'a', endBinding: 'b', arrowType: 'sharp' }, [[100, 30], [300, 30]]),
    ];
    const { elements } = importInterchange(exportInterchange(original, '#ffffff', true));
    expect(elements.map((e) => e.type).sort()).toEqual(['arrow', 'ellipse', 'rectangle']);
    const a = elements.find((e) => e.id === 'a')!;
    expect(a.text).toBe('One');
    expect(a.strokeColor).toBe('#e03131');
    const arrow = elements.find((e) => e.id === 'ar')!;
    expect(arrow.startBinding).toBe('a');
    expect(arrow.endBinding).toBe('b');
  });
});

describe('embeds and polygons in the compatible format', () => {
  it('round-trips an embed through the embeddable type', () => {
    const e = { ...newElement('embed', 0, 0, DEFAULT_STYLE), id: 'e1', width: 300, height: 200, url: 'https://example.com/x' };
    const out: any = exportInterchange([e], '#fff', false);
    expect(out.elements[0].type).toBe('embeddable');
    expect(out.elements[0].link).toBe('https://example.com/x');
    const back = importInterchange(out).elements[0];
    expect(back.type).toBe('embed');
    expect(back.url).toBe('https://example.com/x');
  });

  it('refuses an embeddable with an unsafe link on import', () => {
    expect(importInterchange({ elements: [{ id: 'x', type: 'embeddable', link: 'javascript:alert(1)', x: 0, y: 0, width: 10, height: 10 }] }).elements).toEqual([]);
  });

  it('writes closed polygons with the first point repeated and reads them back', () => {
    const poly = withAbsPoints({ ...newElement('line', 0, 0, DEFAULT_STYLE), id: 'p', closed: true }, [[0, 0], [100, 0], [50, 80]]);
    const out: any = exportInterchange([poly], '#fff', false);
    expect(out.elements[0].polygon).toBe(true);
    expect(out.elements[0].points).toHaveLength(4);
    const back = importInterchange(out).elements[0];
    expect(back.closed).toBe(true);
    expect(back.points).toHaveLength(3);
  });
});
