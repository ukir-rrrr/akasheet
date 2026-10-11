import { createHash } from 'node:crypto';

import type { MaskGeometry } from '@/domain/mask/types';
import { sm2b } from '@/domain/scheduler/sm2b';
import { fixedClock } from '@/shared/clock';
import { MissingAssetError, StorageError } from '@/shared/errors';
import { createIdGenerator } from '@/shared/id';

import { migrate } from './db/migrate';
import { createBetterSqliteDriver } from './db/testing/betterSqliteDriver';
import { createMediaStore, type MediaBackend } from './media/store';
import { fitLongSide, mediaPaths } from './media/types';
import { createCardRepo } from './repos/cardRepo';
import { createFolderRepo } from './repos/folderRepo';
import { createMediaRepo } from './repos/mediaRepo';
import { MEDIA_GC_GRACE_MS, runMaintenance, saveCard } from './services';

const rect: MaskGeometry = { v: 1, shapes: [{ t: 'rect', x: 0.1, y: 0.1, w: 0.3, h: 0.05 }] };

/** In-memory backend: source URIs map to byte strings, encoding just tags the bytes with the target size. */
function fakeBackend(sources: Record<string, string>) {
  const blobs = new Map<string, Uint8Array<ArrayBuffer>>(
    Object.entries(sources).map(([k, v]) => [k, new TextEncoder().encode(v)]),
  );
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  let quota = Infinity;
  const backend: MediaBackend = {
    async encodeJpeg(uri, maxSide) {
      const src = blobs.get(uri);
      if (!src) throw new Error(`no source ${uri}`);
      const out = `${uri}@${maxSide}`;
      blobs.set(out, new Uint8Array([...src, maxSide & 0xff]));
      const fit = fitLongSide(3000, 4000, maxSide) ?? { width: 3000, height: 4000 };
      return { uri: out, ...fit };
    },
    async readBytes(uri) {
      const b = blobs.get(uri) ?? files.get(uri);
      if (!b) throw new Error(`missing ${uri}`);
      return b;
    },
    async sha256(bytes) {
      return createHash('sha256').update(bytes).digest('hex');
    },
    async putIfAbsent(key, srcUri) {
      if (files.has(key)) return false;
      files.set(key, await backend.readBytes(srcUri));
      return true;
    },
    async remove(key) {
      files.delete(key);
    },
    async keys() {
      return [...files.keys()];
    },
    async uriFor(key) {
      return files.has(key) ? `mem://${key}` : null;
    },
    assertCapacity(bytes) {
      if (bytes > quota) throw new StorageError('容量が足りません');
    },
  };
  return { backend, files, setQuota: (q: number) => void (quota = q) };
}

async function setup(sources: Record<string, string> = { 'pick://a': 'AAAA', 'pick://b': 'BBBB' }) {
  const db = createBetterSqliteDriver();
  await migrate(db);
  const clock = fixedClock(Date.parse('2026-10-11T13:00:00+09:00'));
  let seq = 0;
  const ctx = {
    db,
    clock,
    newId: createIdGenerator(clock, (n) => {
      const b = new Uint8Array(n);
      b[15] = ++seq & 0xff;
      return b;
    }),
    deviceId: 'd',
    timeZone: () => 'Asia/Tokyo',
    scheduler: sm2b,
  };
  const fake = fakeBackend(sources);
  const store = createMediaStore(fake.backend);
  const folders = createFolderRepo(ctx);
  const cards = createCardRepo(ctx);
  const media = createMediaRepo(ctx);
  const folder = await folders.create('日本史');
  return { ...fake, store, cards, media, clock, folderId: folder.id };
}

describe('mediaStore', () => {
  it('prepares within 2048px and persists content-addressed image + thumbnail', async () => {
    const { store, files } = await setup();
    const img = await store.prepareImage('pick://a');
    expect(img).toMatchObject({ width: 1536, height: 2048 });
    const m = await store.persistImage(img);
    expect(m).toMatchObject({ ...mediaPaths(m.sha256), width: 1536, height: 2048, fresh: true });
    expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect([...files.keys()].sort()).toEqual([m.path, m.thumbPath].sort());
    expect(await store.resolveMediaUri(m.path)).toBe(`mem://${m.path}`);
    await expect(store.resolveMediaUri('media/zz/none.jpg')).rejects.toThrow('unsafe media key');
    const missing = `media/00/${'0'.repeat(64)}.jpg`;
    await expect(store.resolveMediaUri(missing)).rejects.toBeInstanceOf(MissingAssetError);

    const again = await store.persistImage(await store.prepareImage('pick://a'));
    expect(again).toMatchObject({ sha256: m.sha256, fresh: false });
    await store.discardPersisted(again);
    expect(files.size).toBe(2);
  });

  it('refuses to write when storage is short', async () => {
    const { store, setQuota, files } = await setup();
    setQuota(1);
    await expect(store.persistImage(await store.prepareImage('pick://a'))).rejects.toBeInstanceOf(
      StorageError,
    );
    expect(files.size).toBe(0);
  });
});

describe('saveCard', () => {
  it('saves files then the card', async () => {
    const { store, cards, folderId } = await setup();
    const image = await store.prepareImage('pick://a');
    const cardId = await saveCard({ cards, store }, { folderId, image, masks: [rect], source: 'library' });
    const detail = await cards.get(cardId);
    expect(detail?.media).toMatchObject({ width: 1536, height: 2048 });
  });

  it('removes newly written files when the DB save fails', async () => {
    const { store, cards, files, folderId } = await setup();
    const image = await store.prepareImage('pick://a');
    await expect(
      saveCard({ cards, store }, { folderId, image, masks: [], source: 'library' }),
    ).rejects.toThrow();
    expect(files.size).toBe(0);
    await saveCard({ cards, store }, { folderId, image, masks: [rect], source: 'library' });
    await expect(
      saveCard({ cards, store }, { folderId: 'missing', image, masks: [rect], source: 'library' }),
    ).rejects.toThrow();
    expect(files.size).toBe(2);
  });
});

describe('runMaintenance', () => {
  it('purges media of long-deleted cards and deletes orphan files', async () => {
    const { store, cards, media, clock, files, folderId } = await setup();
    const keep = await saveCard(
      { cards, store },
      { folderId, image: await store.prepareImage('pick://a'), masks: [rect], source: 'library' },
    );
    const drop = await saveCard(
      { cards, store },
      { folderId, image: await store.prepareImage('pick://b'), masks: [rect], source: 'library' },
    );
    files.set(`media/aa/${'c'.repeat(64)}.jpg`, new Uint8Array(1));
    await cards.remove([drop]);

    expect(await runMaintenance({ media, store, clock })).toEqual({ purged: 0, removedFiles: 1 });
    expect(files.size).toBe(4);

    clock.advance(MEDIA_GC_GRACE_MS + 1);
    expect(await runMaintenance({ media, store, clock })).toEqual({ purged: 1, removedFiles: 2 });
    const detail = await cards.get(keep);
    expect([...files.keys()].sort()).toEqual([detail?.media.path, detail?.media.thumbPath].sort());
  });
});
