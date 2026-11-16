'use client';
import type { ReactNode } from 'react';
import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogTitle } from '@ui-sdk/react/dialog';

/** Accessible modal built on UI SDK's Dialog: focus trap, Escape, outside press, focus return. */
export function Modal({ title, onClose, children, width }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogBackdrop className="modal-back" />
      <DialogContent className="modal" style={{ width: width ?? 860 }}>
        <div className="modal-head">
          <DialogTitle>{title}</DialogTitle>
          <DialogClose aria-label="Close" className="icon-btn sm">✕</DialogClose>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}
