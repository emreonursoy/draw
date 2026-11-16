'use client';
import type { ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './ui';

/** A "are you sure?" dialog for destructive actions. Cancel is focused first; shortcuts don't reach the canvas behind it. */
export function ConfirmDialog({ title, children, confirmLabel = 'Delete', onConfirm, onClose }: { title: string; children: ReactNode; confirmLabel?: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose} width={420}>
      <div onKeyDown={(e) => { if (e.key !== 'Escape') e.stopPropagation(); }}>
        <p className="muted" style={{ marginTop: 0 }}>{children}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button className="btn" autoFocus style={{ padding: '0 14px' }} onClick={onClose}>Cancel</Button>
          <Button className="btn danger-btn" style={{ padding: '0 14px' }} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}
