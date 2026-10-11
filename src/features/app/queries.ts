import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { resolveMediaUri } from '@/data/media/mediaStore';
import { dayEnd, dayStart } from '@/domain/scheduler/day';

import { useAppData } from './AppDataProvider';

export const keys = {
  folders: ['folders'] as const,
  folder: (id: string) => ['folder', id] as const,
  cards: (folderId: string) => ['cards', folderId] as const,
  card: (id: string) => ['card', id] as const,
  media: (rel: string) => ['media', rel] as const,
  nextDue: (folderId: string | null) => ['nextDue', folderId ?? 'all'] as const,
};

export function useToday() {
  const { ctx } = useAppData();
  const now = ctx.clock.now();
  const tz = ctx.timeZone();
  return { now, tz, dayStart: dayStart(now, tz), dayEnd: dayEnd(now, tz) };
}

export function useFolders() {
  const app = useAppData();
  return useQuery({
    queryKey: keys.folders,
    queryFn: () => app.folders.list(dayEnd(app.ctx.clock.now(), app.ctx.timeZone())),
  });
}

export function useFolder(id: string) {
  const app = useAppData();
  return useQuery({ queryKey: keys.folder(id), queryFn: () => app.folders.get(id) });
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
    queryFn: () => app.reviews.nextDueFrom(folderId, dayEnd(app.ctx.clock.now(), app.ctx.timeZone())),
  });
}

export function useMediaUri(rel: string | undefined) {
  return useQuery({
    queryKey: keys.media(rel ?? ''),
    queryFn: () => resolveMediaUri(rel!),
    enabled: !!rel,
    staleTime: Infinity,
  });
}

/** Everything derived from cards/review state; call after any write. */
export function useInvalidateAll() {
  const qc = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['folders'] }),
        qc.invalidateQueries({ queryKey: ['folder'] }),
        qc.invalidateQueries({ queryKey: ['cards'] }),
        qc.invalidateQueries({ queryKey: ['card'] }),
        qc.invalidateQueries({ queryKey: ['nextDue'] }),
      ]),
    [qc],
  );
}
