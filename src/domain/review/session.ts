import type { Phase, Rating } from '../scheduler/types';

export const MAX_REQUEUE = 2;
export const REQUEUE_OFFSET = 3;
export const DEFAULT_NEW_LIMIT = 20;

export type QueueItem = { cardId: string; phase: Phase; dueAt: number };
export type Answer = { cardId: string; rating: Rating; logId: string };

type Core = {
  queue: string[];
  revealed: string[];
  requeueCount: Record<string, number>;
  pending: { cardId: string; dueAt: number }[];
  answers: Answer[];
};

export type SessionState = Core & { history: Core[] };

/** Reviews/relearning first (oldest due first), then new cards up to the daily limit. Frozen at start. */
export function startSession(items: readonly QueueItem[], newLimit: number): SessionState {
  const due = items.filter((i) => i.phase !== 'new').sort((a, b) => a.dueAt - b.dueAt);
  const fresh = items
    .filter((i) => i.phase === 'new')
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, Math.max(0, newLimit));
  return {
    queue: [...due, ...fresh].map((i) => i.cardId),
    revealed: [],
    requeueCount: {},
    pending: [],
    answers: [],
    history: [],
  };
}

export function currentCard(s: SessionState): string | undefined {
  return s.queue[0];
}

export function toggleReveal(s: SessionState, maskId: string): SessionState {
  const revealed = s.revealed.includes(maskId)
    ? s.revealed.filter((m) => m !== maskId)
    : [...s.revealed, maskId];
  return { ...s, revealed };
}

/** Opens the first unrevealed mask in ord order. Returns the opened id (or null) with the new state. */
export function revealNext(
  s: SessionState,
  orderedMaskIds: readonly string[],
): [SessionState, string | null] {
  const next = orderedMaskIds.find((id) => !s.revealed.includes(id));
  if (!next) return [s, null];
  return [{ ...s, revealed: [...s.revealed, next] }, next];
}

export function revealAll(s: SessionState, maskIds: readonly string[]): SessionState {
  return { ...s, revealed: Array.from(new Set([...s.revealed, ...maskIds])) };
}

function core(s: SessionState): Core {
  return {
    queue: s.queue,
    revealed: s.revealed,
    requeueCount: s.requeueCount,
    pending: s.pending,
    answers: s.answers,
  };
}

/**
 * Apply an already-persisted answer for the current card. まだ re-inserts the card at position
 * min(3, len) up to MAX_REQUEUE times per session; after that it waits in `pending` until its due time.
 */
export function applyAnswer(s: SessionState, answer: Answer, againDueAt: number): SessionState {
  const [cardId, ...rest] = s.queue;
  if (cardId === undefined || cardId !== answer.cardId) throw new Error('answer does not match current card');
  let queue = rest;
  let pending = s.pending;
  let requeueCount = s.requeueCount;
  if (answer.rating === 1) {
    const count = s.requeueCount[cardId] ?? 0;
    if (count < MAX_REQUEUE) {
      const pos = Math.min(REQUEUE_OFFSET, rest.length);
      queue = [...rest.slice(0, pos), cardId, ...rest.slice(pos)];
      requeueCount = { ...s.requeueCount, [cardId]: count + 1 };
    } else {
      pending = [...s.pending, { cardId, dueAt: againDueAt }];
    }
  }
  return {
    queue,
    pending,
    requeueCount,
    revealed: [],
    answers: [...s.answers, answer],
    history: [...s.history, core(s)],
  };
}

export function lastAnswer(s: SessionState): Answer | undefined {
  return s.answers[s.answers.length - 1];
}

/** Restores the exact state before the last answer (the caller reverts persistence first). */
export function undoAnswer(s: SessionState): SessionState {
  const prev = s.history[s.history.length - 1];
  if (!prev) return s;
  return { ...prev, history: s.history.slice(0, -1) };
}

/** When the queue is empty, pull pending cards whose due time has arrived. */
export function resumePending(s: SessionState, now: number): SessionState {
  if (s.queue.length > 0) return s;
  const ready = s.pending.filter((p) => p.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt);
  if (ready.length === 0) return s;
  return {
    ...s,
    queue: ready.map((p) => p.cardId),
    pending: s.pending.filter((p) => p.dueAt > now),
  };
}

export function isFinished(s: SessionState): boolean {
  return s.queue.length === 0;
}

/** Ms until the earliest pending card is due, or null when nothing is pending. */
export function nextPendingIn(s: SessionState, now: number): number | null {
  if (s.pending.length === 0) return null;
  return Math.max(0, Math.min(...s.pending.map((p) => p.dueAt)) - now);
}

export type SessionStats = { total: number; remembered: number; again: string[] };

/** Per-card outcome: the last rating of each card in this session counts. */
export function sessionStats(s: SessionState): SessionStats {
  const last = new Map<string, Rating>();
  for (const a of s.answers) last.set(a.cardId, a.rating);
  const again = [...last].filter(([, r]) => r === 1).map(([id]) => id);
  return { total: last.size, remembered: last.size - again.length, again };
}
