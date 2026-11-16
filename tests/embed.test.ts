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
