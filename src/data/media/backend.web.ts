import * as Crypto from 'expo-crypto';
import { Storage } from 'expo-sqlite/kv-store';

import { encodeJpeg } from './encodeJpeg';
import type { MediaBackend } from './store';
import { StorageError } from '@/shared/errors';

import { assertSafeMediaKey, toHex } from './types';

/*
 * Web has no expo-file-system, so images are data URIs in the expo-sqlite key-value store under the same
 * relative keys the native build uses as file paths. The DB schema is identical on both platforms.
 */
const PREFIX = 'media:';

function dataUriBytes(uri: string): Uint8Array<ArrayBuffer> {
  try {
    const bin = atob(uri.slice(uri.indexOf(',') + 1));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    throw new StorageError('保存された画像データが壊れています');
  }
}

export const platformBackend: MediaBackend = {
  encodeJpeg: (uri, maxSide, quality) => encodeJpeg(uri, maxSide, quality, true),
  readBytes: async (uri) => dataUriBytes(uri),
  sha256: async (bytes) => toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes)),
  assertCapacity(bytes) {
    if (bytes > 12 * 1024 * 1024) {
      throw new StorageError(
        'ブラウザの保存容量の上限に近づいています。カードを減らすか、別の端末でお試しください。',
      );
    }
  },
  async putIfAbsent(key, srcUri) {
    assertSafeMediaKey(key);
    if ((await Storage.getItem(PREFIX + key)) !== null) return false;
    await Storage.setItem(PREFIX + key, srcUri);
    return true;
  },
  async remove(key) {
    assertSafeMediaKey(key);
    await Storage.removeItem(PREFIX + key);
  },
  async keys() {
    return (await Storage.getAllKeys())
      .filter((k) => k.startsWith(PREFIX))
      .map((k) => k.slice(PREFIX.length));
  },
  uriFor(key) {
    assertSafeMediaKey(key);
    return Storage.getItem(PREFIX + key);
  },
};
