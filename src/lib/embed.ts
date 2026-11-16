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

/* ---------- safety policy ---------- */

/** Most embedded pages that may be loaded at the same time. */
export const MAX_LOADED_EMBEDS = 5;

const PRIVATE_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.localdomain', '.home.arpa', '.intranet'];

/** True for addresses that point at the user's own machine or private network. */
export function isPrivateHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || PRIVATE_SUFFIXES.some((s) => host.endsWith(s))) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (host.includes(':')) {
    // IPv6: loopback, unspecified, unique-local (fc00::/7), link-local (fe80::/10), and IPv4-mapped addresses
    if (host === '::1' || host === '::') return true;
    if (/^f[cd]/.test(host) || /^fe[89ab]/.test(host)) return true;
    const mapped = /^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/.exec(host);
    if (mapped) return mapped[1] ? isPrivateHost(mapped[1]) : true; // hex form: treat as private to be safe
    return false;
  }
  return !host.includes('.'); // single-label names only resolve on a local network
}

export interface EmbedPolicy { origin?: string; allowLocal?: boolean }

/** The policy for the running app: its own origin is off limits, local addresses only while developing. */
export const embedPolicy = (): EmbedPolicy => ({
  origin: typeof location !== 'undefined' ? location.origin : undefined,
  allowLocal: process.env.NODE_ENV !== 'production',
});

/** Why a (syntactically valid) URL must not be embedded, or null when it may be. */
export function blockedReason(url: string, policy: EmbedPolicy = embedPolicy()): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return 'That is not a valid address.'; }
  if (policy.origin && u.origin === policy.origin) return 'That page belongs to this app itself, so it can’t be embedded.';
  if (!policy.allowLocal && isPrivateHost(u.hostname)) return 'Pages on your own computer or private network can’t be embedded.';
  return null;
}

/* ---------- hosts the user has chosen to trust ---------- */

const TRUST_KEY = 'draw:trustedHosts';

export function getTrustedHosts(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(TRUST_KEY) || '[]');
    return Array.isArray(v) ? v.filter((h): h is string => typeof h === 'string') : [];
  } catch { return []; }
}
export const isTrustedHost = (host: string) => getTrustedHosts().includes(host.toLowerCase());
export function trustHost(host: string) {
  const list = new Set(getTrustedHosts());
  list.add(host.toLowerCase());
  try { localStorage.setItem(TRUST_KEY, JSON.stringify([...list].slice(-200))); } catch { /* storage full: the user will simply be asked again */ }
}
