import type { QueryClient } from '@tanstack/react-query';

import { keys } from './queryKeys';

/** Prefix keys for bulk invalidation when many cards disappear (folder delete). */
const CARD_LIST_ROOT = keys.cards('').slice(0, 1);
const CARD_DETAIL_ROOT = keys.card('').slice(0, 1);
const NEXT_DUE_ROOT = keys.nextDue(null).slice(0, 1);
const PREVIEW_ROOT = keys.preview('', 0).slice(0, 1);

async function invalidateFoldersAndNextDue(qc: QueryClient, folderIds: Iterable<string | null>) {
  const jobs = [qc.invalidateQueries({ queryKey: keys.folders })];
  for (const id of folderIds) {
    jobs.push(qc.invalidateQueries({ queryKey: keys.nextDue(id) }));
  }
  await Promise.all(jobs);
}

/** New card saved into a folder. */
export async function invalidateAfterCardSave(qc: QueryClient, folderId: string) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: keys.folders }),
    qc.invalidateQueries({ queryKey: keys.cards(folderId) }),
    qc.invalidateQueries({ queryKey: keys.nextDue(folderId) }),
    qc.invalidateQueries({ queryKey: keys.nextDue(null) }),
  ]);
}

/** Review answer or undo: scheduling and folder due counts change. */
export async function invalidateAfterReview(
  qc: QueryClient,
  opts: { cardId: string; cardFolderId: string | null; scopeFolderId: string | null },
) {
  const folderIds = new Set<string | null>([null]);
  if (opts.scopeFolderId) folderIds.add(opts.scopeFolderId);
  if (opts.cardFolderId) folderIds.add(opts.cardFolderId);

  const jobs: Promise<void>[] = [
    qc.invalidateQueries({ queryKey: keys.folders }),
    qc.invalidateQueries({ queryKey: ['preview', opts.cardId] }),
  ];
  for (const id of folderIds) {
    if (id) jobs.push(qc.invalidateQueries({ queryKey: keys.cards(id) }));
    jobs.push(qc.invalidateQueries({ queryKey: keys.nextDue(id) }));
  }
  await Promise.all(jobs);
}

export async function invalidateAfterFolderCreate(qc: QueryClient) {
  await qc.invalidateQueries({ queryKey: keys.folders });
}

export async function invalidateAfterFolderRename(qc: QueryClient, folderId: string) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: keys.folders }),
    qc.invalidateQueries({ queryKey: keys.folder(folderId) }),
  ]);
}

/** Folder and all its cards are removed. */
export async function invalidateAfterFolderDelete(qc: QueryClient, folderId: string) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: keys.folders }),
    qc.invalidateQueries({ queryKey: keys.folder(folderId) }),
    qc.invalidateQueries({ queryKey: CARD_LIST_ROOT }),
    qc.invalidateQueries({ queryKey: CARD_DETAIL_ROOT }),
    qc.invalidateQueries({ queryKey: NEXT_DUE_ROOT }),
    qc.invalidateQueries({ queryKey: PREVIEW_ROOT }),
  ]);
}

export async function invalidateAfterCardsMove(
  qc: QueryClient,
  fromFolderId: string,
  toFolderId: string,
  cardIds: string[],
) {
  await invalidateFoldersAndNextDue(qc, [fromFolderId, toFolderId, null]);
  await Promise.all([
    qc.invalidateQueries({ queryKey: keys.cards(fromFolderId) }),
    qc.invalidateQueries({ queryKey: keys.cards(toFolderId) }),
    ...cardIds.map((id) => qc.invalidateQueries({ queryKey: keys.card(id) })),
  ]);
}

export async function invalidateAfterCardsDelete(qc: QueryClient, folderId: string, cardIds: string[]) {
  await invalidateFoldersAndNextDue(qc, [folderId, null]);
  await Promise.all([
    qc.invalidateQueries({ queryKey: keys.cards(folderId) }),
    ...cardIds.map((id) => qc.invalidateQueries({ queryKey: keys.card(id) })),
  ]);
}
