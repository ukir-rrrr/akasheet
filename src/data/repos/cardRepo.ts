import { decodeGeometry, encodeGeometry, isValidGeometry } from '@/domain/mask/codec';
import { geometryBBox } from '@/domain/mask/geometry';
import { readingOrder } from '@/domain/mask/order';
import type { Mask, MaskGeometry, Size } from '@/domain/mask/types';
import type { Phase } from '@/domain/scheduler/types';
import { sm2b } from '@/domain/scheduler/sm2b';
import { ValidationError } from '@/shared/errors';

import type { SqlDriver } from '../db/driver';
import type { RepoContext } from './context';

export type CardSource = 'camera' | 'library' | 'sample' | 'import:anki' | 'import:csv';

export type NewMedia = {
  sha256: string;
  path: string;
  thumbPath: string;
  mime: string;
  width: number;
  height: number;
  byteSize: number;
};

export type NewCard = {
  folderId: string;
  media: NewMedia;
  masks: MaskGeometry[];
  source: CardSource;
  title?: string | null;
};

export type CardMedia = { path: string; thumbPath: string; width: number; height: number };

export type CardSummary = {
  id: string;
  title: string | null;
  createdAt: number;
  phase: Phase;
  dueAt: number;
  lastReviewedAt: number | null;
  media: CardMedia;
  masks: Mask[];
};

export type CardDetail = {
  id: string;
  folderId: string;
  title: string | null;
  media: CardMedia;
  masks: Mask[];
  /** Masks dropped because their stored geometry failed validation. */
  invalidMaskCount: number;
};

export const EMPTY_MASKS_MESSAGE = '隠したいところを指でなぞってください';

type MaskRow = {
  id: string;
  card_id: string;
  ord: number;
  geometry: string;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
};

function decodeMasks(rows: MaskRow[]): { masks: Mask[]; invalid: number } {
  const masks: Mask[] = [];
  let invalid = 0;
  for (const r of rows) {
    const geometry = decodeGeometry(r.geometry);
    if (!geometry) {
      invalid++;
      console.warn(`mask ${r.id} has invalid geometry and was skipped`);
      continue;
    }
    masks.push({ id: r.id, ord: r.ord, geometry, bbox: { x: r.bbox_x, y: r.bbox_y, w: r.bbox_w, h: r.bbox_h } });
  }
  return { masks, invalid };
}

