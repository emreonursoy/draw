'use client';
import { useState, type ReactNode } from 'react';
import type { AppState, DrawElement, Style } from '@/lib/types';
import { Icons } from './icons';

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
function Opt<T>({ cur, val, onPick, title, children }: { cur: T; val: T; onPick: (v: T) => void; title: string; children: ReactNode }) {
  return (
    <button className={`opt ${cur === val ? 'active' : ''}`} title={title} onClick={() => onPick(val)}>{children}</button>
  );
}

function ColorPicker({ value, presets, onChange, transparent }: { value: string; presets: string[]; onChange: (c: string) => void; transparent?: boolean }) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState('');
  const sw = (c: string, size = 'sm') => (
    <button
      key={c + size} className={`swatch ${size} ${value.toLowerCase() === c ? 'active' : ''} ${c === 'transparent' ? 'transparent' : ''}`}
      style={{ background: c === 'transparent' ? undefined : c }} title={c} onClick={() => onChange(c)}
    />
  );
  return (
    <div className="color-picker">
      <div className="prop-row">
        {presets.map((c) => sw(c))}
        <span className="sep" />
        <button className="swatch sm current" style={{ background: value === 'transparent' ? undefined : value }} title="More colors" onClick={() => { setOpen(!open); setHex(value === 'transparent' ? '' : value); }}>
          {value === 'transparent' && <span className="slash" />}
        </button>
      </div>
      {open && (
        <div className="color-pop">
          {transparent && <div className="color-row">{sw('transparent', 'md')}</div>}
          {HUES.map((row, i) => <div key={i} className="color-row">{row.map((c) => sw(c, 'md'))}</div>)}
          <div className="hex-row">
            <span>#</span>
            <input
              value={hex.replace('#', '')} maxLength={6} placeholder="hex" spellCheck={false}
              onChange={(e) => { setHex('#' + e.target.value); if (/^[0-9a-f]{6}$/i.test(e.target.value)) onChange('#' + e.target.value.toLowerCase()); }}
            />
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => { onChange(e.target.value); setHex(e.target.value); }} />
          </div>
        </div>
      )}
    </div>
  );
}

const HEADS = [[null, 'None'], ['arrow', 'Arrow'], ['bar', 'Bar'], ['dot', 'Dot'], ['triangle', 'Triangle']] as const;

