/** URL handling for embedded web pages. Only http(s) links are ever accepted. */

const MAX_URL = 2048;

/** Normalises user input into a safe http(s) URL, or null. "example.com" becomes https://example.com/. */
export function sanitizeUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (!s || s.length > MAX_URL || /\s/.test(s)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s; // no scheme: assume https
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null; // blocks javascript:, data:, file:, blob: …
    if (!u.hostname || !u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    if (u.username || u.password) return null; // no credentials in links
    return u.toString();
  } catch {
    return null;
  }
}

/** Rewrites watch/share pages of well-known sites into their embeddable player URLs. */
export function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname === '/watch' && u.searchParams.get('v')) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(u.searchParams.get('v')!)}`;
      if (u.pathname.startsWith('/embed/')) return `https://www.youtube-nocookie.com${u.pathname}`;
    }
    if (host === 'youtu.be' && u.pathname.length > 1) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(u.pathname.slice(1))}`;
    if (host === 'vimeo.com' && /^\/\d+/.test(u.pathname)) return `https://player.vimeo.com/video/${u.pathname.match(/\d+/)![0]}`;
    if (host === 'loom.com' && u.pathname.startsWith('/share/')) return `https://www.loom.com/embed/${u.pathname.slice('/share/'.length)}`;
  } catch { /* fall through */ }
  return url;
}

export const hostOf = (url: string): string => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};
