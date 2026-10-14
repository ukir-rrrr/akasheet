import { createHash, webcrypto } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import Database from 'better-sqlite3';
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

    const marker = Buffer.from(plainName, 'utf8');
    const walPath = `${file}-wal`;
    expect(existsSync(walPath)).toBe(true);
    const walBytes = readFileSync(walPath);
    expect(walBytes.includes(marker)).toBe(false);

    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('does not mark migration complete when wal_checkpoint is busy', async () => {
    const key = await importAesKey(createHash('sha256').update('dek-wal-busy').digest());
    const fields = createFieldProtector(key);
    const dir = mkdtempSync(join(tmpdir(), 'akasheet-migrate-wal-busy-'));
    const file = join(dir, 'akasheet.db');
    const db = createBetterSqliteDriver(file);
    await db.exec('PRAGMA journal_mode = WAL');
    await migrate(db);
    const meta = createMetaRepo(db);
    await db.run(
      'INSERT INTO folders (id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, 1, 1, 1)',
      ['f-busy', 'blocked-checkpoint', 'ai'],
    );

    const blocker = new Database(file);
    blocker.exec('BEGIN');
    blocker.prepare('SELECT COUNT(*) AS n FROM folders').get();

    const { backend } = memoryBackend();
    const blocked = await migrateAtRest({
      db,
      meta,
      mediaBackend: backend,
      dek: key,
      fields,
      platformOs: 'ios',
    });
    expect(blocked.completed).toBe(false);
    expect((await meta.get(DATA_PROTECTION_META)) ?? null).toBeNull();

    blocker.exec('ROLLBACK');
    blocker.close();

    const retry = await migrateAtRest({
      db,
      meta,
      mediaBackend: backend,
      dek: key,
      fields,
      platformOs: 'ios',
    });
    expect(retry.completed).toBe(true);
    expect((await meta.get(DATA_PROTECTION_META)) === DATA_PROTECTION_VERSION).toBe(true);

    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('retries finalize when compactFreelist fails without clearing sealed rows', async () => {
    const key = await importAesKey(createHash('sha256').update('dek-vac').digest());
    const fields = createFieldProtector(key);
    const inner = createBetterSqliteDriver();
    await migrate(inner);
    const meta = createMetaRepo(inner);
    await inner.run(
      'INSERT INTO folders (id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, 1, 1, 1)',
      ['f-vac', 'retry-me', 'ai'],
    );

    let compactAttempts = 0;
    const db: SqlDriver = {
      ...inner,
      async compactFreelist() {
        compactAttempts++;
        if (compactAttempts === 1) return false;
        return inner.compactFreelist();
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
    expect(compactAttempts).toBeGreaterThanOrEqual(2);
  });

  it('does not leave mask shape JSON plaintext in the main db file after sealing', async () => {
    const plainGeometry =
      '{"v":1,"shapes":[{"t":"rect","x":0.11,"y":0.22,"w":0.33,"h":0.44,"PLAIN_MASK_FREELIST_MARKER":true}]}';
    const marker = Buffer.from('"PLAIN_MASK_FREELIST_MARKER":true', 'utf8');
    const key = await importAesKey(createHash('sha256').update('dek-db-bytes').digest());
    const fields = createFieldProtector(key);
    const dir = mkdtempSync(join(tmpdir(), 'akasheet-migrate-db-'));
    const file = join(dir, 'akasheet.db');
    const db = createBetterSqliteDriver(file);
    await db.exec('PRAGMA journal_mode = WAL');
    await migrate(db);
    const meta = createMetaRepo(db);
    await db.run(
      'INSERT INTO folders (id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, 1, 1, 1)',
      ['f-mask', 'folder', 'ai'],
    );
    await db.run(
      `INSERT INTO media (id, path, thumb_path, sha256, mime, width, height, byte_size, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'image/jpeg', 1, 1, 1, 1, 1)`,
      ['m1', 'media/aa/bb.jpg', 'thumbs/aa/bb.jpg', 'a'.repeat(64)],
    );
    await db.run(
      `INSERT INTO cards (id, folder_id, media_id, title, source, created_device_id, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'library', 'dev', 1, 1)`,
      ['c1', 'f-mask', 'm1'],
    );
    await db.run(
      `INSERT INTO masks (id, card_id, ord, geometry, bbox_x, bbox_y, bbox_w, bbox_h, created_at, updated_at)
       VALUES (?, ?, 0, ?, 0, 0, 1, 1, 1, 1)`,
      ['mk1', 'c1', plainGeometry],
    );

    const { backend } = memoryBackend();
    const res = await migrateAtRest({ db, meta, mediaBackend: backend, dek: key, fields, platformOs: 'ios' });
    expect(res.completed).toBe(true);
    db.close();

    const mainBytes = readFileSync(file);
    expect(mainBytes.includes(marker)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
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
