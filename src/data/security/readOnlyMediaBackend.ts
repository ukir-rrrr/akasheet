import { Platform } from 'react-native';

import type { MediaBackend } from '../media/store';
import { isEncryptedBlob, isPlainJpeg } from './aead';
import { WEB_WRAP_PREFIX } from './mediaAtRest';

/** Gray 1×1 JPEG bytes shown when encrypted media cannot be decoded (read-only mode). */
export const READ_ONLY_MEDIA_PLACEHOLDER_JPEG = new Uint8Array([
  255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 255, 219, 0, 67, 0, 10, 7, 7, 8, 7,
  6, 10, 8, 8, 8, 11, 10, 10, 11, 14, 24, 16, 14, 13, 13, 14, 29, 21, 22, 17, 24, 35, 31, 37, 36, 34, 31, 34,
  33, 38, 43, 51, 47, 38, 41, 52, 66, 56, 56, 66, 50, 53, 48, 38, 55, 56, 54, 51, 54, 56, 57, 62, 55, 255,
  219, 0, 67, 1, 10, 11, 11, 14, 13, 15, 16, 16, 16, 16, 15, 13, 14, 14, 13, 14, 15, 13, 14, 14, 13, 14, 15,
  13, 14, 14, 13, 14, 14, 13, 14, 14, 13, 14, 14, 13, 14, 14, 13, 14, 14, 13, 14, 14, 13, 14, 14, 13, 14, 14,
  13, 14, 14, 13, 14, 14, 13, 14, 14, 13, 14, 14, 13, 14, 14, 12, 191, 240, 0, 4, 66, 0, 0, 64, 0, 64, 192,
  72, 128, 0, 132, 64, 64, 196, 64, 127, 241, 0, 5, 64, 0, 64, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  2, 255, 241, 0, 5, 4, 0, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 63, 241, 0, 5, 64, 64, 64, 64, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 127, 241, 0, 5, 4, 64, 64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 63, 246, 128, 3, 0, 192, 64, 0, 132, 64, 196, 64, 15, 192, 44, 0, 6, 99, 255, 246,
]);

/** Displayable URI for {@link READ_ONLY_MEDIA_PLACEHOLDER_JPEG}. */
export const READ_ONLY_MEDIA_PLACEHOLDER_URI = `data:image/jpeg;base64,${b64(
  READ_ONLY_MEDIA_PLACEHOLDER_JPEG,
)}`;

function b64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function storedIsEncrypted(inner: MediaBackend, storedUri: string): Promise<boolean> {
  if (Platform.OS === 'web' && storedUri.startsWith(WEB_WRAP_PREFIX)) return true;
  try {
    const raw = await inner.readBytes(storedUri);
    return isEncryptedBlob(raw);
  } catch {
    return false;
  }
}

/** Masks encrypted blobs when the DEK cannot be loaded (read-only mode). */
export function createReadOnlyMediaBackend(inner: MediaBackend): MediaBackend {
  return {
    encodeJpeg: (...args) => inner.encodeJpeg(...args),
    sha256: (...args) => inner.sha256(...args),
    assertCapacity: inner.assertCapacity?.bind(inner),
    keys: () => inner.keys(),
    remove: (...args) => inner.remove(...args),

    async putIfAbsent() {
      throw new Error('read-only: cannot store media without a data key');
    },

    async readBytes(uri) {
      if (Platform.OS === 'web' && uri.startsWith(WEB_WRAP_PREFIX)) {
        return READ_ONLY_MEDIA_PLACEHOLDER_JPEG;
      }
      const raw = await inner.readBytes(uri);
      if (isPlainJpeg(raw) || !isEncryptedBlob(raw)) return raw;
      return READ_ONLY_MEDIA_PLACEHOLDER_JPEG;
    },

    async uriFor(mediaKey) {
      const stored = await inner.uriFor(mediaKey);
      if (stored === null) return null;
      if (await storedIsEncrypted(inner, stored)) return READ_ONLY_MEDIA_PLACEHOLDER_URI;
      return stored;
    },
  };
}