async function insertMasks(tx: SqlDriver, ctx: RepoContext, cardId: string, geoms: MaskGeometry[], img: Size, now: number) {
  const boxes = geoms.map((g) => geometryBBox(g, img));
  const order = readingOrder(boxes);
  for (let ord = 0; ord < order.length; ord++) {
    const i = order[ord];
    const b = boxes[i];
    await tx.run(
      `INSERT INTO masks (id, card_id, ord, geometry, bbox_x, bbox_y, bbox_w, bbox_h, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ctx.newId(), cardId, ord, encodeGeometry(geoms[i]), b.x, b.y, b.w, b.h, now, now],
    );
  }
}

function validateInput(input: NewCard) {
  if (input.masks.length === 0) throw new ValidationError(EMPTY_MASKS_MESSAGE);
  if (!input.masks.every(isValidGeometry)) throw new ValidationError('マスクの形が正しくありません');
  const { path, thumbPath, width, height } = input.media;
  // The iOS container path changes between installs, so only document-relative paths may be stored.
  if ([path, thumbPath].some((p) => p.length === 0 || /^([a-z]+:|\/)/i.test(p))) {
    throw new ValidationError('画像のパスは相対パスで保存します');
  }
  if (!(width > 0 && height > 0)) throw new ValidationError('画像の寸法が不正です');
}

export function createCardRepo(ctx: RepoContext) {
  const { db, clock } = ctx;

  async function liveFolder(tx: SqlDriver, folderId: string) {
    const f = await tx.get<{ id: string }>('SELECT id FROM folders WHERE id = ? AND deleted_at IS NULL', [folderId]);
    if (!f) throw new ValidationError('保存先のフォルダが見つかりません');
  }

  return {
    /** Saves media (reused by sha256) + card + masks + initial review state atomically. */
    async create(input: NewCard): Promise<{ cardId: string; mediaId: string; reusedMedia: boolean }> {
      validateInput(input);
      const now = clock.now();
      return db.transaction(async (tx) => {
        await liveFolder(tx, input.folderId);
        const existing = await tx.get<{ id: string }>('SELECT id FROM media WHERE sha256 = ?', [input.media.sha256]);
        const mediaId = existing?.id ?? ctx.newId();
        if (existing) {
          await tx.run('UPDATE media SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL', [
            now,
            mediaId,
          ]);
        } else {
          const m = input.media;
          await tx.run(
            `INSERT INTO media (id, path, thumb_path, sha256, mime, width, height, byte_size, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [mediaId, m.path, m.thumbPath, m.sha256, m.mime, m.width, m.height, m.byteSize, now, now],
          );
        }
        const media = await tx.get<{ width: number; height: number }>('SELECT width, height FROM media WHERE id = ?', [mediaId]);
        const cardId = ctx.newId();
        await tx.run(
          `INSERT INTO cards (id, folder_id, media_id, title, source, created_device_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [cardId, input.folderId, mediaId, input.title ?? null, input.source, ctx.deviceId, now, now],
        );
        await insertMasks(tx, ctx, cardId, input.masks, { width: media!.width, height: media!.height }, now);
        const s = sm2b.initial(now);
        await tx.run(
          `INSERT INTO review_states (card_id, algorithm, phase, due_at, interval_days, ease, reps, lapses, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [cardId, sm2b.id, s.phase, s.dueAt, s.intervalDays, s.ease, s.reps, s.lapses, now],
        );
        return { cardId, mediaId, reusedMedia: !!existing };
      });
    },

    async listByFolder(folderId: string): Promise<CardSummary[]> {
      const rows = await db.all<{
        id: string;
        title: string | null;
        created_at: number;
        phase: Phase;
        due_at: number;
        last_reviewed_at: number | null;
        path: string;
        thumb_path: string;
        width: number;
        height: number;
      }>(
        `SELECT c.id, c.title, c.created_at, rs.phase, rs.due_at, rs.last_reviewed_at,
                m.path, m.thumb_path, m.width, m.height
         FROM cards c
         JOIN review_states rs ON rs.card_id = c.id
         JOIN media m ON m.id = c.media_id
         WHERE c.folder_id = ? AND c.deleted_at IS NULL
         ORDER BY c.created_at DESC`,
        [folderId],
      );
      const maskRows = await db.all<MaskRow>(
        `SELECT mk.id, mk.card_id, mk.ord, mk.geometry, mk.bbox_x, mk.bbox_y, mk.bbox_w, mk.bbox_h
         FROM masks mk JOIN cards c ON c.id = mk.card_id
         WHERE c.folder_id = ? AND c.deleted_at IS NULL AND mk.deleted_at IS NULL
         ORDER BY mk.card_id, mk.ord`,
        [folderId],
      );
      const byCard = new Map<string, MaskRow[]>();
      for (const r of maskRows) byCard.set(r.card_id, [...(byCard.get(r.card_id) ?? []), r]);
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        createdAt: r.created_at,
        phase: r.phase,
        dueAt: r.due_at,
        lastReviewedAt: r.last_reviewed_at,
        media: { path: r.path, thumbPath: r.thumb_path, width: r.width, height: r.height },
        masks: decodeMasks(byCard.get(r.id) ?? []).masks,
      }));
    },

    async get(cardId: string): Promise<CardDetail | null> {
      const r = await db.get<{
        id: string;
        folder_id: string;
        title: string | null;
        path: string;
        thumb_path: string;
        width: number;
        height: number;
      }>(
        `SELECT c.id, c.folder_id, c.title, m.path, m.thumb_path, m.width, m.height
         FROM cards c JOIN media m ON m.id = c.media_id
         WHERE c.id = ? AND c.deleted_at IS NULL`,
        [cardId],
      );
      if (!r) return null;
      const maskRows = await db.all<MaskRow>(
        `SELECT id, card_id, ord, geometry, bbox_x, bbox_y, bbox_w, bbox_h
         FROM masks WHERE card_id = ? AND deleted_at IS NULL ORDER BY ord`,
        [cardId],
      );
      const { masks, invalid } = decodeMasks(maskRows);
      return {
        id: r.id,
        folderId: r.folder_id,
        title: r.title,
        media: { path: r.path, thumbPath: r.thumb_path, width: r.width, height: r.height },
        masks,
        invalidMaskCount: invalid,
      };
    },

    async remove(cardIds: readonly string[]): Promise<void> {
      const now = clock.now();
      await db.transaction(async (tx) => {
        for (const id of cardIds) {
          await tx.run('UPDATE masks SET deleted_at = ?, updated_at = ? WHERE card_id = ? AND deleted_at IS NULL', [now, now, id]);
          await tx.run('UPDATE cards SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [now, now, id]);
        }
      });
    },

    async move(cardIds: readonly string[], folderId: string): Promise<void> {
      const now = clock.now();
      await db.transaction(async (tx) => {
        await liveFolder(tx, folderId);
        for (const id of cardIds) {
          await tx.run('UPDATE cards SET folder_id = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [folderId, now, id]);
        }
      });
    },

    /** Media rows whose cards are all gone (or deleted before `cutoff`): safe to delete files for. */
    async unreferencedMedia(cutoff: number): Promise<{ id: string; path: string; thumbPath: string }[]> {
      const rows = await db.all<{ id: string; path: string; thumb_path: string }>(
        `SELECT m.id, m.path, m.thumb_path FROM media m
         WHERE m.deleted_at IS NULL AND NOT EXISTS (
           SELECT 1 FROM cards c WHERE c.media_id = m.id AND (c.deleted_at IS NULL OR c.deleted_at > ?))`,
        [cutoff],
      );
      return rows.map((r) => ({ id: r.id, path: r.path, thumbPath: r.thumb_path }));
    },

    async markMediaPurged(mediaId: string): Promise<void> {
      const now = clock.now();
      await db.run('UPDATE media SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, mediaId]);
    },

    async livePaths(): Promise<Set<string>> {
      const rows = await db.all<{ path: string; thumb_path: string }>('SELECT path, thumb_path FROM media WHERE deleted_at IS NULL');
      return new Set(rows.flatMap((r) => [r.path, r.thumb_path]));
    },
  };
}

export type CardRepo = ReturnType<typeof createCardRepo>;
