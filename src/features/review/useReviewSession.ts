import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

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
  type QueueItem,
  type SessionState,
} from '@/domain/review/session';
import { dayEnd, dayStart } from '@/domain/scheduler/day';
import type { Rating, ReviewState } from '@/domain/scheduler/types';
import { useAppData } from '@/features/app/AppDataProvider';
import { useCard, useInvalidateAll } from '@/features/app/queries';

export type LastAnswerInfo = { rating: Rating; next: ReviewState; at: number };

/**
 * Binds the pure session state machine to persistence: every answer is written (log + state, atomically)
 * before the session advances; undo reverts the DB first, then restores the previous session state.
 */
export function useReviewSession(folderId: string | null, onlyCardIds: string[] | null) {
  const app = useAppData();
  const invalidate = useInvalidateAll();
  const [session, setSession] = useState<SessionState | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<LastAnswerInfo | null>(null);
  const [startedAt] = useState(() => app.ctx.clock.now());
  const shownAt = useRef(app.ctx.clock.now());
  const idsKey = onlyCardIds?.join(',') ?? '';

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    const build = async () => {
      const now = app.ctx.clock.now();
      const tz = app.ctx.timeZone();
      if (idsKey) {
        const items: QueueItem[] = [];
        for (const cardId of idsKey.split(',')) {
          const s = await app.reviews.state(cardId).catch(() => null);
          if (s) items.push({ cardId, phase: s.phase === 'new' ? 'learning' : s.phase, dueAt: s.dueAt });
        }
        return startSession(items, DEFAULT_NEW_LIMIT);
      }
      const items = await app.reviews.queue(folderId, dayEnd(now, tz));
      const introduced = await app.reviews.newIntroducedSince(dayStart(now, tz));
      return startSession(items, Math.max(0, DEFAULT_NEW_LIMIT - introduced));
    };
    build().then(
      (s) => {
        if (!alive) return;
        setSession(s);
        shownAt.current = app.ctx.clock.now();
      },
      (e: unknown) => alive && setLoadError(e),
    );
    return () => {
      alive = false;
    };
  }, [app, folderId, idsKey, attempt]);

  const load = () => {
    setLoadError(null);
    setAttempt((n) => n + 1);
  };

  const cardId = session ? currentCard(session) : undefined;
  const card = useCard(cardId);
  const preview = useQuery({
    queryKey: ['preview', cardId ?? '', session?.answers.length ?? 0],
    queryFn: () => app.reviews.preview(cardId!),
    enabled: !!cardId,
  });

  useEffect(() => {
    shownAt.current = app.ctx.clock.now();
  }, [cardId, app]);

  const masks = card.data?.masks ?? [];
  const orderedIds = masks.map((m) => m.id);
  const revealed = new Set(session?.revealed ?? []);

  const answer = async (rating: Rating) => {
    if (!session || !cardId || busy) return;
    setBusy(true);
    try {
      const now = app.ctx.clock.now();
      const res = await app.reviews.answer({
        cardId,
        rating,
        revealedCount: session.revealed.filter((id) => orderedIds.includes(id)).length,
        maskCount: masks.length,
        durationMs: now - shownAt.current,
      });
      const next = resumePending(
        applyAnswer(session, { cardId, rating, logId: res.logId }, res.next.dueAt),
        now,
      );
      setSession(next);
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

  const stats = session ? sessionStats(session) : { total: 0, remembered: 0, again: [] };
  const finished = !!session && isFinished(session);

  return {
    session,
    loadError,
    reload: load,
    card,
    preview: preview.data,
    cardId,
    masks,
    orderedIds,
    revealed,
    busy,
    last,
    clearLast: () => setLast(null),
    startedAt,
    stats,
    finished,
    pendingIn: session ? nextPendingIn(session, app.ctx.clock.now()) : null,
    progress: session
      ? { index: session.answers.length + 1, total: session.answers.length + session.queue.length }
      : null,
    toggle: (maskId: string) => session && setSession(toggleReveal(session, maskId)),
    revealNext: () => {
      if (!session) return null;
      const [s, id] = revealNext(session, orderedIds);
      setSession(s);
      return id;
    },
    revealAll: () => session && setSession(revealAll(session, orderedIds)),
    answer,
    undo,
  };
}
