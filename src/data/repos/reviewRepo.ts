import type { QueueItem } from '@/domain/review/session';
import { reviewRng } from '@/domain/scheduler/rng';
import { sm2b } from '@/domain/scheduler/sm2b';
import type { Phase, Rating, ReviewState, Scheduler } from '@/domain/scheduler/types';
import { ValidationError } from '@/shared/errors';

import type { SqlDriver } from '../db/driver';
import type { RepoContext } from './context';

type StateRow = {
  phase: Phase;
  due_at: number;
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
  last_reviewed_at: number | null;
};

const STATE_COLS = 'phase, due_at, interval_days, ease, reps, lapses, last_reviewed_at';

function toState(r: StateRow): ReviewState {
  return {
    phase: r.phase,
    dueAt: r.due_at,
    intervalDays: r.interval_days,
    ease: r.ease,
    reps: r.reps,
    lapses: r.lapses,
    lastReviewedAt: r.last_reviewed_at,
  };
}

export type AnswerInput = {
  cardId: string;
  rating: Rating;
  revealedCount: number;
  maskCount: number;
  durationMs: number | null;
};

export type AnswerResult = { logId: string; prev: ReviewState; next: ReviewState };

export function createReviewRepo(ctx: RepoContext, scheduler: Scheduler = sm2b) {
  const { db, clock } = ctx;

  async function readState(tx: SqlDriver, cardId: string): Promise<ReviewState> {
    const r = await tx.get<StateRow>(`SELECT ${STATE_COLS} FROM review_states WHERE card_id = ?`, [cardId]);
    if (!r) throw new ValidationError('カードの復習状態が見つかりません');
    return toState(r);
  }

  return {
    /** Due cards (due_at < dayEnd) in live cards, reviews first; `folderId` null means all folders. */
    async queue(folderId: string | null, dayEnd: number): Promise<QueueItem[]> {
      const rows = await db.all<{ id: string; phase: Phase; due_at: number }>(
        `SELECT c.id, rs.phase, rs.due_at
         FROM cards c JOIN review_states rs ON rs.card_id = c.id
         JOIN folders f ON f.id = c.folder_id AND f.deleted_at IS NULL
         WHERE c.deleted_at IS NULL AND rs.due_at < ?
           AND (? IS NULL OR c.folder_id = ?)
         ORDER BY (rs.phase = 'new'), rs.due_at`,
        [dayEnd, folderId, folderId],
      );
      return rows.map((r) => ({ cardId: r.id, phase: r.phase, dueAt: r.due_at }));
    },

    /** New cards already introduced today (for the daily new-card limit). */
    async newIntroducedSince(dayStart: number): Promise<number> {
      const r = await db.get<{ n: number }>(
        `SELECT COUNT(DISTINCT card_id) AS n FROM review_logs
         WHERE prev_phase = 'new' AND undone_at IS NULL AND reviewed_at >= ?`,
        [dayStart],
      );
      return r?.n ?? 0;
    },

    /** Earliest due time at or after `from` among live cards (for 「次は◯月◯日」). */
    async nextDueFrom(folderId: string | null, from: number): Promise<number | null> {
      const r = await db.get<{ t: number | null }>(
        `SELECT MIN(rs.due_at) AS t FROM review_states rs
         JOIN cards c ON c.id = rs.card_id AND c.deleted_at IS NULL
         JOIN folders f ON f.id = c.folder_id AND f.deleted_at IS NULL
         WHERE rs.due_at >= ? AND (? IS NULL OR c.folder_id = ?)`,
        [from, folderId, folderId],
      );
      return r?.t ?? null;
    },

    async state(cardId: string): Promise<ReviewState> {
      return readState(db, cardId);
    },

    /** Preview of the next state for each rating (for button captions). */
    async preview(cardId: string): Promise<Record<Rating, ReviewState>> {
      const s = await readState(db, cardId);
      const now = clock.now();
      const c = { now, tz: ctx.timeZone(), rng: reviewRng(cardId, now) };
      return { 1: scheduler.next(s, 1, c), 3: scheduler.next(s, 3, { ...c, rng: reviewRng(cardId, now) }) };
    },

    /** Appends a log row and updates review_states atomically. */
    async answer(input: AnswerInput): Promise<AnswerResult> {
      const now = clock.now();
      const tz = ctx.timeZone();
      const logId = ctx.newId();
      return db.transaction(async (tx) => {
        const prev = await readState(tx, input.cardId);
        const next = scheduler.next(prev, input.rating, { now, tz, rng: reviewRng(input.cardId, now) });
        await tx.run(
          `INSERT INTO review_logs (id, card_id, reviewed_at, time_zone, rating, algorithm, duration_ms, revealed_count, mask_count,
             prev_phase, prev_interval, prev_ease, prev_reps, prev_lapses, prev_due_at,
             new_phase, new_interval, new_ease, new_reps, new_lapses, new_due_at, device_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            logId,
            input.cardId,
            now,
            tz,
            input.rating,
            scheduler.id,
            input.durationMs,
            input.revealedCount,
            input.maskCount,
            prev.phase,
            prev.intervalDays,
            prev.ease,
            prev.reps,
            prev.lapses,
            prev.dueAt,
            next.phase,
            next.intervalDays,
            next.ease,
            next.reps,
            next.lapses,
            next.dueAt,
            ctx.deviceId,
          ],
        );
        await tx.run(
          `UPDATE review_states SET algorithm = ?, phase = ?, due_at = ?, interval_days = ?, ease = ?, reps = ?, lapses = ?,
             last_reviewed_at = ?, updated_at = ? WHERE card_id = ?`,
          [scheduler.id, next.phase, next.dueAt, next.intervalDays, next.ease, next.reps, next.lapses, now, now, input.cardId],
        );
        return { logId, prev, next };
      });
    },

    /** Marks the card's latest log as undone and restores the previous state. */
    async undo(logId: string): Promise<void> {
      const now = clock.now();
      await db.transaction(async (tx) => {
        const log = await tx.get<{
          card_id: string;
          reviewed_at: number;
          prev_phase: Phase;
          prev_interval: number;
          prev_ease: number;
          prev_reps: number;
          prev_lapses: number;
          prev_due_at: number;
        }>(
          `SELECT card_id, reviewed_at, prev_phase, prev_interval, prev_ease, prev_reps, prev_lapses, prev_due_at
           FROM review_logs WHERE id = ? AND undone_at IS NULL`,
          [logId],
        );
        if (!log) throw new ValidationError('取り消せる回答がありません');
        const newer = await tx.get<{ id: string }>(
          `SELECT id FROM review_logs WHERE card_id = ? AND undone_at IS NULL AND id != ?
             AND (reviewed_at > ? OR (reviewed_at = ? AND id > ?)) LIMIT 1`,
          [log.card_id, logId, log.reviewed_at, log.reviewed_at, logId],
        );
        if (newer) throw new ValidationError('最新の回答だけ取り消せます');
        const before = await tx.get<{ t: number | null }>(
          'SELECT MAX(reviewed_at) AS t FROM review_logs WHERE card_id = ? AND undone_at IS NULL AND id != ?',
          [log.card_id, logId],
        );
        await tx.run('UPDATE review_logs SET undone_at = ? WHERE id = ?', [now, logId]);
        await tx.run(
          `UPDATE review_states SET phase = ?, due_at = ?, interval_days = ?, ease = ?, reps = ?, lapses = ?,
             last_reviewed_at = ?, updated_at = ? WHERE card_id = ?`,
          [
            log.prev_phase,
            log.prev_due_at,
            log.prev_interval,
            log.prev_ease,
            log.prev_reps,
            log.prev_lapses,
            before?.t ?? null,
            now,
            log.card_id,
          ],
        );
      });
    },

    /** Rebuilds a card's state by replaying non-undone logs with their recorded time zones. */
    async replay(cardId: string): Promise<ReviewState> {
      const card = await db.get<{ created_at: number }>('SELECT created_at FROM cards WHERE id = ?', [cardId]);
      if (!card) throw new ValidationError('カードが見つかりません');
      const logs = await db.all<{ reviewed_at: number; time_zone: string; rating: Rating }>(
        'SELECT reviewed_at, time_zone, rating FROM review_logs WHERE card_id = ? AND undone_at IS NULL ORDER BY reviewed_at, id',
        [cardId],
      );
      let s = scheduler.initial(card.created_at);
      for (const l of logs) {
        s = scheduler.next(s, l.rating, { now: l.reviewed_at, tz: l.time_zone, rng: reviewRng(cardId, l.reviewed_at) });
      }
      return s;
    },
  };
}

export type ReviewRepo = ReturnType<typeof createReviewRepo>;
