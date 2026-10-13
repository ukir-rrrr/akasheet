import { createHash, webcrypto } from 'node:crypto';

import type { MediaBackend } from '../media/store';
import { mediaPaths } from '../media/types';
import { encryptBytes, importAesKey, isPlainJpeg } from './aead';
import { createReadOnlyMediaBackend, READ_ONLY_MEDIA_PLACEHOLDER_URI } from './readOnlyMediaBackend';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
});

const platformOs = { OS: 'web' as 'web' | 'ios' };
jest.mock('react-native', () => ({ Platform: platformOs }));

function memoryBackend() {
  const store = new Map<string, string>();
  const backend: MediaBackend = {
    async encodeJpeg(uri, maxSide) {
      return { uri, width: maxSide, height: maxSide };
    },
    async readBytes(uri) {
      const hit = store.get(uri);
      if (!hit) throw new Error('missing');
      if (hit.startsWith('aksh:')) {
        return new Uint8Array(Buffer.from(hit.slice(5), 'base64'));
      }
      return new Uint8Array(Buffer.from(hit, 'base64'));
    },
    async sha256(bytes) {
      return createHash('sha256').update(bytes).digest('hex');
    },
    async putIfAbsent(key, srcUri) {
      if (store.has(key)) return false;
      store.set(key, srcUri);
      return true;
    },
    async remove(key) {
      store.delete(key);
    },
    async keys() {
      return [...store.keys()];
    },
    async uriFor(key) {
      return store.get(key) ?? null;
    },
  };
  return { backend, store };
}

describe('createReadOnlyMediaBackend', () => {
  it('returns a JPEG placeholder for web-wrapped ciphertext', async () => {
    const key = await importAesKey(createHash('sha256').update('r').digest());
    const packed = await encryptBytes(key, new Uint8Array([0xff, 0xd8, 0xff, 0x01]));
    const { path } = mediaPaths('c'.repeat(64));
    const { backend, store } = memoryBackend();
    store.set(path, 'aksh:' + Buffer.from(packed).toString('base64'));
    const ro = createReadOnlyMediaBackend(backend);
    expect(await ro.uriFor(path)).toBe(READ_ONLY_MEDIA_PLACEHOLDER_URI);
    const bytes = await ro.readBytes(store.get(path)!);
    expect(isPlainJpeg(bytes)).toBe(true);
  });

  it('passes through plaintext JPEG URIs', async () => {
    const { path } = mediaPaths('d'.repeat(64));
    const { backend, store } = memoryBackend();
    const plainUri = Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64');
    store.set(path, plainUri);
    const ro = createReadOnlyMediaBackend(backend);
    expect(await ro.uriFor(path)).toBe(plainUri);
  });

  it('returns a JPEG placeholder for native AKSH1 files', async () => {
    platformOs.OS = 'ios';
    const key = await importAesKey(createHash('sha256').update('native').digest());
    const packed = await encryptBytes(key, new Uint8Array([0xff, 0xd8, 0xff, 0x02]));
    const { path } = mediaPaths('e'.repeat(64));
    const fileUri = 'file://doc/' + path;
    const inner: MediaBackend = {
      async encodeJpeg(uri, maxSide) {
        return { uri, width: maxSide, height: maxSide };
      },
      async readBytes(uri) {
        if (uri === fileUri) return packed;
        throw new Error('missing');
      },
      async sha256(bytes) {
        return createHash('sha256').update(bytes).digest('hex');
      },
      async putIfAbsent() {
        return false;
      },
      async remove() {
        return undefined;
      },
      async keys() {
        return [path];
      },
      async uriFor() {
        return fileUri;
      },
    };
    const ro = createReadOnlyMediaBackend(inner);
    expect(await ro.uriFor(path)).toBe(READ_ONLY_MEDIA_PLACEHOLDER_URI);
    expect(isPlainJpeg(await ro.readBytes(fileUri))).toBe(true);
    await expect(ro.putIfAbsent(path, fileUri)).rejects.toThrow('read-only');
    platformOs.OS = 'web';
  });

  it('delegates non-uri operations and returns null for missing keys', async () => {
    const { backend, store } = memoryBackend();
    const ro = createReadOnlyMediaBackend(backend);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    const encoded = await ro.encodeJpeg('pick://x', 100, 0.8);
    expect(encoded.width).toBe(100);
    expect(await ro.sha256(jpeg)).toHaveLength(64);
    expect(await ro.keys()).toEqual([]);
    const { path } = mediaPaths('g'.repeat(64));
    store.set(path, 'aksh:AAAA');
    expect(await ro.keys()).toEqual([path]);
    await ro.remove(path);
    expect(store.has(path)).toBe(false);
    expect(await ro.uriFor('media/ab/missing.jpg')).toBeNull();
  });
});
