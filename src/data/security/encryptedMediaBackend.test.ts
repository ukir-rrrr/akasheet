import { createHash, webcrypto } from 'node:crypto';

import type { MediaBackend } from '../media/store';
import { mediaPaths } from '../media/types';
import { importAesKey, isEncryptedBlob } from './aead';
import { createEncryptedMediaBackend, purgeNativeDecryptCache } from './encryptedMediaBackend';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
});

const mockCacheFiles = new Map<string, Uint8Array>();
jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    exists = false;
    constructor(rootOrUri: unknown, rel?: string) {
      if (typeof rootOrUri === 'string' && rel === undefined) {
        this.uri = rootOrUri;
      } else {
        this.uri = `file://mock/${rel as string}`;
      }
      this.exists = mockCacheFiles.has(this.uri);
    }
    get parentDirectory() {
      return { exists: true, create: () => undefined };
    }
    write(bytes: Uint8Array) {
      mockCacheFiles.set(this.uri, bytes);
      this.exists = true;
    }
    delete() {
      mockCacheFiles.delete(this.uri);
      this.exists = false;
    }
  }
  return { File: MockFile, Paths: { cache: 'cache', document: 'doc' } };
});
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
const mockKv = new Map<string, string>();
jest.mock('expo-sqlite/kv-store', () => ({
  Storage: {
    getItem: async (k: string) => mockKv.get(k) ?? null,
    setItem: async (k: string, v: string) => void mockKv.set(k, v),
    removeItem: async (k: string) => void mockKv.delete(k),
  },
}));

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

describe('createEncryptedMediaBackend (web)', () => {
  it('stores ciphertext and returns a JPEG data URI', async () => {
    const key = await importAesKey(createHash('sha256').update('k').digest());
    const { backend, store } = memoryBackend();
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64');
    const src = 'pick://img';
    store.set(src, jpeg);
    const enc = createEncryptedMediaBackend(backend, key);
    const { path } = mediaPaths('d'.repeat(64));
    expect(await enc.putIfAbsent(path, src)).toBe(true);
    const stored = store.get(path)!;
    expect(stored.startsWith('aksh:')).toBe(true);
    expect(isEncryptedBlob(Buffer.from(stored.slice(5), 'base64'))).toBe(true);
    const uri = await enc.uriFor(path);
    expect(uri?.startsWith('data:image/jpeg;base64,')).toBe(true);
  });
});

describe('purgeNativeDecryptCache', () => {
  it('removes KV entry and cached JPEG files', async () => {
    const { path } = mediaPaths('f'.repeat(64));
    const cacheUri = `file://mock/cache/akasheet-media/${path.replace(/\//g, '_')}.jpg`;
    mockKv.set('akasheet-decrypt:' + path, cacheUri);
    mockCacheFiles.set(cacheUri, new Uint8Array([1]));
    await purgeNativeDecryptCache(path);
    expect(mockKv.has('akasheet-decrypt:' + path)).toBe(false);
    expect(mockCacheFiles.has(cacheUri)).toBe(false);
  });
});