export default function PropertiesPanel({ app, selected, actions }: { app: AppState; selected: DrawElement[]; actions: any }) {
  const subjects: string[] = selected.length ? selected.map((e) => e.type) : [app.tool];
  const has = (...t: string[]) => subjects.some((s) => t.includes(s));
  const first = selected[0];
  const v = <K extends keyof Style>(k: K): Style[K] => (first ? (first[k] as Style[K]) : app.style[k]);
  const set = (p: Partial<Style>) => actions.applyStyle(p);
  const shape = has('rectangle', 'diamond', 'ellipse');
  const lin = has('arrow', 'line');
  const hasText = has('text', 'markdown') || selected.some((e) => e.text);
  const many = selected.length > 1;
  const A = actions;

  return (
    <div className="panel" onPointerDown={(e) => e.stopPropagation()}>
      {!has('image') && (
        <Section label="Stroke">
          <ColorPicker value={v('strokeColor')} presets={STROKES} onChange={(c) => set({ strokeColor: c })} />
        </Section>
      )}
      {has('markdown') && !shape && (
        <Section label="Background"><ColorPicker value={v('backgroundColor')} presets={BGS} transparent onChange={(c) => set({ backgroundColor: c })} /></Section>
      )}
      {shape && (
        <>
          <Section label="Background"><ColorPicker value={v('backgroundColor')} presets={BGS} transparent onChange={(c) => set({ backgroundColor: c })} /></Section>
          <Section label="Fill">
            {(['hachure', 'cross-hatch', 'solid', 'zigzag'] as const).map((f) => (
              <Opt key={f} cur={v('fillStyle')} val={f} onPick={(x) => set({ fillStyle: x })} title={f}>
                <svg width="18" height="18" viewBox="0 0 18 18" stroke="currentColor" strokeWidth="1.3" fill="none">
                  <rect x="2" y="2" width="14" height="14" rx="2" />
                  {f === 'hachure' && <path d="M4 14L14 4M7 15L15 7M3 10L10 3" />}
                  {f === 'cross-hatch' && <path d="M4 14L14 4M7 15L15 7M3 10L10 3M4 4l10 10M3 8l7 7M8 3l7 7" />}
                  {f === 'solid' && <rect x="2" y="2" width="14" height="14" rx="2" fill="currentColor" />}
                  {f === 'zigzag' && <path d="M3 6l3-3 3 3 3-3M3 11l3-3 3 3 3-3 3 3M5 15l3-3 3 3 3-3" />}
                </svg>
              </Opt>
            ))}
          </Section>
        </>
      )}
      {(shape || lin || has('freedraw')) && (
        <Section label="Stroke width">
          {[1, 2, 4].map((w) => (
            <Opt key={w} cur={v('strokeWidth')} val={w} onPick={(x) => set({ strokeWidth: x })} title={['Thin', 'Bold', 'Extra bold'][[1, 2, 4].indexOf(w)]}>
              <svg width="20" height="18"><line x1="3" y1="9" x2="17" y2="9" stroke="currentColor" strokeWidth={w + 0.5} strokeLinecap="round" /></svg>
            </Opt>
          ))}
        </Section>
      )}
      {(shape || lin) && (
        <>
          <Section label="Stroke style">
            {(['solid', 'dashed', 'dotted'] as const).map((s) => (
              <Opt key={s} cur={v('strokeStyle')} val={s} onPick={(x) => set({ strokeStyle: x })} title={s}>
                <svg width="20" height="18"><line x1="3" y1="9" x2="17" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={s === 'solid' ? undefined : s === 'dashed' ? '4 3' : '0.5 4'} /></svg>
              </Opt>
            ))}
          </Section>
          <Section label="Sloppiness">
            {[0, 1, 2].map((r) => (
              <Opt key={r} cur={v('roughness')} val={r} onPick={(x) => set({ roughness: x })} title={['Architect', 'Artist', 'Cartoonist'][r]}>
                <svg width="20" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  {r === 0 ? <path d="M2 11h16" /> : r === 1 ? <path d="M2 11c4-3 7 2 16-1" /> : <path d="M2 12c2-6 5 4 7-2s5 5 9-3" />}
                </svg>
              </Opt>
            ))}
          </Section>
        </>
      )}
      {has('rectangle', 'diamond') && (
        <Section label="Edges">
          <Opt cur={v('roundness')} val={false} onPick={(x) => set({ roundness: x })} title="Sharp"><svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 15V3h12" /></svg></Opt>
          <Opt cur={v('roundness')} val={true} onPick={(x) => set({ roundness: x })} title="Round"><svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 15V8a5 5 0 015-5h7" /></svg></Opt>
        </Section>
      )}
      {lin && (
        <Section label={has('arrow') ? 'Arrow type' : 'Line type'}>
          {(has('arrow') ? ['sharp', 'round', 'elbow'] : ['sharp', 'round']).map((t) => (
            <Opt key={t} cur={v('arrowType')} val={t as Style['arrowType']} onPick={(x) => set({ arrowType: x })} title={t}>
              <svg width="20" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                {t === 'sharp' ? <path d="M3 15L10 4l7 11" /> : t === 'round' ? <path d="M3 15C5 2 15 2 17 15" /> : <path d="M3 15V9h14V3" />}
              </svg>
            </Opt>
          ))}
        </Section>
      )}
      {has('arrow') && (
        <Section label="Arrowheads">
          <select className="select" value={String(v('startArrowhead'))} onChange={(e) => set({ startArrowhead: e.target.value === 'null' ? null : (e.target.value as any) })}>
            {HEADS.map(([k, l]) => <option key={String(k)} value={String(k)}>Start: {l}</option>)}
          </select>
          <select className="select" value={String(v('endArrowhead'))} onChange={(e) => set({ endArrowhead: e.target.value === 'null' ? null : (e.target.value as any) })}>
            {HEADS.map(([k, l]) => <option key={String(k)} value={String(k)}>End: {l}</option>)}
          </select>
        </Section>
      )}
      {hasText && (
        <>
          <Section label="Font family">
            {([[1, 'Hand-drawn', 'Aa'], [2, 'Normal', 'Aa'], [3, 'Code', '</>']] as const).map(([f, t, g]) => (
              <Opt key={f} cur={v('fontFamily')} val={f as 1 | 2 | 3} onPick={(x) => set({ fontFamily: x })} title={t}>
                <span style={{ fontFamily: f === 1 ? 'Caveat, cursive' : f === 2 ? 'Inter, sans-serif' : 'monospace', fontSize: 15 }}>{g}</span>
              </Opt>
            ))}
          </Section>
          <Section label="Font size">
            {([['S', 16], ['M', 20], ['L', 28], ['XL', 36]] as const).map(([l, s]) => (
              <Opt key={l} cur={v('fontSize')} val={s} onPick={(x) => set({ fontSize: x })} title={`${s}px`}><span style={{ fontSize: 12, fontWeight: 600 }}>{l}</span></Opt>
            ))}
          </Section>
          {!subjects.every((s) => s === 'markdown') && (
          <Section label="Text align">
            {(['left', 'center', 'right'] as const).map((al) => (
              <Opt key={al} cur={v('textAlign')} val={al} onPick={(x) => set({ textAlign: x })} title={al}>
                <svg width="18" height="18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  {al === 'left' ? <path d="M3 4h12M3 9h8M3 14h12" /> : al === 'center' ? <path d="M3 4h12M5 9h8M3 14h12" /> : <path d="M3 4h12M7 9h8M3 14h12" />}
                </svg>
              </Opt>
            ))}
          </Section>
          )}
        </>
      )}
      <Section label={`Opacity`}>
        <input className="slider" type="range" min={0} max={100} step={10} value={v('opacity')} onChange={(e) => set({ opacity: +e.target.value })} />
        <span className="val">{v('opacity')}</span>
      </Section>
      {selected.length > 0 && (
        <>
          <Section label="Layers">
            <button className="opt" title="Send to back (Ctrl+Shift+[)" onClick={() => A.layer('back')}>{Icons.back}</button>
            <button className="opt" title="Send backward (Ctrl+[)" onClick={() => A.layer('backward')}>{Icons.bwd}</button>
            <button className="opt" title="Bring forward (Ctrl+])" onClick={() => A.layer('forward')}>{Icons.fwd}</button>
            <button className="opt" title="Bring to front (Ctrl+Shift+])" onClick={() => A.layer('front')}>{Icons.front}</button>
          </Section>
          {many && (
            <Section label="Align">
              {([['left', '⇤'], ['hcenter', '⇔'], ['right', '⇥'], ['top', '⤒'], ['vcenter', '⇕'], ['bottom', '⤓']] as const).map(([k, g]) => (
                <button key={k} className="opt" title={`Align ${k}`} onClick={() => A.align(k)}>{g}</button>
              ))}
              {selected.length > 2 && (<>
                <button className="opt" title="Distribute horizontally" onClick={() => A.distribute('h')}>⋯</button>
                <button className="opt" title="Distribute vertically" onClick={() => A.distribute('v')}>⋮</button>
              </>)}
            </Section>
          )}
          <Section label="Actions">
            <button className="opt" title="Flip horizontal (Shift+H)" onClick={() => A.flip('h')}>{Icons.flipH}</button>
            <button className="opt" title="Flip vertical (Shift+V)" onClick={() => A.flip('v')}>{Icons.flipV}</button>
            <button className="opt" title="Duplicate (Ctrl+D)" onClick={A.duplicate}>{Icons.copy}</button>
            {many && <button className="opt" title="Group (Ctrl+G)" onClick={A.group}>{Icons.group}</button>}
            {selected.some((e) => e.groupIds.length) && <button className="opt" title="Ungroup (Ctrl+Shift+G)" onClick={A.ungroup}>⊟</button>}
            <button className="opt" title="Lock (Ctrl+Shift+L)" onClick={A.toggleLock}>{Icons.lock}</button>
            <button className="opt" title="Add to library" onClick={A.addToLibrary}>{Icons.library}</button>
            <button className="opt danger" title="Delete (Del)" onClick={A.deleteSelected}>{Icons.trash}</button>
          </Section>
        </>
      )}
    </div>
  );
}
