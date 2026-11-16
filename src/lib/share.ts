const b64 = (u: Uint8Array) => btoa(Array.from(u, (c) => String.fromCharCode(c)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function encodeScene(data: unknown): Promise<string> {
  const stream = new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return b64(new Uint8Array(await new Response(stream).arrayBuffer()));
}
const MAX_ENCODED = 4_000_000; // characters in the URL fragment
const MAX_DECODED = 40_000_000; // bytes after decompression (guards against zip bombs)
const MAX_ELEMENTS = 20_000;

export async function decodeScene(s: string): Promise<any> {
  if (s.length > MAX_ENCODED) throw new Error('Share link is too large');
  const stream = new Blob([unb64(s) as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_DECODED) { await reader.cancel(); throw new Error('Share link expands to too much data'); }
    chunks.push(value);
  }
  const data = JSON.parse(await new Blob(chunks as BlobPart[]).text());
  if (!data || !Array.isArray(data.elements) || data.elements.length > MAX_ELEMENTS) throw new Error('Invalid share link');
  return data;
}
