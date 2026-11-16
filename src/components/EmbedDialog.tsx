'use client';
import { useState } from 'react';
import { sanitizeUrl } from '@/lib/embed';
import { Modal } from './Modal';
import { Button, Input } from './ui';

export function EmbedDialog({ initial, onSubmit, onClose }: { initial: string; onSubmit: (url: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  const url = sanitizeUrl(value);
  const submit = () => { setTouched(true); if (url) onSubmit(url); };
  return (
    <Modal title={initial ? 'Edit embedded page' : 'Embed a web page'} onClose={onClose} width={520}>
      <p className="muted" style={{ marginTop: 0 }}>Paste a link to show the live page on your canvas. YouTube, Vimeo and Loom links are converted to their players. Pages are only loaded after you double-click them.</p>
      <Input
        className="field" style={{ width: '100%', flex: 'none' }} aria-label="Page address" placeholder="https://example.com" autoFocus
        value={value} onValueChange={setValue} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') submit(); }}
      />
      {touched && !url && <p className="field-error" role="alert">Enter a valid http or https address.</p>}
      <p className="muted" style={{ fontSize: 12 }}>Some sites refuse to be shown inside other pages and will appear blank; use “Open ↗” on the embed for those.</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button className="btn" style={{ padding: '0 14px' }} onClick={onClose}>Cancel</Button>
        <Button className="btn primary" style={{ padding: '0 14px' }} onClick={submit}>{initial ? 'Save' : 'Embed'}</Button>
      </div>
    </Modal>
  );
}
