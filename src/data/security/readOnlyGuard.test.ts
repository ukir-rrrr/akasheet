import { DataProtectionError } from '@/shared/errors';

import { guardCardsWhenReadOnly, guardFoldersWhenReadOnly, guardReviewsWhenReadOnly } from './readOnlyGuard';

describe('readOnlyGuard', () => {
  it('passes through when mutation is allowed', async () => {
    const base = {
      list: async () => [],
      get: async () => null,
      create: async () => ({ id: 'x', name: 'n', color: 'ai' as const }),
      ensurePath: async () => 'x',
      findByName: async () => null,
      rename: async () => undefined,
      remove: async () => undefined,
    };
    expect(guardFoldersWhenReadOnly(base, true)).toBe(base);
  });

  it('blocks folder writes in read-only mode', async () => {
    const base = {
      list: async () => [],
      get: async () => null,
      create: async () => ({ id: 'x', name: 'n', color: 'ai' as const }),
      ensurePath: async () => 'x',
      findByName: async () => null,
      rename: async () => undefined,
      remove: async () => undefined,
    };
    const ro = guardFoldersWhenReadOnly(base, false);
    await expect(ro.create('a')).rejects.toBeInstanceOf(DataProtectionError);
    await expect(ro.rename('a', 'b')).rejects.toBeInstanceOf(DataProtectionError);
    await expect(ro.remove('a')).rejects.toBeInstanceOf(DataProtectionError);
    await expect(ro.list(0)).resolves.toEqual([]);
  });

  it('blocks card and review writes in read-only mode', async () => {
    const cards = guardCardsWhenReadOnly(
      {
        create: async () => ({ cardId: 'c', mediaId: 'm', reusedMedia: false }),
        existingExternalIds: async () => new Set(),
        listByFolder: async () => [],
        get: async () => null,
        remove: async () => undefined,
        move: async () => undefined,
      },
      false,
    );
    await expect(
      cards.create({ folderId: 'f', media: {} as never, masks: [], source: 'library' }),
    ).rejects.toThrow();

    const reviews = guardReviewsWhenReadOnly(
      {
        queue: async () => [],
        newIntroducedSince: async () => 0,
        nextDueFrom: async () => null,
        state: async () => ({}) as never,
        queueFor: async () => [],
        preview: async () => ({}) as never,
        answer: async () => ({}) as never,
        undo: async () => undefined,
        replay: async () => ({}) as never,
      },
      false,
    );
    await expect(
      reviews.answer({ cardId: 'c', rating: 3, revealedCount: 0, maskCount: 1, durationMs: null }),
    ).rejects.toThrow();
  });
});
