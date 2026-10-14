import type { MaskGeometry } from '@/domain/mask/types';
import { fixedClock } from '@/shared/clock';
import { createIdGenerator } from '@/shared/id';
import { sm2b } from '@/domain/scheduler/sm2b';

import { plaintextFieldProtector } from './security/fieldProtector';
import { migrate } from './db/migrate';
import { createBetterSqliteDriver } from './db/testing/betterSqliteDriver';
import type { NewMedia } from './media/types';
import { createCardRepo } from './repos/cardRepo';
import { createFolderRepo } from './repos/folderRepo';
import type { MediaStore } from './media/store';
import { executeImportPlan } from './importService';
import type { ImportPlan } from '@/import/types';

const rect: MaskGeometry = { v: 1, shapes: [{ t: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.1 }] };

function media(sha = 'c'.repeat(64)): NewMedia {
  return {
    sha256: sha,
    path: `media/${sha.slice(0, 2)}/${sha}.jpg`,
    thumbPath: `thumbs/${sha.slice(0, 2)}/${sha}.jpg`,
    mime: 'image/jpeg',
    width: 100,
    height: 100,
    byteSize: 10,
  };
}

function idGen(clock: ReturnType<typeof fixedClock>) {
  let seq = 0;
  return createIdGenerator(clock, (n) => {
    const b = new Uint8Array(n);
    b[15] = seq++ & 0xff;
    b[14] = (seq >> 8) & 0xff;
    return b;
  });
}

