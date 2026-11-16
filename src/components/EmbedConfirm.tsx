'use client';
import { hostOf } from '@/lib/embed';
import { Modal } from './Modal';
import { Button } from './ui';

/** Asked before an embedded page is loaded for the first time (and every time for shared drawings). */
export function EmbedConfirm({ url, shared, onLoad, onClose }: { url: string; shared: boolean; onLoad: (remember: boolean) => void; onClose: () => void }) {
  const host = hostOf(url);
  return (
    <Modal title={`Load content from ${host}?`} onClose={onClose} width={480}>
      <p className="muted" style={{ marginTop: 0 }}>
        {shared ? 'This drawing was shared with you. ' : ''}Loading the page connects your browser to <b>{host}</b>, which can then see your IP address and show you its content. Only continue if you trust this site and the person who added the link.
      </p>
      <p className="embed-confirm-url" title={url}>{url}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Button className="btn" style={{ padding: '0 14px' }} onClick={onClose}>Cancel</Button>
        <Button className="btn" style={{ padding: '0 14px' }} onClick={() => onLoad(false)}>Load this time</Button>
        {!shared && <Button className="btn primary" style={{ padding: '0 14px' }} onClick={() => onLoad(true)}>Always trust {host}</Button>}
      </div>
    </Modal>
  );
}
