import { QueryClient } from '@tanstack/react-query';

import { keys } from './queryKeys';
import {
  invalidateAfterCardSave,
  invalidateAfterCardsDelete,
  invalidateAfterCardsMove,
  invalidateAfterFolderCreate,
  invalidateAfterFolderDelete,
  invalidateAfterFolderRename,
  invalidateAfterReview,
} from './queryInvalidation';

function seed(qc: QueryClient) {
  qc.setQueryData(keys.folders, []);
  qc.setQueryData(keys.folder('f1'), { id: 'f1', name: 'A', color: 'ai' });
  qc.setQueryData(keys.cards('f1'), []);
  qc.setQueryData(keys.cards('f2'), []);
  qc.setQueryData(keys.card('c1'), { id: 'c1' });
  qc.setQueryData(keys.nextDue(null), null);
  qc.setQueryData(keys.nextDue('f1'), null);
  qc.setQueryData(keys.media('m/thumb.jpg'), 'file:///thumb');
  qc.setQueryData(keys.preview('c1', 0), {});
  qc.setQueryData(keys.preview('c1', 2), {});
}

function isInvalidated(qc: QueryClient, queryKey: readonly unknown[]) {
  return qc.getQueryState(queryKey)?.isInvalidated === true;
}

describe('queryInvalidation', () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seed(qc);
  });

  it('invalidateAfterCardSave touches folder list and target folder caches only', async () => {
    await invalidateAfterCardSave(qc, 'f1');
    expect(isInvalidated(qc, keys.folders)).toBe(true);
    expect(isInvalidated(qc, keys.cards('f1'))).toBe(true);
    expect(isInvalidated(qc, keys.nextDue('f1'))).toBe(true);
    expect(isInvalidated(qc, keys.nextDue(null))).toBe(true);
    expect(isInvalidated(qc, keys.cards('f2'))).toBe(false);
    expect(isInvalidated(qc, keys.media('m/thumb.jpg'))).toBe(false);
  });

  it('invalidateAfterReview scopes card lists to known folders', async () => {
    await invalidateAfterReview(qc, { cardId: 'c1', cardFolderId: 'f2', scopeFolderId: 'f1' });
    expect(isInvalidated(qc, keys.folders)).toBe(true);
    expect(isInvalidated(qc, keys.cards('f1'))).toBe(true);
    expect(isInvalidated(qc, keys.cards('f2'))).toBe(true);
    expect(isInvalidated(qc, keys.preview('c1', 0))).toBe(true);
    expect(isInvalidated(qc, keys.preview('c1', 2))).toBe(true);
    expect(isInvalidated(qc, keys.card('c1'))).toBe(false);
    expect(isInvalidated(qc, keys.media('m/thumb.jpg'))).toBe(false);
  });

  it('invalidateAfterFolderCreate only refreshes the folder list', async () => {
    await invalidateAfterFolderCreate(qc);
    expect(isInvalidated(qc, keys.folders)).toBe(true);
    expect(isInvalidated(qc, keys.cards('f1'))).toBe(false);
  });

  it('invalidateAfterFolderRename refreshes list and detail', async () => {
    await invalidateAfterFolderRename(qc, 'f1');
    expect(isInvalidated(qc, keys.folders)).toBe(true);
    expect(isInvalidated(qc, keys.folder('f1'))).toBe(true);
    expect(isInvalidated(qc, keys.cards('f1'))).toBe(false);
  });

  it('invalidateAfterFolderDelete clears card-derived caches but not media', async () => {
    await invalidateAfterFolderDelete(qc, 'f1');
    expect(isInvalidated(qc, keys.folders)).toBe(true);
    expect(isInvalidated(qc, keys.folder('f1'))).toBe(true);
    expect(isInvalidated(qc, keys.cards('f1'))).toBe(true);
    expect(isInvalidated(qc, keys.cards('f2'))).toBe(true);
    expect(isInvalidated(qc, keys.card('c1'))).toBe(true);
    expect(isInvalidated(qc, keys.preview('c1', 0))).toBe(true);
    expect(isInvalidated(qc, keys.media('m/thumb.jpg'))).toBe(false);
  });

  it('invalidateAfterCardsMove updates both folders and moved cards', async () => {
    await invalidateAfterCardsMove(qc, 'f1', 'f2', ['c1']);
    expect(isInvalidated(qc, keys.cards('f1'))).toBe(true);
    expect(isInvalidated(qc, keys.cards('f2'))).toBe(true);
    expect(isInvalidated(qc, keys.card('c1'))).toBe(true);
    expect(isInvalidated(qc, keys.folders)).toBe(true);
    expect(isInvalidated(qc, keys.media('m/thumb.jpg'))).toBe(false);
  });

  it('invalidateAfterCardsDelete updates folder cards and removed ids', async () => {
    await invalidateAfterCardsDelete(qc, 'f1', ['c1']);
    expect(isInvalidated(qc, keys.cards('f1'))).toBe(true);
    expect(isInvalidated(qc, keys.card('c1'))).toBe(true);
    expect(isInvalidated(qc, keys.cards('f2'))).toBe(false);
    expect(isInvalidated(qc, keys.folders)).toBe(true);
  });
});
