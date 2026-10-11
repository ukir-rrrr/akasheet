import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import type { CardDetail } from '@/data/repos/cardRepo';
import type { Mask } from '@/domain/mask/types';
import {
  applyAnswer,
  currentCard,
  DEFAULT_NEW_LIMIT,
  isFinished,
  lastAnswer,
  nextPendingIn,
  resumePending,
  revealAll,
  revealNext,
  sessionStats,
  startSession,
  toggleReveal,
  undoAnswer,
  type SessionState,
} from '@/domain/review/session';
import { dayEnd, dayStart } from '@/domain/scheduler/day';
import type { Rating, ReviewState } from '@/domain/scheduler/types';
import { useAppData } from '@/features/app/AppDataProvider';
import { keys, useCard, useInvalidateAll } from '@/features/app/queries';

import type { SessionResult } from './sessionResult';

export type LastAnswerInfo = { rating: Rating; next: ReviewState; at: number };

export type CardView = {
  kind: 'card';
  cardId: string;
  /** Undefined while the card loads. */
  card: CardDetail | undefined;
  masks: Mask[];
  orderedIds: string[];
  revealed: ReadonlySet<string>;
  preview: Record<Rating, ReviewState> | undefined;
  progress: { index: number; total: number };
};

export type ReviewView =
  | { kind: 'loading' }
  | { kind: 'error'; retry: () => void }
  | { kind: 'empty' }
  | CardView
  /** Every card answered; the summary opens when the last answer's undo window ends (or on request). */
  | { kind: 'wrappingUp'; progress: { index: number; total: number } };

/**
 * Binds the pure session state machine to persistence: every answer is written (log + state, atomically)
 * before the session advances; undo reverts the DB first, then restores the previous session state.
 */
export function useReviewSession(folderId: string | null, onlyCardIds: string[] | null) {
  const app = useAppData();
  const invalidate = useInvalidateAll();
  const [session, setSession] = useState<SessionState | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<LastAnswerInfo | null>(null);
  const [startedAt] = useState(() => app.clock.now());
  const shownAt = useRef(startedAt);
  const idsKey = onlyCardIds?.join(',') ?? '';

  useEffect(() => {
    let alive = true;
    const build = async () => {
      // 「まだを もう一度」 replays exactly the given cards, so the daily new-card limit does not apply.
      if (idsKey) return startSession(await app.reviews.queueFor(idsKey.split(',')), Infinity);
      const now = app.clock.now();
      const tz = app.timeZone();
      const items = await app.reviews.queue(folderId, dayEnd(now, tz));
      const introduced = await app.reviews.newIntroducedSince(dayStart(now, tz));
      return startSession(items, DEFAULT_NEW_LIMIT - introduced);
    };
    build().then(
      (s) => {
        if (!alive) return;
        setSession(s);
        shownAt.current = app.clock.now();
      },
      (e: unknown) => alive && setLoadError(e),
    );
    return () => {
      alive = false;
    };
  }, [app, folderId, idsKey, attempt]);

  const cardId = session ? currentCard(session) : undefined;
  const card = useCard(cardId);
  const answered = session?.answers.length ?? 0;
  const preview = useQuery({
    queryKey: keys.preview(cardId ?? '', answered),
    queryFn: () => app.reviews.preview(cardId!),
    enabled: !!cardId,
  });

  useEffect(() => {
    shownAt.current = app.clock.now();
  }, [cardId, app]);

  const masks = card.data?.masks ?? [];
  const orderedIds = masks.map((m) => m.id);
  const progress = { index: answered + 1, total: answered + (session?.queue.length ?? 0) };

  let view: ReviewView;
  if (loadError) {
    view = {
      kind: 'error',
      retry: () => {
        setLoadError(null);
        setAttempt((n) => n + 1);
      },
    };
  } else if (!session) view = { kind: 'loading' };
  else if (isFinished(session)) view = answered === 0 ? { kind: 'empty' } : { kind: 'wrappingUp', progress };
  else {
    view = {
      kind: 'card',
      cardId: cardId!,
      card: card.data ?? undefined,
      masks,
      orderedIds,
      revealed: new Set(session.revealed),
      preview: preview.data,
      progress,
    };
  }

  const answer = async (rating: Rating) => {
    if (!session || !cardId || busy) return;
    setBusy(true);
    try {
      const now = app.clock.now();
      const res = await app.reviews.answer({
        cardId,
        rating,
        revealedCount: session.revealed.filter((id) => orderedIds.includes(id)).length,
        maskCount: masks.length,
        durationMs: now - shownAt.current,
      });
      setSession(
        resumePending(applyAnswer(session, { cardId, rating, logId: res.logId }, res.next.dueAt), now),
      );
      setLast({ rating, next: res.next, at: now });
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    const prev = session ? lastAnswer(session) : undefined;
    if (!session || !prev || busy) return;
    setBusy(true);
    try {
      await app.reviews.undo(prev.logId);
      setSession(undoAnswer(session));
      setLast(null);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  /** Snapshot for the summary screen; reads the clock, so call it from an event, not during render. */
  const result = (folderName: string): SessionResult => {
    const stats = session ? sessionStats(session) : { total: 0, remembered: 0, again: [] };
    const now = app.clock.now();
    return {
      folderId,
      folderName,
      total: stats.total,
      remembered: stats.remembered,
      againIds: stats.again,
      startedAt,
      endedAt: now,
      pendingIn: session ? nextPendingIn(session, now) : null,
    };
  };

  return {
    view,
    busy,
    last,
    clearLast: () => setLast(null),
    result,
    answer,
    undo,
    toggle: (maskId: string) => session && setSession(toggleReveal(session, maskId)),
    revealNext: () => session && setSession(revealNext(session, orderedIds)[0]),
    revealAll: () => session && setSession(revealAll(session, orderedIds)),
  };
}
