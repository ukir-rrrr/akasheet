import { Platform } from 'react-native';

import type { MediaBackend } from '../media/store';
import { isEncryptedBlob, isPlainJpeg } from './aead';
import { WEB_WRAP_PREFIX } from './mediaAtRest';

/** Gray 1×1 JPEG bytes shown when encrypted media cannot be decoded (read-only mode). */
export const READ_ONLY_MEDIA_PLACEHOLDER_JPEG = new Uint8Array([
  255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 255, 219, 0, 67, 0, 5, 3, 4, 4, 4,
  3, 5, 4, 4, 4, 5, 5, 5, 6, 7, 12, 8, 7, 7, 7, 7, 15, 11, 11, 9, 12, 17, 15, 18, 18, 17, 15, 17, 17, 19, 22,
  28, 23, 19, 20, 26, 21, 17, 17, 24, 33, 24, 26, 29, 29, 31, 31, 31, 19, 23, 34, 36, 34, 30, 36, 28, 30, 31,
  30, 255, 219, 0, 67, 1, 5, 5, 5, 7, 6, 7, 14, 8, 8, 14, 30, 20, 17, 20, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 255, 192, 0, 17, 8, 0, 1, 0, 1, 3, 1, 34, 0, 2, 17,
  1, 3, 17, 1, 255, 196, 0, 31, 0, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8,
  9, 10, 11, 255, 196, 0, 181, 16, 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125, 1, 2, 3, 0, 4, 17, 5, 18,
  33, 49, 65, 6, 19, 81, 97, 7, 34, 113, 20, 50, 129, 145, 161, 8, 35, 66, 177, 193, 21, 82, 209, 240, 36, 51,
  98, 114, 130, 9, 10, 22, 23, 24, 25, 26, 37, 38, 39, 40, 41, 42, 52, 53, 54, 55, 56, 57, 58, 67, 68, 69, 70,
  71, 72, 73, 74, 83, 84, 85, 86, 87, 88, 89, 90, 99, 100, 101, 102, 103, 104, 105, 106, 115, 116, 117, 118,
  119, 120, 121, 122, 131, 132, 133, 134, 135, 136, 137, 138, 146, 147, 148, 149, 150, 151, 152, 153, 154,
  162, 163, 164, 165, 166, 167, 168, 169, 170, 178, 179, 180, 181, 182, 183, 184, 185, 186, 194, 195, 196,
  197, 198, 199, 200, 201, 202, 210, 211, 212, 213, 214, 215, 216, 217, 218, 225, 226, 227, 228, 229, 230,
  231, 232, 233, 234, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 255, 196, 0, 31, 1, 0, 3, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 255, 196, 0, 181, 17, 0, 2, 1, 2, 4, 4,
  3, 4, 7, 5, 4, 4, 0, 1, 2, 119, 0, 1, 2, 3, 17, 4, 5, 33, 49, 6, 18, 65, 81, 7, 97, 113, 19, 34, 50, 129, 8,
  20, 66, 145, 161, 177, 193, 9, 35, 51, 82, 240, 21, 98, 114, 209, 10, 22, 36, 52, 225, 37, 241, 23, 24, 25,
  26, 38, 39, 40, 41, 42, 53, 54, 55, 56, 57, 58, 67, 68, 69, 70, 71, 72, 73, 74, 83, 84, 85, 86, 87, 88, 89,
  90, 99, 100, 101, 102, 103, 104, 105, 106, 115, 116, 117, 118, 119, 120, 121, 122, 130, 131, 132, 133, 134,
  135, 136, 137, 138, 146, 147, 148, 149, 150, 151, 152, 153, 154, 162, 163, 164, 165, 166, 167, 168, 169,
  170, 178, 179, 180, 181, 182, 183, 184, 185, 186, 194, 195, 196, 197, 198, 199, 200, 201, 202, 210, 211,
  212, 213, 214, 215, 216, 217, 218, 226, 227, 228, 229, 230, 231, 232, 233, 234, 242, 243, 244, 245, 246,
  247, 248, 249, 250, 255, 218, 0, 12, 3, 1, 0, 2, 17, 3, 17, 0, 63, 0, 40, 162, 138, 0, 255, 217,
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
