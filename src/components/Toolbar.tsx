'use client';
import type { AppState, ToolType } from '@/lib/types';
import { Icons } from './icons';
import { Toolbar as SdkToolbar, ToolbarButton, ToolbarSeparator } from '@ui-sdk/react/toolbar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@ui-sdk/react/tooltip';
import { Menu, MenuContent, MenuGroupLabel, MenuItem, MenuItemIndicator, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@ui-sdk/react/menu';

interface Tool { id: ToolType; label: string; key: string; icon: keyof typeof Icons }

/** Tools in display order, grouped by purpose; groups are divided by a "|" separator. */
const GROUPS: { name: string; tools: Tool[] }[] = [
  { name: 'Navigate', tools: [
    { id: 'hand', label: 'Hand (panning tool)', key: 'H', icon: 'hand' },
    { id: 'selection', label: 'Selection', key: '1', icon: 'selection' },
  ] },
  { name: 'Shapes', tools: [
    { id: 'rectangle', label: 'Rectangle', key: '2', icon: 'rectangle' },
    { id: 'diamond', label: 'Diamond', key: '3', icon: 'diamond' },
    { id: 'ellipse', label: 'Ellipse', key: '4', icon: 'ellipse' },
  ] },
  { name: 'Lines', tools: [
    { id: 'arrow', label: 'Arrow', key: '5', icon: 'arrow' },
    { id: 'line', label: 'Line', key: '6', icon: 'line' },
    { id: 'freedraw', label: 'Draw', key: '7', icon: 'freedraw' },
  ] },
  { name: 'Content', tools: [
    { id: 'text', label: 'Text', key: '8', icon: 'text' },
    { id: 'markdown', label: 'Markdown block', key: 'M', icon: 'markdown' },
    { id: 'image', label: 'Insert image', key: '9', icon: 'image' },
    { id: 'embed', label: 'Embed web page', key: 'I', icon: 'embed' },
  ] },
  { name: 'Structure', tools: [
    { id: 'frame', label: 'Frame', key: 'F', icon: 'frameTool' },
    { id: 'comment', label: 'Comment', key: 'C', icon: 'comment' },
  ] },
  { name: 'Utility', tools: [
    { id: 'bucket', label: 'Bucket fill', key: 'B', icon: 'bucket' },
    { id: 'eraser', label: 'Eraser', key: 'E', icon: 'eraser' },
    { id: 'laser', label: 'Laser pointer', key: 'K', icon: 'laser' },
  ] },
];

const BTN = 38, SEP = 9, PAD = 8; // px: button + gap, separator, toolbar padding
const FIXED = BTN + SEP; // the lock button and its separator

/** How many tools (from the start of the list) fit next to the lock button and the "more" button. */
export function visibleToolCount(width: number): number {
  const flat = GROUPS.flatMap((g, gi) => g.tools.map((t, i) => ({ t, startsGroup: i === 0 && gi > 0 })));
  const avail = width < 1000 ? width - 62 - 14 : Infinity; // minus the menu button and the screen edge
  const total = PAD + FIXED + flat.reduce((w, f) => w + BTN + (f.startsGroup ? SEP : 0), 0);
  if (total <= avail) return flat.length;
  let used = PAD + FIXED + BTN + SEP; // room kept for the "more" button
  let n = 0;
  for (const f of flat) {
    const w = BTN + (f.startsGroup ? SEP : 0);
    if (used + w > avail) break;
    used += w;
    n++;
  }
  return Math.max(2, n);
}

function Tip({ label, kbd, children }: { label: string; kbd?: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      {children}
      <TooltipContent className="tip">{label}{kbd && <kbd>{kbd}</kbd>}</TooltipContent>
    </Tooltip>
  );
}

export default function Toolbar({ app, actions }: { app: AppState; actions: any }) {
  const shown = visibleToolCount(app.width);
  let index = 0;
  const inline: { name: string; tools: Tool[] }[] = [];
  const overflow: { name: string; tools: Tool[] }[] = [];
  for (const g of GROUPS) {
    const a = g.tools.filter(() => index++ < shown);
    const b = g.tools.filter((t) => !a.includes(t));
    if (a.length) inline.push({ name: g.name, tools: a });
    if (b.length) overflow.push({ name: g.name, tools: b });
  }
  const activeInOverflow = overflow.some((g) => g.tools.some((t) => t.id === app.tool));

  return (
    <SdkToolbar className="toolbar" aria-label="Drawing tools">
      <Tip label="Keep selected tool active" kbd="Q">
        <ToolbarButton render={<TooltipTrigger />} className={`tool ${app.toolLocked ? 'active' : ''}`} aria-label="Keep selected tool active" aria-pressed={app.toolLocked} onClick={() => actions.setApp({ toolLocked: !app.toolLocked })}>
          {app.toolLocked ? Icons.lock : Icons.unlock}
        </ToolbarButton>
      </Tip>
      {inline.map((g) => (
        <span key={g.name} className="tool-group" role="group" aria-label={g.name}>
          <ToolbarSeparator className="sep" />
          {g.tools.map((t) => (
            <Tip key={t.id} label={t.label} kbd={t.key}>
              <ToolbarButton render={<TooltipTrigger />} className={`tool ${app.tool === t.id ? 'active' : ''}`} aria-label={t.label} aria-pressed={app.tool === t.id} aria-keyshortcuts={t.key} onClick={() => actions.setTool(t.id)}>
                {Icons[t.icon]}
                <span className="badge" aria-hidden="true">{t.key}</span>
              </ToolbarButton>
            </Tip>
          ))}
        </span>
      ))}
      {overflow.length > 0 && (
        <span className="tool-group">
          <ToolbarSeparator className="sep" />
          <Menu>
            <ToolbarButton render={<MenuTrigger />} className={`tool ${activeInOverflow ? 'active' : ''}`} aria-label="More tools">
              {Icons.more}
            </ToolbarButton>
            <MenuContent className="menu tools-menu" align="end" sideOffset={8} aria-label="More tools">
              <MenuRadioGroup value={app.tool} onValueChange={(v: string) => actions.setTool(v as ToolType)}>
                {overflow.map((g, i) => (
                  <div key={g.name}>
                    {i > 0 && <MenuSeparator className="menu-sep" />}
                    <MenuGroupLabel className="menu-label">{g.name}</MenuGroupLabel>
                    {g.tools.map((t) => (
                      <MenuRadioItem key={t.id} value={t.id} closeOnSelect className="menu-item">
                        <span className="mi-icon">{Icons[t.icon]}</span>
                        <span className="mi-label">{t.label}</span>
                        <span className="mi-kbd" aria-hidden="true">{t.key}</span>
                        <MenuItemIndicator className="mi-check">✓</MenuItemIndicator>
                      </MenuRadioItem>
                    ))}
                  </div>
                ))}
              </MenuRadioGroup>
            </MenuContent>
          </Menu>
        </span>
      )}
    </SdkToolbar>
  );
}
