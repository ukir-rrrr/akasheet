import * as Crypto from 'expo-crypto';
import { Storage } from 'expo-sqlite/kv-store';

import { encodeJpeg } from './encodeJpeg';
import type { MediaBackend } from './store';
import { toHex } from './types';

/*
 * Web has no expo-file-system, so images are data URIs in the expo-sqlite key-value store under the same
 * relative keys the native build uses as file paths. The DB schema is identical on both platforms.
 */
const PREFIX = 'media:';

function dataUriBytes(uri: string): Uint8Array<ArrayBuffer> {
  const bin = atob(uri.slice(uri.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const platformBackend: MediaBackend = {
  encodeJpeg: (uri, maxSide, quality) => encodeJpeg(uri, maxSide, quality, true),
  readBytes: async (uri) => dataUriBytes(uri),
  sha256: async (bytes) => toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes)),
  async putIfAbsent(key, srcUri) {
    if ((await Storage.getItem(PREFIX + key)) !== null) return false;
    await Storage.setItem(PREFIX + key, srcUri);
    return true;
  },
  async remove(key) {
    await Storage.removeItem(PREFIX + key);
  },
  async keys() {
    return (await Storage.getAllKeys())
      .filter((k) => k.startsWith(PREFIX))
      .map((k) => k.slice(PREFIX.length));
  },
  uriFor: (key) => Storage.getItem(PREFIX + key),
};
