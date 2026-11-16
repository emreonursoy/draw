import { describe, expect, it } from 'vitest';
import { hostOf, sanitizeUrl, toEmbedUrl } from '@/lib/embed';

describe('sanitizeUrl', () => {
  it('accepts http and https links and adds https when the scheme is missing', () => {
    expect(sanitizeUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(sanitizeUrl('http://example.com')).toBe('http://example.com/');
    expect(sanitizeUrl('example.com/path')).toBe('https://example.com/path');
    expect(sanitizeUrl('  https://example.com  ')).toBe('https://example.com/');
  });

  it('rejects dangerous or unusable schemes', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'blob:https://x.test/abc', 'ftp://example.com', 'vbscript:x', 'JaVaScRiPt:alert(1)']) {
      expect(sanitizeUrl(bad)).toBeNull();
    }
  });

  it('rejects credentials, whitespace, hosts without a dot and non-strings', () => {
    expect(sanitizeUrl('https://user:pass@example.com')).toBeNull();
    expect(sanitizeUrl('https://exa mple.com')).toBeNull();
    expect(sanitizeUrl('https://intranet')).toBeNull();
    expect(sanitizeUrl('')).toBeNull();
    expect(sanitizeUrl(null)).toBeNull();
    expect(sanitizeUrl({})).toBeNull();
    expect(sanitizeUrl('a'.repeat(3000) + '.com')).toBeNull();
  });

  it('allows localhost for development', () => {
    expect(sanitizeUrl('http://localhost:3000/x')).toBe('http://localhost:3000/x');
  });
});

describe('toEmbedUrl', () => {
  it('turns video watch pages into privacy-friendly player URLs', () => {
    expect(toEmbedUrl('https://www.youtube.com/watch?v=abc123')).toBe('https://www.youtube-nocookie.com/embed/abc123');
    expect(toEmbedUrl('https://youtu.be/abc123')).toBe('https://www.youtube-nocookie.com/embed/abc123');
    expect(toEmbedUrl('https://vimeo.com/12345')).toBe('https://player.vimeo.com/video/12345');
    expect(toEmbedUrl('https://www.loom.com/share/xyz')).toBe('https://www.loom.com/embed/xyz');
  });

  it('escapes the video id and leaves other URLs alone', () => {
    expect(toEmbedUrl('https://www.youtube.com/watch?v=a"b')).toBe('https://www.youtube-nocookie.com/embed/a%22b');
    expect(toEmbedUrl('https://example.com/page')).toBe('https://example.com/page');
    expect(toEmbedUrl('not a url')).toBe('not a url');
  });
});

describe('hostOf', () => {
  it('returns the host without www', () => {
    expect(hostOf('https://www.example.com/x')).toBe('example.com');
    expect(hostOf('garbage')).toBe('garbage');
  });
});

import { decideLoad, embedTarget, liveLoaded, blockedReason, getTrustedHosts, isPrivateHost, isTrustedHost, MAX_LOADED_EMBEDS, trustHost } from '../src/lib/embed';

describe('embed safety policy', () => {
  it('detects local and private hosts', () => {
    for (const h of ['localhost', 'app.localhost', '127.0.0.1', '10.1.2.3', '192.168.0.5', '172.16.0.1', '172.31.9.9', '169.254.169.254', '100.64.0.1', '0.0.0.0', '[::1]', '::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', 'printer.local', 'db.internal', 'intranet']) {
      expect(isPrivateHost(h), h).toBe(true);
    }
    for (const h of ['example.com', 'www.youtube.com', '8.8.8.8', '172.32.0.1', '172.15.0.1', '2606:4700::1111']) {
      expect(isPrivateHost(h), h).toBe(false);
    }
  });

  it('blocks the app\'s own origin', () => {
    const p = { origin: 'https://draw.example.com', allowLocal: false };
    expect(blockedReason('https://draw.example.com/anything', p)).toMatch(/this app/);
    expect(blockedReason('https://other.example.com/', p)).toBeNull();
  });

  it('blocks private hosts unless local development is allowed', () => {
    expect(blockedReason('http://192.168.1.1/admin', { allowLocal: false })).toMatch(/private network/);
    expect(blockedReason('http://localhost:3000/', { allowLocal: false })).not.toBeNull();
    expect(blockedReason('http://localhost:3000/', { allowLocal: true })).toBeNull();
  });

  it('rejects unparsable addresses', () => {
    expect(blockedReason('not a url', {})).not.toBeNull();
  });

  it('remembers trusted hosts', () => {
    localStorage.clear();
    expect(isTrustedHost('example.com')).toBe(false);
    trustHost('Example.com');
    expect(isTrustedHost('example.com')).toBe(true);
    trustHost('example.com');
    expect(getTrustedHosts()).toEqual(['example.com']);
    localStorage.setItem('draw:trustedHosts', '{"bad":1}');
    expect(getTrustedHosts()).toEqual([]);
  });

  it('has a sensible cap', () => { expect(MAX_LOADED_EMBEDS).toBeGreaterThan(0); });
});

describe('decideLoad (consent rules)', () => {
  const policy = { origin: 'https://draw.test', allowLocal: false };
  const a = { id: 'a', url: 'https://example.com/' };
  const none = () => false;

  it('asks before loading an unknown host, always for shared drawings', () => {
    expect(decideLoad(a, [a], {}, { shared: false, policy, trusted: none }).action).toBe('confirm');
    expect(decideLoad(a, [a], {}, { shared: false, policy, trusted: () => true }).action).toBe('load');
    expect(decideLoad(a, [a], {}, { shared: true, policy, trusted: () => true }).action).toBe('confirm');
  });

  it('blocks private and same-origin targets', () => {
    const p = { id: 'p', url: 'http://10.0.0.1/' };
    expect(decideLoad(p, [p], {}, { shared: false, policy, trusted: () => true }).action).toBe('blocked');
    const s = { id: 's', url: 'https://draw.test/x' };
    expect(decideLoad(s, [s], {}, { shared: false, policy }).action).toBe('blocked');
  });

  it('focuses an embed that is already loaded at its current address', () => {
    expect(decideLoad(a, [a], { a: a.url }, { shared: false, policy }).action).toBe('focus');
  });

  it('treats an embed whose link was edited as not loaded, so it must be confirmed again', () => {
    const edited = { id: 'a', url: 'https://evil.example/' };
    expect(liveLoaded({ a: 'https://example.com/' }, [edited])).toEqual([]);
    expect(decideLoad(edited, [edited], { a: 'https://example.com/' }, { shared: false, policy, trusted: none }).action).toBe('confirm');
  });

  it('counts only embeds that still exist toward the limit', () => {
    const els = Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, url: `https://s${i}.example.com/` }));
    const loaded = Object.fromEntries(els.slice(0, 5).map((e) => [e.id, e.url]));
    expect(decideLoad(els[5], els, loaded, { shared: false, policy, trusted: none }).action).toBe('limit');
    // four of the five were deleted
    expect(decideLoad(els[5], [els[0], els[5]], loaded, { shared: false, policy, trusted: none }).action).toBe('confirm');
  });

  it('checks the converted player address, not the pasted link', () => {
    expect(embedTarget('https://youtu.be/abc123')).toContain('youtube-nocookie.com');
  });
});
