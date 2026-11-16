// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decodeScene, encodeScene, MAX_LINK_CHARS } from '@/lib/share';

const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function deflate(text: string) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return b64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

describe('share links', () => {
  it('round-trips a scene', async () => {
    const scene = { elements: [{ type: 'rectangle', x: 1, y: 2, text: 'héllo ✓' }], viewBg: '#fff' };
    expect(await decodeScene(await encodeScene(scene))).toEqual(scene);
  });

  it('produces URL-safe output', async () => {
    const enc = await encodeScene({ elements: Array.from({ length: 200 }, (_, i) => ({ i })), viewBg: '#fff' });
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects links longer than the limit before decoding', async () => {
    await expect(decodeScene('a'.repeat(MAX_LINK_CHARS + 1))).rejects.toThrow(/too large/);
  });

  it('rejects data that is not valid base64 or not deflate', async () => {
    await expect(decodeScene('%%%')).rejects.toThrow();
    await expect(decodeScene('AAAAAAAA')).rejects.toThrow();
  });

  it('stops decompression bombs', async () => {
    const bomb = await deflate('{"elements":[],"pad":"' + '0'.repeat(20_000_000) + '"}');
    expect(bomb.length).toBeLessThan(MAX_LINK_CHARS); // tiny link, huge payload
    await expect(decodeScene(bomb)).rejects.toThrow(/too much data/);
  });

  it('rejects payloads that are not a scene, or have too many elements', async () => {
    await expect(decodeScene(await deflate('{"nope":1}'))).rejects.toThrow(/Invalid/);
    await expect(decodeScene(await deflate('null'))).rejects.toThrow(/Invalid/);
    await expect(decodeScene(await deflate(JSON.stringify({ elements: Array.from({ length: 20_001 }, () => 0) })))).rejects.toThrow(/Invalid/);
  });
});
