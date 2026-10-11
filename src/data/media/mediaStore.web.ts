import * as Crypto from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Storage } from 'expo-sqlite/kv-store';

import { MissingAssetError } from '@/shared/errors';

import { fitLongSide, JPEG_QUALITY, MAX_LONG_SIDE, mediaPaths, THUMB_LONG_SIDE, THUMB_QUALITY, toHex, type ImportedMedia } from './types';

/*
 * Web has no expo-file-system, so images are kept as data URIs in the expo-sqlite key-value store under the
 * same relative keys the native build uses as file paths. The DB schema is identical on both platforms.
 */

const KEY_PREFIX = 'media:';

async function render(uri: string, maxSide: number, quality: number) {
  const ctx = ImageManipulator.manipulate(uri);
  let ref = await ctx.renderAsync();
  const resize = fitLongSide(ref.width, ref.height, maxSide);
  if (resize) {
    ctx.resize(resize);
    ref = await ctx.renderAsync();
  }
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: quality, base64: true });
  return { width: saved.width, height: saved.height, base64: saved.base64 ?? '' };
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function put(rel: string, base64: string): Promise<boolean> {
  const key = KEY_PREFIX + rel;
  if ((await Storage.getItem(key)) !== null) return false;
  await Storage.setItem(key, `data:image/jpeg;base64,${base64}`);
  return true;
}

export async function importImage(uri: string): Promise<ImportedMedia> {
  const main = await render(uri, MAX_LONG_SIDE, JPEG_QUALITY);
  const bytes = base64ToBytes(main.base64);
  const sha256 = toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes as Uint8Array<ArrayBuffer>));
  const { path, thumbPath } = mediaPaths(sha256);
  const thumb = await render(`data:image/jpeg;base64,${main.base64}`, THUMB_LONG_SIDE, THUMB_QUALITY);
  const freshMain = await put(path, main.base64);
  const freshThumb = await put(thumbPath, thumb.base64);
  return {
    sha256,
    path,
    thumbPath,
    mime: 'image/jpeg',
    width: main.width,
    height: main.height,
    byteSize: bytes.byteLength,
    fresh: freshMain || freshThumb,
  };
}

export async function discardImport(m: ImportedMedia): Promise<void> {
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
