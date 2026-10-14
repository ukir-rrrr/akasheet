import { createHash, webcrypto } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { SqlDriver } from '../db/driver';
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
      completed: true,
    });
  });

  it('seals plaintext that only starts with enc1: prefix', async () => {
    const key = await importAesKey(createHash('sha256').update('dek2').digest());
    const fields = createFieldProtector(key);
    const db = createBetterSqliteDriver();
    await migrate(db);
    const meta = createMetaRepo(db);
    const decoy = 'enc1:not-a-real-ciphertext';
    await db.run(
      'INSERT INTO folders (id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, 1, 1, 1)',
      ['f-decoy', decoy, 'ai'],
    );

    const { backend } = memoryBackend();
    const res = await migrateAtRest({ db, meta, mediaBackend: backend, dek: key, fields, platformOs: 'web' });
    expect(res.completed).toBe(true);

    const row = await db.get<{ name: string }>('SELECT name FROM folders WHERE id = ?', ['f-decoy']);
    expect(isSealedField(row!.name)).toBe(true);
    expect(await fields.open(row!.name)).toBe(decoy);
  });

  it('does not leave folder plaintext in the WAL after sealing columns', async () => {
    const plainName = 'WAL_PLAINTEXT_FOLDER_MARKER_歴史';
    const key = await importAesKey(createHash('sha256').update('dek-wal').digest());
    const fields = createFieldProtector(key);
    const dir = mkdtempSync(join(tmpdir(), 'akasheet-migrate-wal-'));
    const file = join(dir, 'akasheet.db');
    const db = createBetterSqliteDriver(file);
    await db.exec('PRAGMA journal_mode = WAL');
    await migrate(db);
    const meta = createMetaRepo(db);
    await db.run(
      'INSERT INTO folders (id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, 1, 1, 1)',
      ['f-wal', plainName, 'ai'],
    );

    const { backend } = memoryBackend();
    const res = await migrateAtRest({ db, meta, mediaBackend: backend, dek: key, fields, platformOs: 'ios' });
    expect(res.completed).toBe(true);
    db.close();

    const marker = Buffer.from(plainName, 'utf8');
    const walPath = `${file}-wal`;
    let walBytes: Buffer | null = null;
    try {
      walBytes = readFileSync(walPath);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw e;
    }
    if (walBytes && walBytes.length > 0) {
      expect(walBytes.includes(marker)).toBe(false);
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('retries finalize when VACUUM fails without clearing sealed rows', async () => {
    const key = await importAesKey(createHash('sha256').update('dek-vac').digest());
    const fields = createFieldProtector(key);
    const inner = createBetterSqliteDriver();
    await migrate(inner);
    const meta = createMetaRepo(inner);
    await inner.run(
      'INSERT INTO folders (id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, 1, 1, 1)',
      ['f-vac', 'retry-me', 'ai'],
    );

    let vacuumAttempts = 0;
    const db: SqlDriver = {
      ...inner,
      async exec(sql) {
        if (/^\s*VACUUM\s*$/i.test(sql.trim())) {
          vacuumAttempts++;
          if (vacuumAttempts === 1) throw new Error('vacuum blocked');
        }
        return inner.exec(sql);
      },
    };

    const { backend } = memoryBackend();
    const first = await migrateAtRest({
      db,
      meta,
      mediaBackend: backend,
      dek: key,
      fields,
      platformOs: 'web',
    });
    expect(first.completed).toBe(false);
    expect((await meta.get(DATA_PROTECTION_META)) ?? null).toBeNull();

    const rowAfterFail = await db.get<{ name: string }>('SELECT name FROM folders WHERE id = ?', ['f-vac']);
    expect(isSealedField(rowAfterFail!.name)).toBe(true);

    const second = await migrateAtRest({
      db,
      meta,
      mediaBackend: backend,
      dek: key,
      fields,
      platformOs: 'web',
    });
    expect(second.completed).toBe(true);
    expect(vacuumAttempts).toBeGreaterThanOrEqual(2);
  });

  it('does not mark migration complete when media encryption fails', async () => {
    const key = await importAesKey(createHash('sha256').update('dek3').digest());
    const fields = createFieldProtector(key);
    const db = createBetterSqliteDriver();
    await migrate(db);
    const meta = createMetaRepo(db);
    const { backend, store } = memoryBackend();
    const { path } = mediaPaths('e'.repeat(64));
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString('base64');
    store.set('src', jpeg);
    await backend.putIfAbsent(path, 'src');

    const failingBackend: MediaBackend = {
      ...backend,
      async keys() {
        return [path];
      },
      async readBytes() {
        throw new Error('io fail');
      },
    };

    const res = await migrateAtRest({
      db,
      meta,
      mediaBackend: failingBackend,
      dek: key,
      fields,
      platformOs: 'web',
    });
    expect(res.completed).toBe(false);
    expect((await meta.get(DATA_PROTECTION_META)) ?? null).toBeNull();
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
