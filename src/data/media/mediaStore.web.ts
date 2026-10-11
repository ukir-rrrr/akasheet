import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Storage } from 'expo-sqlite/kv-store';

import { MissingAssetError } from '@/shared/errors';

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

/*
 * Web has no expo-file-system, so images are kept as data URIs in the expo-sqlite key-value store under the
 * same relative keys the native build uses as file paths. The DB schema is identical on both platforms.
 */

const KEY_PREFIX = 'media:';

async function render(uri: string, maxSide: number, quality: number) {
  let ref = await ImageManipulator.manipulate(uri).renderAsync();
  const resize = fitLongSide(ref.width, ref.height, maxSide);
  // A fresh context per pass: re-rendering a context fails on web.
  if (resize) ref = await ImageManipulator.manipulate(uri).resize(resize).renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
  return { uri: `data:image/jpeg;base64,${saved.base64 ?? ''}`, width: saved.width, height: saved.height };
}

function dataUriBytes(uri: string): Uint8Array<ArrayBuffer> {
  const bin = atob(uri.slice(uri.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function put(rel: string, dataUri: string): Promise<boolean> {
  const key = KEY_PREFIX + rel;
  if ((await Storage.getItem(key)) !== null) return false;
  await Storage.setItem(key, dataUri);
  return true;
}

export async function prepareImage(sourceUri: string): Promise<PreparedImage> {
  return render(sourceUri, MAX_LONG_SIDE, JPEG_QUALITY);
}

export async function persistImage(img: PreparedImage): Promise<ImportedMedia> {
  const bytes = dataUriBytes(img.uri);
  const sha256 = toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
  const { path, thumbPath } = mediaPaths(sha256);
  const thumb = await render(img.uri, THUMB_LONG_SIDE, THUMB_QUALITY);
  const freshMain = await put(path, img.uri);
  const freshThumb = await put(thumbPath, thumb.uri);
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
  await Storage.removeItem(KEY_PREFIX + m.path);
  await Storage.removeItem(KEY_PREFIX + m.thumbPath);
}

export async function resolveMediaUri(rel: string): Promise<string> {
  const v = await Storage.getItem(KEY_PREFIX + rel);
  if (v === null) throw new MissingAssetError(`画像が見つかりません: ${rel}`);
  return v;
}

export async function collectGarbage(livePaths: ReadonlySet<string>): Promise<number> {
  const keys = await Storage.getAllKeys();
  let removed = 0;
  for (const key of keys) {
    if (!key.startsWith(KEY_PREFIX) || livePaths.has(key.slice(KEY_PREFIX.length))) continue;
    await Storage.removeItem(key);
    removed++;
  }
  return removed;
}
