export const MAX_LONG_SIDE = 2048;
export const THUMB_LONG_SIDE = 512;
export const JPEG_QUALITY = 0.85;
export const THUMB_QUALITY = 0.7;

/** Content-addressed media metadata as stored in the `media` table. */
export type NewMedia = {
  sha256: string;
  path: string;
  thumbPath: string;
  mime: string;
  width: number;
  height: number;
  byteSize: number;
};

/** EXIF-baked, resized image waiting in temporary storage; its size is the mask coordinate space. */
export type PreparedImage = { uri: string; width: number; height: number };

export type ImportedMedia = NewMedia & {
  /** True when persisting wrote new files (so they must be deleted if the DB save fails). */
  fresh: boolean;
};

export const MEDIA_ROOTS = ['media', 'thumbs'] as const;

const MEDIA_KEY_RE = /^(media|thumbs)\/[0-9a-f]{2}\/[0-9a-f]{64}\.jpg$/;

/** Reject path traversal or unexpected keys before touching the filesystem / KV store. */
export function assertSafeMediaKey(key: string): void {
  if (!MEDIA_KEY_RE.test(key)) throw new Error(`unsafe media key: ${key}`);
}

export function mediaPaths(sha256: string) {
  const prefix = sha256.slice(0, 2);
  return {
    path: `${MEDIA_ROOTS[0]}/${prefix}/${sha256}.jpg`,
    thumbPath: `${MEDIA_ROOTS[1]}/${prefix}/${sha256}.jpg`,
  };
}

export function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Resize target keeping aspect ratio; never upscales. */
export function fitLongSide(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } | null {
  const long = Math.max(width, height);
  if (long <= max) return null;
  const k = max / long;
  // Both sides explicit: the web manipulator cannot infer a null side.
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}
