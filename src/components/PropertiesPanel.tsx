'use client';
import { useState, type ReactNode } from 'react';
import type { AppState, DrawElement, Style } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@ui-sdk/react/popover';
import { Icons } from './icons';
import { Button, ColorField, IconButton, OptionGroup, SelectField, SliderField, type Choice } from './ui';

const STROKES = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00'];
const BGS = ['transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99'];
const HUES: string[][] = [
  ['#ffffff', '#f8f9fa', '#e9ecef', '#ced4da', '#868e96', '#495057', '#1e1e1e'],
  ['#ffc9c9', '#ff8787', '#fa5252', '#e03131', '#c92a2a'],
  ['#fcc2d7', '#f783ac', '#e64980', '#c2255c', '#a61e4d'],
  ['#eebefa', '#da77f2', '#be4bdb', '#9c36b5', '#862e9c'],
  ['#d0bfff', '#9775fa', '#7950f2', '#6741d9', '#5f3dc4'],
  ['#bac8ff', '#748ffc', '#4c6ef5', '#3b5bdb', '#364fc7'],
  ['#a5d8ff', '#4dabf7', '#228be6', '#1971c2', '#1864ab'],
  ['#99e9f2', '#3bc9db', '#15aabf', '#0c8599', '#0b7285'],
  ['#96f2d7', '#38d9a9', '#12b886', '#099268', '#087f5b'],
  ['#b2f2bb', '#69db7c', '#40c057', '#2f9e44', '#2b8a3e'],
  ['#d8f5a2', '#a9e34b', '#82c91e', '#66a80f', '#5c940d'],
  ['#ffec99', '#ffd43b', '#fab005', '#f08c00', '#e67700'],
  ['#ffd8a8', '#ffa94d', '#fd7e14', '#e8590c', '#d9480f'],
];

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="prop">
      <div className="prop-label">{label}</div>
      <div className="prop-row">{children}</div>
    </div>
  );
}

const line = (w: number, dash?: string) => <svg width="20" height="18"><line x1="3" y1="9" x2="17" y2="9" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeDasharray={dash} /></svg>;
const stroke18 = (d: ReactNode, w = 1.6) => <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round">{d}</svg>;

