'use client';
/** Thin, app-styled wrappers around UI SDK parts, so every control in the app goes through the SDK. */
import type { ReactNode } from 'react';
import { Button } from '@ui-sdk/react/button';
import { Toggle, ToggleGroup } from '@ui-sdk/react/toggle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui-sdk/react/select';
import { Slider, SliderControl, SliderIndicator, SliderThumb, SliderTrack } from '@ui-sdk/react/slider';
import { Checkbox, CheckboxIndicator } from '@ui-sdk/react/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@ui-sdk/react/tooltip';
import { createFileInputController, FileInput } from '@ui-sdk/react/file-input';
import { ColorPicker, ColorPickerArea, ColorPickerAreaThumb, ColorPickerInput, ColorPickerSlider, ColorPickerSliderThumb } from '@ui-sdk/react/color-picker';

export { Button };
export { Input } from '@ui-sdk/react/input';
export { Textarea } from '@ui-sdk/react/textarea';

/** Icon button with an accessible name and a tooltip. */
export function IconButton({ label, kbd, className, children, ...props }: { label: string; kbd?: string; className?: string; children: ReactNode } & Omit<React.ComponentProps<typeof Button>, 'children' | 'className'>) {
  return (
    <Tooltip>
      <Button render={<TooltipTrigger />} aria-label={label} className={className} {...(props as any)}>{children}</Button>
      <TooltipContent className="tip">{label}{kbd && <kbd>{kbd}</kbd>}</TooltipContent>
    </Tooltip>
  );
}

export interface Choice<T> { value: T; label: string; node: ReactNode }

/** A single-choice group of toggle buttons (never empty). */
export function OptionGroup<T extends string | number | boolean | null>({ value, options, onChange, label }: { value: T; options: Choice<T>[]; onChange: (v: T) => void; label: string }) {
  return (
    <ToggleGroup value={[String(value)]} deselectable={false} aria-label={label} className="opt-group" onValueChange={(vals) => {
      const hit = options.find((o) => String(o.value) === vals[0]);
      if (hit) onChange(hit.value);
    }}>
      {options.map((o) => (
        <Tooltip key={String(o.value)}>
          <Toggle render={<TooltipTrigger />} value={String(o.value)} aria-label={o.label} className="opt">{o.node}</Toggle>
          <TooltipContent className="tip">{o.label}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}

export function SelectField({ value, onChange, items, label, className }: { value: string; onChange: (v: string) => void; items: { value: string; label: string }[]; label: string; className?: string }) {
  return (
    <Select items={items} value={value} onValueChange={(v: any) => v != null && onChange(String(v))}>
      <SelectTrigger className={`select ${className ?? ''}`} aria-label={label}>
        <SelectValue />
        <span aria-hidden="true" className="select-caret">▾</span>
      </SelectTrigger>
      <SelectContent className="menu select-pop" sideOffset={4}>
        {items.map((i) => <SelectItem key={i.value} value={i.value} className="menu-item"><span className="mi-label">{i.label}</span></SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function SliderField({ value, onChange, min = 0, max = 100, step = 1, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string }) {
  return (
    <Slider value={value} min={min} max={max} step={step} className="slider" onValueChange={(v: any) => onChange(Array.isArray(v) ? v[0] : v)}>
      <SliderControl className="slider-control">
        <SliderTrack className="slider-track">
          <SliderIndicator className="slider-fill" />
          <SliderThumb aria-label={label} className="slider-thumb" />
        </SliderTrack>
      </SliderControl>
    </Slider>
  );
}

export function CheckField({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="check">
      <Checkbox checked={checked} onCheckedChange={(c: any) => onChange(c === true)} className="checkbox">
        <CheckboxIndicator aria-hidden="true">✓</CheckboxIndicator>
      </Checkbox>
      {children}
    </label>
  );
}

export { createFileInputController };

/** Invisible SDK file input; open it from any button with `controller.open()`. Calls `onFile` with the chosen file. */
export function FilePick({ controller, accept, onFile }: { controller: ReturnType<typeof createFileInputController>; accept?: string; onFile: (f: File) => void }) {
  return (
    <FileInput
      controller={controller} accept={accept} className="file-pick" aria-label="Choose a file"
      onValueChange={(files) => {
        const f = files[0];
        if (!f) return;
        controller.clear(); // ready for the next pick (and the same file again)
        onFile(f);
      }}
      onReject={() => {}}
    />
  );
}

/** Saturation/brightness area, hue slider and hex field built from the SDK colour picker. */
export function ColorField({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label: string }) {
  return (
    <ColorPicker aria-label={label} format="hex" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onValueChange={(v: any) => { if (typeof v === 'string') onChange(v.toLowerCase()); }} className="cp">
      <ColorPickerArea className="cp-area"><ColorPickerAreaThumb className="cp-thumb" /></ColorPickerArea>
      <ColorPickerSlider channel="hue" className="cp-slider"><ColorPickerSliderThumb className="cp-thumb" /></ColorPickerSlider>
      <ColorPickerInput aria-label="Hex color" className="field" />
    </ColorPicker>
  );
}
