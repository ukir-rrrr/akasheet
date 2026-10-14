import type { ImportedReviewSnapshot } from './types';
import type { Phase } from '@/domain/scheduler/types';

export type AnkiCardSchedule = {
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
};

const DAY_MS = 86_400_000;

function phaseFromQueue(queue: number, ivl: number): Phase {
  if (queue === 1 || queue === 3) return 'learning';
  if (queue === 0) return 'new';
  if (ivl > 0) return 'review';
  return 'new';
}

/** Maps Anki card scheduling into akasheet review state (collection `crt` is seconds). */
export function mapAnkiSchedule(
  card: AnkiCardSchedule,
  colCrtSec: number,
): ImportedReviewSnapshot | undefined {
  if (card.reps <= 0) return undefined;
  if (card.queue < 0) return undefined;
  const crtMs = colCrtSec * 1000;
  const phase = phaseFromQueue(card.queue, card.ivl);
  let dueAt = crtMs;
  if (card.queue === 2) {
    dueAt = crtMs + card.due * DAY_MS;
  } else if (card.queue === 1 || card.queue === 3) {
    dueAt = crtMs + card.due * 60_000;
  } else {
    dueAt = crtMs;
  }
  const ease = Math.max(1.3, card.factor / 1000);
  const lastReviewedAt =
    card.ivl > 0 && card.queue === 2 ? dueAt - card.ivl * DAY_MS : card.reps > 0 ? dueAt - DAY_MS : null;
  return {
    phase,
    dueAt,
    intervalDays: Math.max(0, card.ivl),
    ease,
    reps: card.reps,
    lapses: card.lapses,
    lastReviewedAt,
  };
}
