export type Phase = 'new' | 'learning' | 'review' | 'relearning';
/** 1 = まだ (Again), 3 = 覚えた (Good). */
export type Rating = 1 | 3;

export type ReviewState = {
  phase: Phase;
  dueAt: number;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  lastReviewedAt: number | null;
};

export type SchedulerContext = {
  now: number;
  tz: string;
  /** Uniform [0,1) source for interval fuzz. Omit to disable fuzz. */
  rng?: () => number;
};

export interface Scheduler {
  readonly id: string;
  initial(now: number): ReviewState;
  next(s: ReviewState, r: Rating, ctx: SchedulerContext): ReviewState;
}
