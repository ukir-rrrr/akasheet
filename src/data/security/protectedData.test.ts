import { createHash, webcrypto } from 'node:crypto';

import { migrate } from '../db/migrate';
import { createBetterSqliteDriver } from '../db/testing/betterSqliteDriver';
import { createMetaRepo } from '../repos/metaRepo';
import { mediaPaths } from '../media/types';
import { encryptBytes, importAesKey, sealString } from './aead';
import { DATA_PROTECTION_META, DATA_PROTECTION_VERSION } from './migrateAtRest';
import { detectProtectedData } from './protectedData';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
});

const emptyMedia = {
  async encodeJpeg(uri: string, maxSide: number) {
    return { uri, width: maxSide, height: maxSide };
  },
  async stageImport(bytes: Uint8Array) {
    return `stg://${bytes.length}`;
  },
  async discardStage() {
    return undefined;
  },
  readBytes: async () => new Uint8Array(),
  sha256: async () => '',
  putIfAbsent: async () => false,
  remove: async () => undefined,
  keys: async () => [] as string[],
  uriFor: async () => null,
};

describe('detectProtectedData', () => {
  it('detects sealed text beyond an arbitrary row sample', async () => {
    const key = await importAesKey(createHash('sha256').update('deep').digest());
    const db = createBetterSqliteDriver();
    await migrate(db);
    const meta = createMetaRepo(db);
    const sealed = await sealString(key, '奥の秘密');
    for (let i = 0; i < 60; i++) {
      await db.run(
        'INSERT INTO folders (id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, 1, 1, 1)',
        [`f-plain-${i}`, `平文${i}`, 'ai'],
      );
    }
    await db.run(
      'INSERT INTO folders (id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, 1, 1, 1)',
      ['f-sealed', sealed, 'ai'],
    );
    expect(await detectProtectedData({ db, meta, mediaBackend: emptyMedia, platformOs: 'ios' })).toBe(true);
  });

  it('detects sealed folder names', async () => {
    const key = await importAesKey(createHash('sha256').update('d').digest());
    const db = createBetterSqliteDriver();
    await migrate(db);
    const meta = createMetaRepo(db);
    const sealed = await sealString(key, '秘密');
    await db.run(
      'INSERT INTO folders (id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, 1, 1, 1)',
      ['f1', sealed, 'ai'],
    );
    expect(await detectProtectedData({ db, meta, mediaBackend: emptyMedia, platformOs: 'web' })).toBe(true);
  });

  it('detects migration meta flag', async () => {
    const db = createBetterSqliteDriver();
    await migrate(db);
    const meta = createMetaRepo(db);
    await meta.set(DATA_PROTECTION_META, DATA_PROTECTION_VERSION);
    expect(await detectProtectedData({ db, meta, mediaBackend: emptyMedia, platformOs: 'ios' })).toBe(true);
  });

  it('detects encrypted web media wrappers', async () => {
    const db = createBetterSqliteDriver();
    await migrate(db);
    const meta = createMetaRepo(db);
    const key = await importAesKey(createHash('sha256').update('m').digest());
    const packed = await encryptBytes(key, new Uint8Array([0xff, 0xd8, 0xff, 0x01]));
    const { path } = mediaPaths('a'.repeat(64));
    const wrapped = 'aksh:' + Buffer.from(packed).toString('base64');
    const mediaBackend = {
      ...emptyMedia,
      keys: async () => [path],
      uriFor: async () => wrapped,
    };
    expect(await detectProtectedData({ db, meta, mediaBackend, platformOs: 'web' })).toBe(true);
  });

  it('ignores unreadable media entries', async () => {
    const db = createBetterSqliteDriver();
    await migrate(db);
    const meta = createMetaRepo(db);
    const { path } = mediaPaths('u'.repeat(64));
    const mediaBackend = {
      ...emptyMedia,
      keys: async () => [path],
      uriFor: async () => 'file://broken',
      readBytes: async () => {
        throw new Error('io error');
      },
    };
    expect(await detectProtectedData({ db, meta, mediaBackend, platformOs: 'ios' })).toBe(false);
  });

  it('detects AKSH1 blobs on native media', async () => {
    const db = createBetterSqliteDriver();
    await migrate(db);
    const meta = createMetaRepo(db);
    const key = await importAesKey(createHash('sha256').update('n').digest());
    const packed = await encryptBytes(key, new Uint8Array([0xff, 0xd8, 0xff, 0x02]));
    const { path } = mediaPaths('b'.repeat(64));
    const mediaBackend = {
      ...emptyMedia,
      keys: async () => [path],
      uriFor: async () => 'file://doc/' + path,
      readBytes: async () => packed,
    };
    expect(await detectProtectedData({ db, meta, mediaBackend, platformOs: 'ios' })).toBe(true);
  });
});
