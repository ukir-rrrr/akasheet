import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { MissingAssetError, StorageError } from '@/shared/errors';

import {
  fitLongSide,
  JPEG_QUALITY,
  MAX_LONG_SIDE,
  mediaPaths,
  THUMB_LONG_SIDE,
  THUMB_QUALITY,
  toHex,
  type ImportedMedia,
  type PreparedImage,
} from './types';

async function render(uri: string, maxSide: number, quality: number) {
  let ref = await ImageManipulator.manipulate(uri).renderAsync();
  const resize = fitLongSide(ref.width, ref.height, maxSide);
  // A fresh context per pass: re-rendering a context fails on web.
  if (resize) ref = await ImageManipulator.manipulate(uri).resize(resize).renderAsync();
  return ref.saveAsync({ format: SaveFormat.JPEG, compress: quality });
}

/**
 * Bakes EXIF orientation (the manipulator renders an upright bitmap), caps the long side at 2048px and
 * re-encodes JPEG 0.85 into the cache directory. Only the output dimensions are used from here on.
 */
export async function prepareImage(sourceUri: string): Promise<PreparedImage> {
  const out = await render(sourceUri, MAX_LONG_SIDE, JPEG_QUALITY);
  return { uri: out.uri, width: out.width, height: out.height };
}

async function place(srcUri: string, rel: string): Promise<boolean> {
  const dest = new File(Paths.document, rel);
  if (dest.exists) return false;
  const dir = dest.parentDirectory;
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  await new File(srcUri).copy(dest);
  return true;
}

/** Writes the prepared image and a 512px thumbnail content-addressed under documentDirectory. */
export async function persistImage(img: PreparedImage): Promise<ImportedMedia> {
  const bytes = await new File(img.uri).bytes();
  if (Paths.availableDiskSpace < bytes.byteLength * 3) {
    throw new StorageError(
      '端末の空き容量が足りません。不要なファイルを削除してからもう一度お試しください。',
    );
  }
  const sha256 = toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
  const { path, thumbPath } = mediaPaths(sha256);
  const thumb = await render(img.uri, THUMB_LONG_SIDE, THUMB_QUALITY);
  const freshMain = await place(img.uri, path);
  const freshThumb = await place(thumb.uri, thumbPath);
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
}

export async function discardPersisted(m: ImportedMedia): Promise<void> {
  if (!m.fresh) return;
  for (const rel of [m.path, m.thumbPath]) {
    const f = new File(Paths.document, rel);
    if (f.exists) f.delete();
  }
}

export async function resolveMediaUri(rel: string): Promise<string> {
  const f = new File(Paths.document, rel);
  if (!f.exists) throw new MissingAssetError(`画像が見つかりません: ${rel}`);
  return f.uri;
}

function listFiles(dir: Directory, prefix: string, out: string[]) {
  if (!dir.exists) return;
  for (const entry of dir.list()) {
    const rel = `${prefix}/${entry.name}`;
    if (entry instanceof Directory) listFiles(entry, rel, out);
    else out.push(rel);
  }
}

/** Deletes media files not referenced by any live media row. Run once at startup before user actions. */
export async function collectGarbage(livePaths: ReadonlySet<string>): Promise<number> {
  const files: string[] = [];
  for (const root of ['media', 'thumbs']) listFiles(new Directory(Paths.document, root), root, files);
  let removed = 0;
  for (const rel of files) {
    if (livePaths.has(rel)) continue;
    new File(Paths.document, rel).delete();
    removed++;
  }
  return removed;
}
