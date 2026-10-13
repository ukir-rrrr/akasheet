import type { LastAnswerInfo } from './useReviewSession';

/** Cache keys to refresh after a review answer (see `useReviewSession`). */
export function cacheTargetsAfterAnswer(
  cardId: string,
  cardFolderId: string | null,
  scopeFolderId: string | null,
) {
  return { cardId, cardFolderId, scopeFolderId };
}

/** Cache keys to refresh after undo; must use the answered card's folder, not the next card on screen. */
export function cacheTargetsAfterUndo(
  last: Pick<LastAnswerInfo, 'cardId' | 'cardFolderId'>,
  scopeFolderId: string | null,
) {
  return {
    cardId: last.cardId,
    cardFolderId: last.cardFolderId,
    scopeFolderId,
  };
}