function ColorPicker({ value, presets, onChange, transparent, label }: { value: string; presets: string[]; onChange: (c: string) => void; transparent?: boolean; label: string }) {
  const sw = (c: string, size = 'sm') => (
    <Button key={c + size} aria-label={c === 'transparent' ? 'No color' : c} className={`swatch ${size} ${value.toLowerCase() === c ? 'active' : ''} ${c === 'transparent' ? 'transparent' : ''}`} style={{ background: c === 'transparent' ? undefined : c }} onClick={() => onChange(c)} />
  );
  return (
    <div className="color-picker">
      <div className="prop-row">
        {presets.map((c) => sw(c))}
        <span className="sep" />
        <Popover>
          <PopoverTrigger className="swatch sm current" aria-label={`More ${label} colors`} style={{ background: value === 'transparent' ? undefined : value }}>
            {value === 'transparent' && <span className="slash" />}
          </PopoverTrigger>
          <PopoverContent className="menu color-pop" side="right" align="start" sideOffset={10} aria-label={`${label} colors`}>
            {transparent && <div className="color-row">{sw('transparent', 'md')}</div>}
            {HUES.map((row, i) => <div key={i} className="color-row">{row.map((c) => sw(c, 'md'))}</div>)}
            <ColorField label={`${label} color`} value={value === 'transparent' ? '#000000' : value} onChange={onChange} />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

const HEADS = [['none', 'None'], ['arrow', 'Arrow'], ['bar', 'Bar'], ['dot', 'Dot'], ['triangle', 'Triangle']].map(([value, label]) => ({ value, label }));

export default function PropertiesPanel({ app, selected, actions }: { app: AppState; selected: DrawElement[]; actions: any }) {
  const subjects: string[] = selected.length ? selected.map((e) => e.type) : [app.tool];
  const has = (...t: string[]) => subjects.some((s) => t.includes(s));
  const first = selected[0];
  const v = <K extends keyof Style>(k: K): Style[K] => (first ? (first[k] as Style[K]) : app.style[k]);
  const set = (p: Partial<Style>) => actions.applyStyle(p);
  const closedLine = selected.some((e) => e.type === 'line' && e.closed);
  const shape = has('rectangle', 'diamond', 'ellipse') || closedLine;
  const lin = has('arrow', 'line');
  const hasText = has('text', 'markdown') || selected.some((e) => e.text);
  const many = selected.length > 1;
  const A = actions;

  const fills: Choice<Style['fillStyle']>[] = (['hachure', 'cross-hatch', 'solid', 'zigzag'] as const).map((f) => ({
    value: f, label: f.charAt(0).toUpperCase() + f.slice(1),
    node: (
      <svg width="18" height="18" viewBox="0 0 18 18" stroke="currentColor" strokeWidth="1.3" fill="none">
        <rect x="2" y="2" width="14" height="14" rx="2" />
        {f === 'hachure' && <path d="M4 14L14 4M7 15L15 7M3 10L10 3" />}
        {f === 'cross-hatch' && <path d="M4 14L14 4M7 15L15 7M3 10L10 3M4 4l10 10M3 8l7 7M8 3l7 7" />}
        {f === 'solid' && <rect x="2" y="2" width="14" height="14" rx="2" fill="currentColor" />}
        {f === 'zigzag' && <path d="M3 6l3-3 3 3 3-3M3 11l3-3 3 3 3-3 3 3M5 15l3-3 3 3 3-3" />}
      </svg>
    ),
  }));
  const widths: Choice<number>[] = [[1, 'Thin'], [2, 'Bold'], [4, 'Extra bold']].map(([w, l]) => ({ value: w as number, label: l as string, node: line((w as number) + 0.5) }));
  const dashes: Choice<Style['strokeStyle']>[] = [['solid', undefined], ['dashed', '4 3'], ['dotted', '0.5 4']].map(([s, d]) => ({ value: s as Style['strokeStyle'], label: (s as string)[0].toUpperCase() + (s as string).slice(1), node: line(2, d as string | undefined) }));
  const rough: Choice<number>[] = [0, 1, 2].map((r) => ({
    value: r, label: ['Architect', 'Artist', 'Cartoonist'][r],
    node: <svg width="20" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">{r === 0 ? <path d="M2 11h16" /> : r === 1 ? <path d="M2 11c4-3 7 2 16-1" /> : <path d="M2 12c2-6 5 4 7-2s5 5 9-3" />}</svg>,
  }));
  const edges: Choice<boolean>[] = [
    { value: false, label: 'Sharp', node: stroke18(<path d="M3 15V3h12" />) },
    { value: true, label: 'Round', node: stroke18(<path d="M3 15V8a5 5 0 015-5h7" />) },
  ];
  const arrowTypes: Choice<Style['arrowType']>[] = (has('arrow') ? ['sharp', 'round', 'elbow'] as const : ['sharp', 'round'] as const).map((t) => ({
    value: t, label: t[0].toUpperCase() + t.slice(1),
    node: <svg width="20" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">{t === 'sharp' ? <path d="M3 15L10 4l7 11" /> : t === 'round' ? <path d="M3 15C5 2 15 2 17 15" /> : <path d="M3 15V9h14V3" />}</svg>,
  }));
  const fonts: Choice<1 | 2 | 3>[] = ([[1, 'Hand-drawn', 'Aa'], [2, 'Normal', 'Aa'], [3, 'Code', '</>']] as const).map(([f, t, g]) => ({
    value: f as 1 | 2 | 3, label: t, node: <span style={{ fontFamily: f === 1 ? 'Caveat, cursive' : f === 2 ? 'Inter, sans-serif' : 'monospace', fontSize: 15 }}>{g}</span>,
  }));
  const sizes: Choice<number>[] = ([['S', 16], ['M', 20], ['L', 28], ['XL', 36]] as const).map(([l, s]) => ({ value: s, label: `${l} (${s}px)`, node: <span style={{ fontSize: 12, fontWeight: 600 }}>{l}</span> }));
  const aligns: Choice<Style['textAlign']>[] = (['left', 'center', 'right'] as const).map((al) => ({
    value: al, label: `Align ${al}`,
    node: <svg width="18" height="18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">{al === 'left' ? <path d="M3 4h12M3 9h8M3 14h12" /> : al === 'center' ? <path d="M3 4h12M5 9h8M3 14h12" /> : <path d="M3 4h12M7 9h8M3 14h12" />}</svg>,
  }));
  const headVal = (k: 'startArrowhead' | 'endArrowhead') => String(v(k) ?? 'none');

  return (
    <div className="panel" onPointerDown={(e) => e.stopPropagation()}>
      {!has('image') && <Section label="Stroke"><ColorPicker label="stroke" value={v('strokeColor')} presets={STROKES} onChange={(c) => set({ strokeColor: c })} /></Section>}
      {(shape || has('markdown') || has('bucket')) && <Section label={has('bucket') ? 'Bucket colour' : 'Background'}><ColorPicker label="background" value={v('backgroundColor')} presets={BGS} transparent onChange={(c) => set({ backgroundColor: c })} /></Section>}
      {shape && !has('bucket') && <Section label="Fill"><OptionGroup label="Fill style" value={v('fillStyle')} options={fills} onChange={(x) => set({ fillStyle: x })} /></Section>}
      {(shape || lin || has('freedraw')) && <Section label="Stroke width"><OptionGroup label="Stroke width" value={v('strokeWidth')} options={widths} onChange={(x) => set({ strokeWidth: x })} /></Section>}
      {(shape || lin) && (
        <>
          <Section label="Stroke style"><OptionGroup label="Stroke style" value={v('strokeStyle')} options={dashes} onChange={(x) => set({ strokeStyle: x })} /></Section>
          <Section label="Sloppiness"><OptionGroup label="Sloppiness" value={v('roughness')} options={rough} onChange={(x) => set({ roughness: x })} /></Section>
        </>
      )}
      {has('rectangle', 'diamond') && <Section label="Edges"><OptionGroup label="Edges" value={v('roundness')} options={edges} onChange={(x) => set({ roundness: x })} /></Section>}
      {lin && <Section label={has('arrow') ? 'Arrow type' : 'Line type'}><OptionGroup label="Arrow type" value={v('arrowType')} options={arrowTypes} onChange={(x) => set({ arrowType: x })} /></Section>}
      {has('arrow') && (
        <Section label="Arrowheads">
          <SelectField label="Start arrowhead" className="full" value={headVal('startArrowhead')} items={HEADS.map((h) => ({ ...h, label: `Start: ${h.label}` }))} onChange={(x) => set({ startArrowhead: x === 'none' ? null : (x as any) })} />
          <SelectField label="End arrowhead" className="full" value={headVal('endArrowhead')} items={HEADS.map((h) => ({ ...h, label: `End: ${h.label}` }))} onChange={(x) => set({ endArrowhead: x === 'none' ? null : (x as any) })} />
        </Section>
      )}
      {hasText && (
        <>
          <Section label="Font family"><OptionGroup label="Font family" value={v('fontFamily')} options={fonts} onChange={(x) => set({ fontFamily: x })} /></Section>
          <Section label="Font size"><OptionGroup label="Font size" value={v('fontSize')} options={sizes} onChange={(x) => set({ fontSize: x })} /></Section>
          {!subjects.every((s) => s === 'markdown') && <Section label="Text align"><OptionGroup label="Text align" value={v('textAlign')} options={aligns} onChange={(x) => set({ textAlign: x })} /></Section>}
        </>
      )}
      <Section label="Opacity">
        <SliderField label="Opacity" value={v('opacity')} min={0} max={100} step={10} onChange={(x) => set({ opacity: x })} />
        <span className="val">{v('opacity')}</span>
      </Section>
      {selected.length > 0 && (
        <>
          <Section label="Layers">
            <IconButton className="opt" label="Send to back" kbd="Ctrl+Shift+[" onClick={() => A.layer('back')}>{Icons.back}</IconButton>
            <IconButton className="opt" label="Send backward" kbd="Ctrl+[" onClick={() => A.layer('backward')}>{Icons.bwd}</IconButton>
            <IconButton className="opt" label="Bring forward" kbd="Ctrl+]" onClick={() => A.layer('forward')}>{Icons.fwd}</IconButton>
            <IconButton className="opt" label="Bring to front" kbd="Ctrl+Shift+]" onClick={() => A.layer('front')}>{Icons.front}</IconButton>
          </Section>
          {many && (
            <Section label="Align">
              {([['left', '⇤'], ['hcenter', '⇔'], ['right', '⇥'], ['top', '⤒'], ['vcenter', '⇕'], ['bottom', '⤓']] as const).map(([k, g]) => (
                <IconButton key={k} className="opt" label={`Align ${k === 'hcenter' ? 'horizontal center' : k === 'vcenter' ? 'vertical center' : k}`} onClick={() => A.align(k)}>{g}</IconButton>
              ))}
              {selected.length > 2 && (<>
                <IconButton className="opt" label="Distribute horizontally" onClick={() => A.distribute('h')}>⋯</IconButton>
                <IconButton className="opt" label="Distribute vertically" onClick={() => A.distribute('v')}>⋮</IconButton>
              </>)}
            </Section>
          )}
          <Section label="Actions">
            <IconButton className="opt" label="Flip horizontal" kbd="Shift+H" onClick={() => A.flip('h')}>{Icons.flipH}</IconButton>
            <IconButton className="opt" label="Flip vertical" kbd="Shift+V" onClick={() => A.flip('v')}>{Icons.flipV}</IconButton>
            <IconButton className="opt" label="Duplicate" kbd="Ctrl+D" onClick={A.duplicate}>{Icons.copy}</IconButton>
            {selected.some((e) => e.type === 'freedraw') && <IconButton className="opt" label="Convert to shape" onClick={A.convertToShape}>{Icons.shapeConvert}</IconButton>}
            {selected.some((e) => e.type === 'embed') && <IconButton className="opt" label="Edit link" onClick={A.editEmbed}>{Icons.edit}</IconButton>}
            {many && <IconButton className="opt" label="Group" kbd="Ctrl+G" onClick={A.group}>{Icons.group}</IconButton>}
            {selected.some((e) => e.groupIds.length) && <IconButton className="opt" label="Ungroup" kbd="Ctrl+Shift+G" onClick={A.ungroup}>⊟</IconButton>}
            <IconButton className="opt" label="Lock" kbd="Ctrl+Shift+L" onClick={A.toggleLock}>{Icons.lock}</IconButton>
            <IconButton className="opt" label="Add to library" onClick={A.addToLibrary}>{Icons.library}</IconButton>
            <IconButton className="opt danger" label="Delete" kbd="Del" onClick={A.deleteSelected}>{Icons.trash}</IconButton>
          </Section>
        </>
      )}
    </div>
  );
}
