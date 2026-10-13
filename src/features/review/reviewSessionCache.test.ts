import { QueryClient } from '@tanstack/react-query';

import { keys } from '@/features/app/queryKeys';
import { invalidateAfterReview } from '@/features/app/queryInvalidation';

import { cacheTargetsAfterUndo } from './reviewSessionCache';
import type { LastAnswerInfo } from './useReviewSession';

function seedTwoFolders(qc: QueryClient) {
  qc.setQueryData(keys.folders, []);
  qc.setQueryData(keys.cards('folder-a'), [{ id: 'card-a' }]);
  qc.setQueryData(keys.cards('folder-b'), [{ id: 'card-b' }]);
  qc.setQueryData(keys.nextDue(null), null);
  qc.setQueryData(keys.nextDue('folder-a'), null);
  qc.setQueryData(keys.nextDue('folder-b'), null);
}

function isInvalidated(qc: QueryClient, queryKey: readonly unknown[]) {
  return qc.getQueryState(queryKey)?.isInvalidated === true;
}

describe('review answer then undo (all folders)', () => {
  it('refreshes the undone card folder even when the next card belongs elsewhere', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedTwoFolders(qc);

    const lastAnswer: LastAnswerInfo = {
      cardId: 'card-a',
      cardFolderId: 'folder-a',
      rating: 3,
      next: {
        phase: 'review',
        dueAt: 1,
        intervalDays: 1,
        ease: 2.5,
        reps: 1,
        lapses: 0,
        lastReviewedAt: 0,
      },
      at: 0,
    };

    const targets = cacheTargetsAfterUndo(lastAnswer, null);
    await invalidateAfterReview(qc, targets);

    expect(isInvalidated(qc, keys.folders)).toBe(true);
    expect(isInvalidated(qc, keys.cards('folder-a'))).toBe(true);
    expect(isInvalidated(qc, keys.nextDue('folder-a'))).toBe(true);
    expect(isInvalidated(qc, keys.cards('folder-b'))).toBe(false);
    expect(isInvalidated(qc, keys.nextDue('folder-b'))).toBe(false);
  });

  it('does not refresh the undone folder when the wrong (next card) folder is used', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedTwoFolders(qc);

    await invalidateAfterReview(qc, {
      cardId: 'card-a',
      cardFolderId: 'folder-b',
      scopeFolderId: null,
    });

    expect(isInvalidated(qc, keys.cards('folder-a'))).toBe(false);
    expect(isInvalidated(qc, keys.cards('folder-b'))).toBe(true);
  });
});
