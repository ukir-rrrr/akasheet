import { MissingAssetError } from '@/shared/errors';

import {
  JPEG_QUALITY,
  MAX_LONG_SIDE,
  mediaPaths,
  THUMB_LONG_SIDE,
  THUMB_QUALITY,
  type ImportedMedia,
  type PreparedImage,
} from './types';

/** The platform-specific half of media storage. Keys are document-relative paths (`media/ab/<sha>.jpg`). */
export type MediaBackend = {
  /** Upright (EXIF-baked) JPEG capped at `maxSide`, as a URI the backend can read back. */
  encodeJpeg(uri: string, maxSide: number, quality: number): Promise<PreparedImage>;
  readBytes(uri: string): Promise<Uint8Array<ArrayBuffer>>;
  sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string>;
  /** Stores `srcUri` under `key` unless it already exists; true when something was written. */
  putIfAbsent(key: string, srcUri: string): Promise<boolean>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
  /** Displayable URI for a key, or null when missing. */
  uriFor(key: string): Promise<string | null>;
  /** Throws a user-facing StorageError when `bytes` more cannot be written. */
  assertCapacity?(bytes: number): void;
};

export type MediaStore = ReturnType<typeof createMediaStore>;

export function createMediaStore(backend: MediaBackend) {
  return {
    /** Normalizes a picked photo (orientation, ≤2048px, JPEG 0.85) into temporary storage. */
    prepareImage(sourceUri: string): Promise<PreparedImage> {
      return backend.encodeJpeg(sourceUri, MAX_LONG_SIDE, JPEG_QUALITY);
    },

    /** Writes the image and a 512px thumbnail content-addressed by SHA-256. */
    async persistImage(img: PreparedImage): Promise<ImportedMedia> {
      const bytes = await backend.readBytes(img.uri);
      backend.assertCapacity?.(bytes.byteLength * 3);
      const sha256 = await backend.sha256(bytes);
      const { path, thumbPath } = mediaPaths(sha256);
      const thumb = await backend.encodeJpeg(img.uri, THUMB_LONG_SIDE, THUMB_QUALITY);
      const freshMain = await backend.putIfAbsent(path, img.uri);
      const freshThumb = await backend.putIfAbsent(thumbPath, thumb.uri);
      return {
        sha256,
        path,
        thumbPath,
        mime: 'image/jpeg',
        width: img.width,
        height: img.height,
        byteSize: bytes.byteLength,
        fresh: freshMain || freshThumb,
      };
    },

    /** Compensation for a failed DB save: removes files only if this save created them. */
    async discardPersisted(m: ImportedMedia): Promise<void> {
      if (!m.fresh) return;
      await backend.remove(m.path);
      await backend.remove(m.thumbPath);
    },

    async resolveMediaUri(key: string): Promise<string> {
      const uri = await backend.uriFor(key);
      if (uri === null) throw new MissingAssetError(`画像が見つかりません: ${key}`);
      return uri;
    },

    /** Deletes stored files not referenced by any live media row. Run at startup before user actions. */
    async collectGarbage(livePaths: ReadonlySet<string>): Promise<number> {
      let removed = 0;
      for (const key of await backend.keys()) {
        if (livePaths.has(key)) continue;
        await backend.remove(key);
        removed++;
      }
      return removed;
    },
  };
}
