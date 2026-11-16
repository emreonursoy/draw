'use client';
import { useEffect, useRef, useState } from 'react';
import type { AppState, DrawElement } from '@/lib/types';
import { Button, Scroll, Textarea } from './ui';

export default function CommentPopover({ el, app, actions }: { el: DrawElement; app: AppState; actions: any }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const t = setTimeout(() => ref.current?.focus(), 20); return () => clearTimeout(t); }, [el.id]);
  const left = Math.min((el.x + app.scrollX) * app.zoom + 20, app.width - 300);
  const top = Math.min(Math.max((el.y + app.scrollY) * app.zoom - 14, 60), app.height - 280);
  const post = () => { if (text.trim()) { actions.addComment(el.id, text.trim()); setText(''); } };
  return (
    <div className="comment-pop" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="comment-head">
        <b>{el.resolved ? 'Resolved thread' : 'Comment'}</b>
        <Button className="icon-btn sm" aria-label="Close" onClick={actions.closeComment}>✕</Button>
      </div>
      <Scroll label="Comments in this thread" className="comment-scroll" contentClassName="comment-thread">
        {(el.thread || []).map((c, i) => (
          <div key={i} className="comment-item"><p>{c.text}</p><span>{new Date(c.at).toLocaleString()}</span></div>
        ))}
        {!(el.thread || []).length && <p className="muted">Write the first comment.</p>}
      </Scroll>
      <Textarea
        ref={ref} aria-label="Add a comment" value={text} placeholder="Add a comment…" rows={2} onValueChange={setText}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); post(); } if (e.key === 'Escape') actions.closeComment(); }}
      />
      <div className="comment-actions">
        <Button className="btn primary" style={{ padding: '0 12px', height: 30 }} onClick={post}>Post</Button>
        <Button className="btn" style={{ padding: '0 12px', height: 30 }} onClick={() => actions.toggleResolve(el.id)}>{el.resolved ? 'Reopen' : 'Resolve'}</Button>
        <Button className="btn danger-btn" style={{ padding: '0 12px', height: 30, marginLeft: 'auto' }} onClick={() => actions.deleteComment(el.id)}>Delete</Button>
      </div>
    </div>
  );
}
