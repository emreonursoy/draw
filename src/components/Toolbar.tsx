'use client';
import type { AppState, ToolType } from '@/lib/types';
import { Icons } from './icons';
import { Toolbar as SdkToolbar, ToolbarButton, ToolbarSeparator } from '@ui-sdk/react/toolbar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@ui-sdk/react/tooltip';

const TOOLS: { id: ToolType; label: string; key: string }[] = [
  { id: 'hand', label: 'Hand (panning tool)', key: 'H' },
  { id: 'selection', label: 'Selection', key: '1' },
  { id: 'rectangle', label: 'Rectangle', key: '2' },
  { id: 'diamond', label: 'Diamond', key: '3' },
  { id: 'ellipse', label: 'Ellipse', key: '4' },
  { id: 'arrow', label: 'Arrow', key: '5' },
  { id: 'line', label: 'Line', key: '6' },
  { id: 'freedraw', label: 'Draw', key: '7' },
  { id: 'text', label: 'Text', key: '8' },
  { id: 'image', label: 'Insert image', key: '9' },
  { id: 'frame', label: 'Frame', key: 'F' },
  { id: 'comment', label: 'Comment', key: 'C' },
  { id: 'eraser', label: 'Eraser', key: 'E' },
  { id: 'laser', label: 'Laser pointer', key: 'K' },
];

function Tip({ label, kbd, children }: { label: string; kbd?: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      {children}
      <TooltipContent className="tip">{label}{kbd && <kbd>{kbd}</kbd>}</TooltipContent>
    </Tooltip>
  );
}

export default function Toolbar({ app, actions }: { app: AppState; actions: any }) {
  return (
    <SdkToolbar className="toolbar" aria-label="Drawing tools">
      <Tip label="Keep selected tool active" kbd="Q">
        <ToolbarButton render={<TooltipTrigger />} className={`tool ${app.toolLocked ? 'active' : ''}`} aria-label="Keep selected tool active" aria-pressed={app.toolLocked} onClick={() => actions.setApp({ toolLocked: !app.toolLocked })}>
          {app.toolLocked ? Icons.lock : Icons.unlock}
        </ToolbarButton>
      </Tip>
      <ToolbarSeparator className="sep" />
      {TOOLS.map((t) => (
        <Tip key={t.id} label={t.label} kbd={t.key}>
          <ToolbarButton render={<TooltipTrigger />} className={`tool ${app.tool === t.id ? 'active' : ''}`} aria-label={t.label} aria-pressed={app.tool === t.id} aria-keyshortcuts={t.key} onClick={() => actions.setTool(t.id)}>
            {Icons[(t.id === 'frame' ? 'frameTool' : t.id) as keyof typeof Icons]}
            <span className="badge" aria-hidden="true">{t.key}</span>
          </ToolbarButton>
        </Tip>
      ))}
    </SdkToolbar>
  );
}
