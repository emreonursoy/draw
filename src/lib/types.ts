export type Pt = [number, number];
export type ElType = 'rectangle' | 'diamond' | 'ellipse' | 'arrow' | 'line' | 'freedraw' | 'text' | 'image' | 'frame' | 'comment';
export type ToolType = ElType | 'selection' | 'eraser' | 'hand' | 'laser';
export type FillStyle = 'hachure' | 'cross-hatch' | 'solid' | 'zigzag';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export type Arrowhead = null | 'arrow' | 'bar' | 'dot' | 'triangle';
export type ArrowType = 'sharp' | 'round' | 'elbow';
export type TextAlign = 'left' | 'center' | 'right';

export interface Style {
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  opacity: number;
  roundness: boolean;
  fontFamily: 1 | 2 | 3;
  fontSize: number;
  textAlign: TextAlign;
  arrowType: ArrowType;
  startArrowhead: Arrowhead;
  endArrowhead: Arrowhead;
}

export interface DrawElement extends Style {
  id: string;
  type: ElType;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  seed: number;
  groupIds: string[];
  locked: boolean;
  points: Pt[]; // linear + freedraw, relative to x,y
  text: string; // text elements and labels
  dataURL?: string;
  startBinding: string | null;
  endBinding: string | null;
  thread?: { text: string; at: number }[];
  resolved?: boolean;
}

export interface AppState {
  tool: ToolType;
  toolLocked: boolean;
  scrollX: number;
  scrollY: number;
  zoom: number;
  selectedIds: Record<string, true>;
  theme: 'light' | 'dark';
  viewBg: string;
  grid: boolean;
  zen: boolean;
  style: Style;
  editing: { id: string; isNew: boolean } | null;
  width: number;
  height: number;
  showLibrary: boolean;
  exportOpen: boolean;
  helpOpen: boolean;
  menuOpen: boolean;
  contextMenu: { x: number; y: number } | null;
  projectsOpen: boolean;
  projectName: string;
  confirmClear: boolean;
  presenting: boolean;
  viewOnly: boolean;
  sharedView: boolean;
  activeComment: string | null;
  mermaidOpen: boolean;
  imageMode: 'original' | 'high' | 'compressed';
  fileLink: string | null;
}

export const FONTS: Record<number, string> = {
  1: "Caveat, 'Segoe Print', 'Comic Sans MS', cursive",
  2: "Inter, Helvetica, Arial, sans-serif",
  3: "'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace",
};

export const DEFAULT_STYLE: Style = {
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  fillStyle: 'hachure',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 1,
  opacity: 100,
  roundness: true,
  fontFamily: 1,
  fontSize: 24,
  textAlign: 'left',
  arrowType: 'round',
  startArrowhead: null,
  endArrowhead: 'arrow',
};
