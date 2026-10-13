import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { Storage } from 'expo-sqlite/kv-store';

import type { MediaBackend } from '../media/store';
import { assertSafeMediaKey } from '../media/types';
import { decryptBytes, encryptBytes, isEncryptedBlob, isPlainJpeg } from './aead';
import { b64, fromB64, WEB_WRAP_PREFIX } from './mediaAtRest';

const CACHE_URI_PREFIX = 'akasheet-decrypt:';

/** Wraps a platform backend so blobs on disk / in KV are AES-GCM encrypted. */
export function createEncryptedMediaBackend(inner: MediaBackend, key: CryptoKey): MediaBackend {
  return {
    encodeJpeg: (...args) => inner.encodeJpeg(...args),
    sha256: (...args) => inner.sha256(...args),
    assertCapacity: inner.assertCapacity?.bind(inner),

    async readBytes(uri) {
      if (Platform.OS === 'web' && uri.startsWith(WEB_WRAP_PREFIX)) {
        return decryptBytes(key, fromB64(uri.slice(WEB_WRAP_PREFIX.length)));
      }
      const raw = await inner.readBytes(uri);
      if (isPlainJpeg(raw) || !isEncryptedBlob(raw)) return raw;
      return decryptBytes(key, raw);
    },

    async putIfAbsent(mediaKey, srcUri) {
      assertSafeMediaKey(mediaKey);
      if ((await inner.uriFor(mediaKey)) !== null) return false;

      const plain = await inner.readBytes(srcUri);
      const enc = await encryptBytes(key, plain);

      if (Platform.OS === 'web') {
        return inner.putIfAbsent(mediaKey, WEB_WRAP_PREFIX + b64(enc));
      }

      const dest = new File(Paths.document, mediaKey);
      const dir = dest.parentDirectory;
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      dest.write(enc);
      return true;
    },

    remove: (mediaKey) => inner.remove(mediaKey),
    keys: () => inner.keys(),

    async uriFor(mediaKey) {
      assertSafeMediaKey(mediaKey);
      const stored = await inner.uriFor(mediaKey);
      if (stored === null) return null;

      if (Platform.OS === 'web') {
        if (!stored.startsWith(WEB_WRAP_PREFIX)) return stored;
        const plain = await decryptBytes(key, fromB64(stored.slice(WEB_WRAP_PREFIX.length)));
        return `data:image/jpeg;base64,${b64(plain)}`;
      }

      const raw = await inner.readBytes(stored);
      if (isPlainJpeg(raw)) return stored;
      if (!isEncryptedBlob(raw)) return stored;

      const cacheKey = CACHE_URI_PREFIX + mediaKey;
      const cached = await Storage.getItem(cacheKey);
      if (cached) return cached;

      const plain = await decryptBytes(key, raw);
      const cacheFile = new File(Paths.cache, `akasheet-media/${mediaKey.replace(/\//g, '_')}.jpg`);
      const cacheDir = cacheFile.parentDirectory;
      if (!cacheDir.exists) cacheDir.create({ intermediates: true, idempotent: true });
      cacheFile.write(plain);
      await Storage.setItem(cacheKey, cacheFile.uri);
      return cacheFile.uri;
    },
  };
}

export { encryptMediaFileInPlace } from './mediaAtRest';
