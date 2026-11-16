'use client';
import type { AppState, DrawElement } from '@/lib/types';
import { blockedReason, hostOf, toEmbedUrl } from '@/lib/embed';
import { Button } from './ui';

const HEADER = 30; // scene px, matches the card drawn on the canvas

/**
 * Live pages for embeds the user chose to load. They sit between the drawing and the selection layer; a page only
 * receives clicks while it is "active" (after a double-click), so it never gets in the way of selecting or moving it.
 */
export default function EmbedLayer({ app, elements, actions }: { app: AppState; elements: DrawElement[]; actions: any }) {
  const loaded = elements.filter((e) => e.type === 'embed' && e.url && app.loadedEmbeds[e.id] && !blockedReason(e.url));
  if (!loaded.length) return null;
  return (
    <div className="embed-layer" aria-live="polite">
      {loaded.map((el) => {
        const active = app.activeEmbed === el.id;
        const sx = (el.x + app.scrollX) * app.zoom, sy = (el.y + app.scrollY) * app.zoom;
        const transform = `translate(${sx}px, ${sy}px) scale(${app.zoom}) translate(${el.width / 2}px, ${el.height / 2}px) rotate(${el.angle}rad) translate(${-el.width / 2}px, ${-el.height / 2}px)`;
        return (
          <div key={el.id} className={`embed-frame ${active ? 'active' : ''}`} style={{ width: el.width, height: el.height, transform, opacity: el.opacity / 100 }}>
            <div className="embed-bar" style={{ height: HEADER }}>
              <span className="embed-host" title={el.url}>{hostOf(el.url!)}</span>
              <Button className="embed-btn" onClick={() => actions.setApp({ activeEmbed: active ? null : el.id })}>{active ? 'Done' : 'Interact'}</Button>
              <Button className="embed-btn" aria-label="Open in a new tab" onClick={() => window.open(el.url, '_blank', 'noopener,noreferrer')}>Open ↗</Button>
              <Button className="embed-btn" aria-label="Unload this page" onClick={() => actions.unloadEmbed(el.id)}>✕</Button>
            </div>
            <iframe
              title={`Embedded page: ${hostOf(el.url!)}`}
              src={toEmbedUrl(el.url!)}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
              referrerPolicy="no-referrer"
              loading="lazy"
              allow="fullscreen; picture-in-picture; encrypted-media"
              style={{ top: HEADER, height: el.height - HEADER, pointerEvents: active ? 'auto' : 'none' }}
            />
          </div>
        );
      })}
    </div>
  );
}
