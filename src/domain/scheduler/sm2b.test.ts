import fc from 'fast-check';

import golden from './__fixtures__/golden.json';
import { addDays, dayEnd, dayStart, studyDaysBetween, wallClock, zonedTimeToUtc } from './day';
import { hashString, mulberry32, reviewRng } from './rng';
import { fuzzInterval, roundHalf, SM2B, sm2b } from './sm2b';
import type { Phase, Rating, ReviewState } from './types';

const t = (iso: string) => Date.parse(iso);

type Expect = Partial<Record<keyof ReviewState, string | number>>;
type Vector = {
  id: string;
  tz: string;
  start?: { phase: string; intervalDays: number; ease: number; reps: number; lapses: number; dueAt: string };
  steps: { at: string; rating: number; expect: Expect }[];
};

describe('sm2b golden vectors (DESIGN §6.5)', () => {
  it.each((golden.vectors as Vector[]).map((v) => [v.id, v] as const))('%s', (_id, v) => {
    let s: ReviewState = v.start
      ? { ...v.start, phase: v.start.phase as Phase, dueAt: t(v.start.dueAt), lastReviewedAt: null }
      : sm2b.initial(t(v.steps[0].at));
    for (const step of v.steps) {
      s = sm2b.next(s, step.rating as Rating, { now: t(step.at), tz: v.tz });
      for (const [key, value] of Object.entries(step.expect)) {
        const actual = s[key as keyof ReviewState];
        if (key === 'dueAt')
          expect(new Date(actual as number).toISOString()).toBe(new Date(t(value as string)).toISOString());
        else if (key === 'ease') expect(actual).toBeCloseTo(value as number, 10);
        else expect(actual).toBe(value);
      }
    }
  });
});

describe('sm2b behavior', () => {
  const tz = 'Asia/Tokyo';
  const now = t('2026-10-11T13:00:00+09:00');

  it('creates a new state due immediately', () => {
    expect(sm2b.initial(now)).toEqual({
      phase: 'new',
      dueAt: now,
      intervalDays: 0,
      ease: 2.5,
      reps: 0,
      lapses: 0,
      lastReviewedAt: null,
    });
    expect(sm2b.id).toBe('sm2b-v1');
  });

  it('keeps interval and reps on まだ and records lastReviewedAt', () => {
    const s: ReviewState = {
      phase: 'review',
      dueAt: now,
      intervalDays: 20,
      ease: 2.5,
      reps: 4,
      lapses: 0,
      lastReviewedAt: null,
    };
    const n = sm2b.next(s, 1, { now, tz });
    expect(n.intervalDays).toBe(20);
    expect(n.reps).toBe(4);
    expect(n.lastReviewedAt).toBe(now);
  });

  it('does not touch ease/lapses on repeated relearning まだ', () => {
    const s: ReviewState = {
      phase: 'relearning',
      dueAt: now,
      intervalDays: 20,
      ease: 2.1,
      reps: 4,
      lapses: 2,
      lastReviewedAt: null,
    };
    const n = sm2b.next(s, 1, { now, tz });
    expect(n).toMatchObject({ phase: 'relearning', ease: 2.1, lapses: 2 });
  });

  it('relearning with interval ≥ 6 resumes at reps 2', () => {
    const s: ReviewState = {
      phase: 'relearning',
      dueAt: now,
      intervalDays: 6,
      ease: 2.3,
      reps: 5,
      lapses: 1,
      lastReviewedAt: null,
    };
    expect(sm2b.next(s, 3, { now, tz })).toMatchObject({ intervalDays: 3, reps: 2 });
  });

  it('roundHalf rounds half up in integer arithmetic', () => {
    expect(roundHalf(15, 2)).toBe(8);
    expect(roundHalf(5, 2)).toBe(3);
    expect(roundHalf(4, 2)).toBe(2);
    expect(roundHalf(1, 2)).toBe(1);
  });

  it('invariants hold for arbitrary rating sequences', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<Rating>(1, 3), { minLength: 1, maxLength: 60 }),
        fc.integer({ min: 0, max: 2 ** 31 }),
        (ratings, seed) => {
          let s = sm2b.initial(now);
          let clock = now;
          const rng = mulberry32(seed);
          for (const r of ratings) {
            const prev = s;
            s = sm2b.next(s, r, { now: clock, tz, rng });
            expect(s.ease).toBeGreaterThanOrEqual(SM2B.EF_MIN);
            expect(s.intervalDays).toBeLessThanOrEqual(SM2B.MAX_INTERVAL);
            expect(s.dueAt).toBeGreaterThan(clock);
            if (r === 1) {
              expect(s.intervalDays).toBe(prev.intervalDays);
              if (prev.phase !== 'review') expect(s.lapses).toBe(prev.lapses);
            }
            clock = Math.max(clock + 1, s.dueAt);
          }
        },
      ),
    );
  });
});

