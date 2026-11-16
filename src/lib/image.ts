import { readFileAsDataURL } from './utils';

export type ImageMode = 'original' | 'high' | 'compressed';

/** Downscale / recompress an image before it is stored in the scene. */
export async function processImage(file: Blob, mode: ImageMode): Promise<string> {
  const orig = await readFileAsDataURL(file);
  if (mode === 'original' || file.type === 'image/svg+xml' || file.type === 'image/gif') return orig;
  const img = new Image();
  img.src = orig;
  await new Promise((r) => { img.onload = r; img.onerror = r; });
  if (!img.naturalWidth) return orig;
  const max = mode === 'high' ? 4096 : 1600;
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  if (k === 1 && mode === 'high') return orig;
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const out = c.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp', mode === 'high' ? 0.92 : 0.8);
  return out.length < orig.length ? out : orig;
}
