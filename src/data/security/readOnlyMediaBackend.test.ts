import { createHash, webcrypto } from 'node:crypto';

import type { MediaBackend } from '../media/store';
import { mediaPaths } from '../media/types';
import { encryptBytes, importAesKey, isPlainJpeg } from './aead';
import {
  createReadOnlyMediaBackend,
  READ_ONLY_MEDIA_PLACEHOLDER_JPEG,
  READ_ONLY_MEDIA_PLACEHOLDER_URI,
} from './readOnlyMediaBackend';

function isJpegSofMarker(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function isAllowedJpegMarker(marker: number): boolean {
  if (marker === 0x01) return true;
  if (marker >= 0xd0 && marker <= 0xd9) return true;
  if (isJpegSofMarker(marker)) return true;
  if (marker === 0xc4 || marker === 0xc8 || marker === 0xcc) return true;
  if (marker === 0xda || marker === 0xdb || marker === 0xdc || marker === 0xdd) return true;
  if (marker >= 0xe0 && marker <= 0xef) return true;
  if (marker === 0xfe) return true;
  return false;
}

/** Walks markers/segment lengths and confirms a baseline 1×1 decodable JPEG. */
function expectValidPlaceholderJpeg(bytes: Uint8Array): void {
  expect(bytes.length).toBeGreaterThan(10);
  expect(bytes[0]).toBe(0xff);
  expect(bytes[1]).toBe(0xd8);

  let pos = 2;
  let sawDqt = false;
  let sawSof = false;
  let sawDht = false;
  let sawSos = false;
  let width = 0;
  let height = 0;

  while (pos < bytes.length) {
    if (bytes[pos] !== 0xff) throw new Error(`expected marker at ${pos}`);
    pos += 1;
    while (pos < bytes.length && bytes[pos] === 0xff) pos += 1;
    if (pos >= bytes.length) throw new Error('truncated marker');
    const marker = bytes[pos];
    pos += 1;

    if (marker === 0xd9) {
      expect(pos).toBe(bytes.length);
      expect(sawDqt && sawSof && sawDht && sawSos).toBe(true);
      expect(width).toBe(1);
      expect(height).toBe(1);
      return;
    }

    if (marker === 0xd8) throw new Error('unexpected SOI');
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (marker === 0x01) continue;

    expect(isAllowedJpegMarker(marker)).toBe(true);

    expect(pos + 2).toBeLessThanOrEqual(bytes.length);
    const segLen = (bytes[pos] << 8) | bytes[pos + 1];
    expect(segLen).toBeGreaterThanOrEqual(2);
    const segEnd = pos + segLen;
    expect(segEnd).toBeLessThanOrEqual(bytes.length);

    if (marker === 0xdb) sawDqt = true;
    if (isJpegSofMarker(marker)) {
      sawSof = true;
      expect(segLen).toBeGreaterThanOrEqual(7);
      height = (bytes[pos + 3] << 8) | bytes[pos + 4];
      width = (bytes[pos + 5] << 8) | bytes[pos + 6];
    }
    if (marker === 0xc4) sawDht = true;

    if (marker === 0xda) {
      sawSos = true;
      pos = segEnd;
      let foundEoi = false;
      while (pos < bytes.length) {
        if (bytes[pos] !== 0xff) {
          pos += 1;
          continue;
        }
        let scan = pos + 1;
        while (scan < bytes.length && bytes[scan] === 0xff) scan += 1;
        if (scan >= bytes.length) break;
        const ent = bytes[scan];
        if (ent === 0x00) {
          pos = scan + 1;
          continue;
        }
        if (ent >= 0xd0 && ent <= 0xd7) {
          pos = scan + 1;
          continue;
        }
        if (ent === 0xd9) {
          pos = scan + 1;
          foundEoi = true;
          break;
        }
        throw new Error(`unexpected marker 0xff${ent.toString(16)} in scan`);
      }
      expect(foundEoi).toBe(true);
      expect(pos).toBe(bytes.length);
      expect(sawDqt && sawSof && sawDht).toBe(true);
      expect(width).toBe(1);
      expect(height).toBe(1);
      return;
    }

    pos = segEnd;
  }
  throw new Error('missing EOI');
}

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
});

const platformOs = { OS: 'web' as 'web' | 'ios' };
jest.mock('react-native', () => ({ Platform: platformOs }));

function memoryBackend() {
  const store = new Map<string, string>();
  const backend: MediaBackend = {
    async stageImport(bytes) {
      const uri = `stg://${store.size}`;
      store.set(uri, Buffer.from(bytes).toString('base64'));
      return uri;
    },
    async discardStage(uri) {
      store.delete(uri);
    },
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
  it('ships a structurally valid 1×1 gray JPEG placeholder', () => {
    expectValidPlaceholderJpeg(READ_ONLY_MEDIA_PLACEHOLDER_JPEG);
  });

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
    expectValidPlaceholderJpeg(bytes);
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
      async stageImport(bytes) {
        return `stg://${bytes.length}`;
      },
      async discardStage() {
        return undefined;
      },
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
    const placeholder = await ro.readBytes(fileUri);
    expect(isPlainJpeg(placeholder)).toBe(true);
    expectValidPlaceholderJpeg(placeholder);
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
