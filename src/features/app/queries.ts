import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { dayEnd, dayStart } from '@/domain/scheduler/day';

import { useAppData } from './AppDataProvider';
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

export { keys } from './queryKeys';

export function useToday() {
  const app = useAppData();
  const now = app.clock.now();
  const tz = app.timeZone();
  return { now, tz, dayStart: dayStart(now, tz), dayEnd: dayEnd(now, tz) };
}

export function useFolders() {
  const app = useAppData();
  return useQuery({
    queryKey: keys.folders,
    queryFn: () => app.folders.list(dayEnd(app.clock.now(), app.timeZone())),
  });
}

export function useFolder(id: string | null) {
  const app = useAppData();
  return useQuery({
    queryKey: keys.folder(id ?? ''),
    queryFn: () => app.folders.get(id!),
    enabled: id !== null,
  });
}

export function useCards(folderId: string) {
  const app = useAppData();
  return useQuery({ queryKey: keys.cards(folderId), queryFn: () => app.cards.listByFolder(folderId) });
}

export function useCard(id: string | undefined) {
  const app = useAppData();
  return useQuery({ queryKey: keys.card(id ?? ''), queryFn: () => app.cards.get(id!), enabled: !!id });
}

/** Earliest due time after today (for 「次は ◯月◯日」). */
export function useNextDue(folderId: string | null) {
  const app = useAppData();
  return useQuery({
    queryKey: keys.nextDue(folderId),
    queryFn: () => app.reviews.nextDueFrom(folderId, dayEnd(app.clock.now(), app.timeZone())),
  });
}

export function useMediaUri(rel: string | undefined) {
  const app = useAppData();
  return useQuery({
    queryKey: keys.media(rel ?? ''),
    queryFn: () => app.images.resolveMediaUri(rel!),
    enabled: !!rel,
    staleTime: Infinity,
  });
}

export function useQueryInvalidation() {
  const qc = useQueryClient();
  return {
    afterCardSave: useCallback((folderId: string) => invalidateAfterCardSave(qc, folderId), [qc]),
    afterReview: useCallback(
      (opts: { cardId: string; cardFolderId: string | null; scopeFolderId: string | null }) =>
        invalidateAfterReview(qc, opts),
      [qc],
    ),
    afterFolderCreate: useCallback(() => invalidateAfterFolderCreate(qc), [qc]),
    afterFolderRename: useCallback((folderId: string) => invalidateAfterFolderRename(qc, folderId), [qc]),
    afterFolderDelete: useCallback((folderId: string) => invalidateAfterFolderDelete(qc, folderId), [qc]),
    afterCardsMove: useCallback(
      (fromFolderId: string, toFolderId: string, cardIds: string[]) =>
        invalidateAfterCardsMove(qc, fromFolderId, toFolderId, cardIds),
      [qc],
    ),
    afterCardsDelete: useCallback(
      (folderId: string, cardIds: string[]) => invalidateAfterCardsDelete(qc, folderId, cardIds),
      [qc],
    ),
  };
}
