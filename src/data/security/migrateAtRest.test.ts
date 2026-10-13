import { createHash, webcrypto } from 'node:crypto';

import { migrate } from '../db/migrate';
import { createBetterSqliteDriver } from '../db/testing/betterSqliteDriver';
import type { MediaBackend } from '../media/store';
import { mediaPaths } from '../media/types';
import { createMetaRepo } from '../repos/metaRepo';
import { importAesKey, isEncryptedBlob, isSealedField } from './aead';
import { createFieldProtector } from './fieldProtector';
import { encryptMediaFileInPlace } from './mediaAtRest';
import { DATA_PROTECTION_META, DATA_PROTECTION_VERSION, migrateAtRest } from './migrateAtRest';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
});

function memoryBackend() {
  const store = new Map<string, string>();
  const backend: MediaBackend = {
    async encodeJpeg(uri, maxSide) {
      return { uri, width: maxSide, height: maxSide };
    },
    async readBytes(uri) {
      const hit = store.get(uri);
      if (!hit) throw new Error('missing');
      if (hit.startsWith('aksh:')) return new Uint8Array(Buffer.from(hit.slice(5), 'base64'));
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

describe('migrateAtRest', () => {
  it('encrypts legacy media and seals folder names once', async () => {
    const key = await importAesKey(createHash('sha256').update('dek').digest());
    const fields = createFieldProtector(key);
    const db = createBetterSqliteDriver();
    await migrate(db);
    const meta = createMetaRepo(db);
    await db.run(
      'INSERT INTO folders (id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, 1, 1, 1)',
      ['f1', '歴史', 'ai'],
    );

    const { backend, store } = memoryBackend();
    const { path } = mediaPaths('b'.repeat(64));
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64');
    store.set('src', jpeg);
    await backend.putIfAbsent(path, 'src');

    const res = await migrateAtRest({ db, meta, mediaBackend: backend, dek: key, fields, platformOs: 'web' });
    expect(res.mediaEncrypted).toBe(1);
    expect(res.fieldsEncrypted).toBe(true);
    expect((await meta.get(DATA_PROTECTION_META)) === DATA_PROTECTION_VERSION).toBe(true);

    const stored = store.get(path)!;
    expect(stored.startsWith('aksh:')).toBe(true);
    expect(isEncryptedBlob(Buffer.from(stored.slice(5), 'base64'))).toBe(true);

    const row = await db.get<{ name: string }>('SELECT name FROM folders WHERE id = ?', ['f1']);
    expect(isSealedField(row!.name)).toBe(true);
    expect(await fields.open(row!.name)).toBe('歴史');

    expect(
      await migrateAtRest({ db, meta, mediaBackend: backend, dek: key, fields, platformOs: 'web' }),
    ).toEqual({
      mediaEncrypted: 0,
      fieldsEncrypted: false,
    });
  });

  it('encryptMediaFileInPlace is idempotent on web', async () => {
    const key = await importAesKey(createHash('sha256').update('x').digest());
    const store = new Map<string, string>();
    const backend: MediaBackend = {
      async encodeJpeg(uri, maxSide) {
        return { uri, width: maxSide, height: maxSide };
      },
      async readBytes(uri) {
        const hit = store.get(uri);
        if (!hit) throw new Error('missing');
        if (hit.startsWith('aksh:')) return new Uint8Array(Buffer.from(hit.slice(5), 'base64'));
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
    const { path } = mediaPaths('c'.repeat(64));
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xab]).toString('base64');
    store.set('src', jpeg);
    await backend.putIfAbsent(path, 'src');
    expect(await encryptMediaFileInPlace(backend, key, path, 'web')).toBe(true);
    expect(await encryptMediaFileInPlace(backend, key, path, 'web')).toBe(false);
    expect(store.get(path)?.startsWith('aksh:')).toBe(true);
  });
});
