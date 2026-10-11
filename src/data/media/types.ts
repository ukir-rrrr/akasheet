import type { NewMedia } from '../repos/cardRepo';

export const MAX_LONG_SIDE = 2048;
export const THUMB_LONG_SIDE = 512;
export const JPEG_QUALITY = 0.85;
export const THUMB_QUALITY = 0.7;

export type ImportedMedia = NewMedia & {
  /** True when this import wrote new files (so they must be deleted if the DB save fails). */
  fresh: boolean;
};

export function mediaPaths(sha256: string) {
  const prefix = sha256.slice(0, 2);
  return { path: `media/${prefix}/${sha256}.jpg`, thumbPath: `thumbs/${prefix}/${sha256}.jpg` };
}

export function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Resize target keeping aspect ratio; never upscales. */
export function fitLongSide(width: number, height: number, max: number): { width: number | null; height: number | null } | null {
  if (Math.max(width, height) <= max) return null;
  return width >= height ? { width: max, height: null } : { width: null, height: max };
}