describe('executeImportPlan', () => {
  it('creates cards through cardRepo', async () => {
    const db = createBetterSqliteDriver();
    await migrate(db);
    const clock = fixedClock(1);
    const ctx = {
      db,
      clock,
      newId: idGen(clock),
      deviceId: 'd',
      timeZone: () => 'UTC',
      scheduler: sm2b,
      fields: plaintextFieldProtector,
    };
    const folders = createFolderRepo(ctx);
    const cards = createCardRepo(ctx);
    const f = await folders.create('dest');
    const store = {
      prepareImage: async () => ({ uri: 'file:///x.jpg', width: 100, height: 100 }),
      persistImage: async () => ({ ...media(), fresh: true }),
      discardPersisted: async () => undefined,
      resolveMediaUri: async () => 'file:///x.jpg',
      collectGarbage: async () => 0,
    } satisfies MediaStore;
    const plan: ImportPlan = {
      counts: { create: 1, skip: 0, overwrite: 0, duplicate: 0 },
      actions: [
        {
          kind: 'create',
          externalId: 'e1',
          folderId: f.id,
          card: {
            externalId: 'e1',
            deckPath: ['dest'],
            title: 't',
            imageFile: 'a.jpg',
            masks: [rect],
            review: null,
          },
        },
      ],
    };
    const result = await executeImportPlan(
      { cards, folders, store, prepareImageFromBytes: async () => ({ uri: 'x', width: 1, height: 1 }) },
      plan,
      'import:csv',
      async () => 'file:///x.jpg',
    );
    expect(result.imported).toBe(1);
    expect(await cards.listByFolder(f.id)).toHaveLength(1);
  });

  it('skips and overwrites per plan', async () => {
    const db = createBetterSqliteDriver();
    await migrate(db);
    const clock = fixedClock(1);
    const ctx = {
      db,
      clock,
      newId: idGen(clock),
      deviceId: 'd',
      timeZone: () => 'UTC',
      scheduler: sm2b,
      fields: plaintextFieldProtector,
    };
    const folders = createFolderRepo(ctx);
    const cards = createCardRepo(ctx);
    const f = await folders.create('dest');
    const first = await cards.create({
      folderId: f.id,
      media: media('a'.repeat(64)),
      masks: [rect],
      source: 'import:csv',
      externalId: 'e1',
    });
    const store = {
      prepareImage: async () => ({ uri: 'file:///x.jpg', width: 100, height: 100 }),
      persistImage: async () => ({ ...media('b'.repeat(64)), fresh: true }),
      discardPersisted: async () => undefined,
      resolveMediaUri: async () => 'file:///x.jpg',
      collectGarbage: async () => 0,
    } satisfies MediaStore;
    const cardPayload = {
      externalId: 'e1',
      deckPath: ['dest'],
      title: 'new',
      imageFile: 'a.jpg',
      masks: [rect],
      review: null,
    };
    const skip = await executeImportPlan(
      { cards, folders, store, prepareImageFromBytes: async () => ({ uri: 'x', width: 1, height: 1 }) },
      {
        counts: { create: 0, skip: 1, overwrite: 0, duplicate: 0 },
        actions: [{ kind: 'skip', externalId: 'e1' }],
      },
      'import:csv',
      async () => 'file:///x.jpg',
    );
    expect(skip.skipped).toBe(1);
    const overwrite = await executeImportPlan(
      { cards, folders, store, prepareImageFromBytes: async () => ({ uri: 'x', width: 1, height: 1 }) },
      {
        counts: { create: 0, skip: 0, overwrite: 1, duplicate: 0 },
        actions: [
          {
            kind: 'overwrite',
            externalId: 'e1',
            folderId: f.id,
            card: cardPayload,
            existingCardId: first.cardId,
          },
        ],
      },
      'import:csv',
      async () => 'file:///x.jpg',
    );
    expect(overwrite.imported).toBe(1);
    expect((await cards.get(first.cardId))?.title).toBe('new');
  });

  it('imports duplicate actions', async () => {
    const db = createBetterSqliteDriver();
    await migrate(db);
    const clock = fixedClock(1);
    const ctx = {
      db,
      clock,
      newId: idGen(clock),
      deviceId: 'd',
      timeZone: () => 'UTC',
      scheduler: sm2b,
      fields: plaintextFieldProtector,
    };
    const folders = createFolderRepo(ctx);
    const cards = createCardRepo(ctx);
    const f = await folders.create('dest');
    const store = {
      prepareImage: async () => ({ uri: 'file:///x.jpg', width: 100, height: 100 }),
      persistImage: async () => ({ ...media('d'.repeat(64)), fresh: true }),
      discardPersisted: async () => undefined,
      resolveMediaUri: async () => 'file:///x.jpg',
      collectGarbage: async () => 0,
    } satisfies MediaStore;
    const cardPayload = {
      externalId: 'e2',
      deckPath: ['dest'],
      title: 'dup',
      imageFile: 'a.jpg',
      masks: [rect],
      review: null,
    };
    const result = await executeImportPlan(
      { cards, folders, store, prepareImageFromBytes: async () => ({ uri: 'x', width: 1, height: 1 }) },
      {
        counts: { create: 0, skip: 0, overwrite: 0, duplicate: 1 },
        actions: [{ kind: 'duplicate', externalId: 'e2#dup2', folderId: f.id, card: cardPayload }],
      },
      'import:csv',
      async () => 'file:///x.jpg',
    );
    expect(result.imported).toBe(1);
    expect(await cards.listByFolder(f.id)).toHaveLength(1);
  });

  it('discards persisted media when card create fails', async () => {
    const db = createBetterSqliteDriver();
    await migrate(db);
    const clock = fixedClock(1);
    const ctx = {
      db,
      clock,
      newId: idGen(clock),
      deviceId: 'd',
      timeZone: () => 'UTC',
      scheduler: sm2b,
      fields: plaintextFieldProtector,
    };
    const folders = createFolderRepo(ctx);
    const cards = createCardRepo(ctx);
    const f = await folders.create('dest');
    let discarded = false;
    const store = {
      prepareImage: async () => ({ uri: 'file:///x.jpg', width: 100, height: 100 }),
      persistImage: async () => ({ ...media('e'.repeat(64)), fresh: true }),
      discardPersisted: async () => {
        discarded = true;
      },
      resolveMediaUri: async () => 'file:///x.jpg',
      collectGarbage: async () => 0,
    } satisfies MediaStore;
    const failingCards = { ...cards, create: async () => Promise.reject(new Error('db fail')) };
    await expect(
      executeImportPlan(
        {
          cards: failingCards,
          folders,
          store,
          prepareImageFromBytes: async () => ({ uri: 'x', width: 1, height: 1 }),
        },
        {
          counts: { create: 1, skip: 0, overwrite: 0, duplicate: 0 },
          actions: [
            {
              kind: 'create',
              externalId: 'x',
              folderId: f.id,
              card: {
                externalId: 'x',
                deckPath: ['dest'],
                title: null,
                imageFile: 'a.jpg',
                masks: [rect],
                review: null,
              },
            },
          ],
        },
        'import:csv',
        async () => 'file:///x.jpg',
      ),
    ).rejects.toThrow('db fail');
    expect(discarded).toBe(true);
  });
});
