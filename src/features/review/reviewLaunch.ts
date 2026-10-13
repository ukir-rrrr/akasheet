import { createHandoff } from '@/features/app/handoff';

import { ALL_FOLDERS, MAX_REPLAY_CARD_IDS } from './constants';

/** Everything the review screen needs to start a fresh session (not persisted). */
export type ReviewLaunch = {
  /** Bumps when a new session is opened so in-memory state cannot leak across launches. */
  key: string;
  /** null = all folders. */
  folderId: string | null;
  folderName: string;
  /** null = today's due queue for `folderId`; non-null = replay exactly these cards (「まだを もう一度」). */
  onlyCardIds: readonly string[] | null;
};

let launchSeq = 0;

export function createReviewLaunch(input: Omit<ReviewLaunch, 'key'>): ReviewLaunch {
  const onlyCardIds =
    input.onlyCardIds && input.onlyCardIds.length > 0
      ? input.onlyCardIds.slice(0, MAX_REPLAY_CARD_IDS)
      : null;
  return {
    ...input,
    key: `review-launch-${++launchSeq}`,
    onlyCardIds,
  };
}

export const reviewLaunch = createHandoff<ReviewLaunch>();

export type ReviewRouteParams = { folderId?: string; ids?: string };

/** Resolve session props from an explicit hand-off, with URL params only as a fallback (deep links). */
export function resolveReviewRoute(
  taken: ReviewLaunch | null,
  params: ReviewRouteParams,
): {
  launchKey: string;
  folderId: string | null;
  folderName: string | null;
  onlyCardIds: string[] | null;
} {
  if (taken) {
    return {
      launchKey: taken.key,
      folderId: taken.folderId,
      folderName: taken.folderName,
      onlyCardIds: taken.onlyCardIds ? [...taken.onlyCardIds] : null,
    };
  }

  const fid = params.folderId;
  const folderId = !fid || fid === ALL_FOLDERS ? null : fid;
  const replayParam = params.ids && params.ids.length <= 16_000 ? params.ids : undefined;
  const fromRoute = replayParam ? replayParam.split(',').filter(Boolean).slice(0, MAX_REPLAY_CARD_IDS) : null;
  const onlyCardIds = fromRoute?.length ? fromRoute : null;
  return {
    launchKey: `route:${folderId ?? ALL_FOLDERS}:${onlyCardIds?.join(',') ?? ''}`,
    folderId,
    folderName: null,
    onlyCardIds,
  };
}
