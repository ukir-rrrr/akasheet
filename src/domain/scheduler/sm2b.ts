import { addDays, dayStart } from './day';
import type { Rating, ReviewState, Scheduler, SchedulerContext } from './types';

export const SM2B = {
  ID: 'sm2b-v1',
  EF_INIT: 2.5,
  EF_MIN: 1.3,
  EF_PENALTY: 0.2,
  AGAIN_DELAY_MS: 10 * 60 * 1000,
  SECOND_INTERVAL: 6,
  MAX_INTERVAL: 3650,
  FUZZ: 0.05,
  FUZZ_MIN_INTERVAL: 3,
} as const;

/** round(n/d) half-up for non-negative integers, done in integer arithmetic. */
export function roundHalf(n: number, d: number): number {
  return Math.floor((n + Math.floor(d / 2)) / d);
}

/** Ease is stored with 2 decimals so repeated −0.20 never drifts (2.5 → 2.3 → 2.1 ...). */
function roundEase(e: number): number {
  return Math.round(e * 100) / 100;
}

export function fuzzInterval(interval: number, rng: (() => number) | undefined): number {
  if (!rng || interval < SM2B.FUZZ_MIN_INTERVAL) return interval;
  const r = (rng() * 2 - 1) * SM2B.FUZZ;
  return Math.min(SM2B.MAX_INTERVAL, Math.max(1, Math.round(interval * (1 + r))));
}

function again(s: ReviewState, ctx: SchedulerContext): ReviewState {
  const base = { ...s, dueAt: ctx.now + SM2B.AGAIN_DELAY_MS, lastReviewedAt: ctx.now };
  switch (s.phase) {
    case 'review':
      return { ...base, phase: 'relearning', lapses: s.lapses + 1, ease: Math.max(SM2B.EF_MIN, roundEase(s.ease - SM2B.EF_PENALTY)) };
    case 'relearning':
      return { ...base, phase: 'relearning' };
    case 'new':
    case 'learning':
      return { ...base, phase: 'learning' };
  }
}

function good(s: ReviewState, ctx: SchedulerContext): ReviewState {
  let interval: number;
  let reps: number;
  switch (s.phase) {
    case 'new':
    case 'learning':
      interval = 1;
      reps = 1;
      break;
    case 'relearning':
      interval = Math.max(1, roundHalf(s.intervalDays, 2));
      reps = s.intervalDays >= SM2B.SECOND_INTERVAL ? 2 : 1;
      break;
    case 'review':
      if (s.reps < 2) {
        interval = SM2B.SECOND_INTERVAL;
      } else {
        interval = Math.min(SM2B.MAX_INTERVAL, Math.max(s.intervalDays + 1, Math.round(s.intervalDays * s.ease)));
      }
      reps = s.reps + 1;
      break;
  }
  const fuzzed = fuzzInterval(interval, ctx.rng);
  return {
    ...s,
    phase: 'review',
    intervalDays: interval,
    reps,
    dueAt: addDays(dayStart(ctx.now, ctx.tz), fuzzed, ctx.tz),
    lastReviewedAt: ctx.now,
  };
}

export const sm2b: Scheduler = {
  id: SM2B.ID,
  initial: (now) => ({
    phase: 'new',
    dueAt: now,
    intervalDays: 0,
    ease: SM2B.EF_INIT,
    reps: 0,
    lapses: 0,
    lastReviewedAt: null,
  }),
  next: (s: ReviewState, r: Rating, ctx: SchedulerContext) => (r === 1 ? again(s, ctx) : good(s, ctx)),
};
