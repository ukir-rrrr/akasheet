import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { dayEnd, dayStart } from '@/domain/scheduler/day';

import { useAppData } from './AppDataProvider';

export const keys = {
  folders: ['folders'] as const,
  folder: (id: string) => ['folder', id] as const,
  cards: (folderId: string) => ['cards', folderId] as const,
  card: (id: string) => ['card', id] as const,
  media: (rel: string) => ['media', rel] as const,
  nextDue: (folderId: string | null) => ['nextDue', folderId ?? 'all'] as const,
  preview: (cardId: string, answered: number) => ['preview', cardId, answered] as const,
};

/** Query roots derived from cards/review state (media URIs are content-addressed and never go stale). */
const DERIVED_ROOTS = [keys.folders[0], 'folder', 'cards', 'card', 'nextDue', 'preview'] as const;

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

/** Everything derived from cards/review state; call after any write. */
export function useInvalidateAll() {
  const qc = useQueryClient();
  return useCallback(
    () => Promise.all(DERIVED_ROOTS.map((root) => qc.invalidateQueries({ queryKey: [root] }))),
    [qc],
  );
}
