'use client';
import type { ReactNode } from 'react';
import { Scroll } from './ui';
import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogTitle } from '@ui-sdk/react/dialog';

/** Accessible modal built on UI SDK's Dialog: focus trap, Escape, outside press, focus return. */
export function Modal({ title, onClose, children, width, height }: { title: string; onClose: () => void; children: ReactNode; width?: number; height?: number | string }) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogBackdrop className="modal-back" />
      <DialogContent className={`modal ${height ? '' : 'has-scroll'}`} style={{ width: width ?? 860, ...(height ? { height, display: 'flex', flexDirection: 'column' as const } : {}) }}>
        <div className="modal-head">
          <DialogTitle>{title}</DialogTitle>
          <DialogClose aria-label="Close" className="icon-btn sm">✕</DialogClose>
        </div>
        {height ? children : <Scroll label={title} className="modal-scroll">{children}</Scroll>}
      </DialogContent>
    </Dialog>
  );
}