describe('fuzz', () => {
  it('is skipped below 3 days or without rng', () => {
    expect(fuzzInterval(2, () => 0)).toBe(2);
    expect(fuzzInterval(100, undefined)).toBe(100);
  });

  it('stays within ±5% and is deterministic per card+time', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 3650 }),
        fc.double({ min: 0, max: 0.999999, noNaN: true }),
        (i, r) => {
          const f = fuzzInterval(i, () => r);
          expect(f).toBeGreaterThanOrEqual(Math.round(i * 0.95));
          expect(f).toBeLessThanOrEqual(Math.min(3650, Math.round(i * 1.05)));
        },
      ),
    );
    expect(reviewRng('a', 1)()).toBe(reviewRng('a', 1)());
    expect(reviewRng('a', 1)()).not.toBe(reviewRng('a', 2)());
  });

  it('stores the unfuzzed interval', () => {
    const tz = 'Asia/Tokyo';
    const now = t('2026-10-11T13:00:00+09:00');
    const s: ReviewState = {
      phase: 'review',
      dueAt: now,
      intervalDays: 100,
      ease: 2.5,
      reps: 5,
      lapses: 0,
      lastReviewedAt: null,
    };
    const n = sm2b.next(s, 3, { now, tz, rng: () => 0.999 });
    expect(n.intervalDays).toBe(250);
    expect(studyDaysBetween(now, n.dueAt, tz)).toBe(262);
  });

  it('hash and prng produce values in range', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    const r = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('day boundaries', () => {
  it('treats 03:59 as the previous study day and 04:00 as the new one (Tokyo)', () => {
    const tz = 'Asia/Tokyo';
    expect(dayStart(t('2026-10-11T03:59:59+09:00'), tz)).toBe(t('2026-10-10T04:00:00+09:00'));
    expect(dayStart(t('2026-10-11T04:00:00+09:00'), tz)).toBe(t('2026-10-11T04:00:00+09:00'));
    expect(dayEnd(t('2026-10-11T23:00:00+09:00'), tz)).toBe(t('2026-10-12T04:00:00+09:00'));
  });

  it('adds calendar days across DST in both directions (New York)', () => {
    const tz = 'America/New_York';
    const beforeSpring = t('2026-03-07T04:00:00-05:00');
    expect(addDays(beforeSpring, 1, tz)).toBe(t('2026-03-08T04:00:00-04:00'));
    const beforeFall = t('2026-10-31T04:00:00-04:00');
    expect(addDays(beforeFall, 1, tz)).toBe(t('2026-11-01T04:00:00-05:00'));
    expect(addDays(beforeFall, 2, tz)).toBe(t('2026-11-02T04:00:00-05:00'));
  });

  it('crosses month and year ends', () => {
    const tz = 'Asia/Tokyo';
    expect(addDays(t('2026-12-31T04:00:00+09:00'), 1, tz)).toBe(t('2027-01-01T04:00:00+09:00'));
    expect(zonedTimeToUtc(2026, 2, 29, 4, tz)).toBe(t('2026-03-01T04:00:00+09:00'));
  });

  it('reads wall clock in UTC', () => {
    expect(wallClock(t('2026-10-11T00:00:00Z'), 'UTC')).toEqual({
      y: 2026,
      m: 10,
      d: 11,
      h: 0,
      min: 0,
      s: 0,
    });
  });

  it('counts study days', () => {
    const tz = 'Asia/Tokyo';
    expect(studyDaysBetween(t('2026-10-11T13:00:00+09:00'), t('2026-10-12T03:00:00+09:00'), tz)).toBe(0);
    expect(studyDaysBetween(t('2026-10-11T13:00:00+09:00'), t('2026-10-12T04:00:00+09:00'), tz)).toBe(1);
  });
});
