import { decodeGeometry, encodeGeometry, isValidGeometry } from '@/domain/mask/codec';
import { geometryBBox } from '@/domain/mask/geometry';
import { readingOrder } from '@/domain/mask/order';
import type { Mask, MaskDraw, MaskGeometry, Size } from '@/domain/mask/types';
import type { Phase } from '@/domain/scheduler/types';
import { ValidationError } from '@/shared/errors';

import type { SqlDriver } from '../db/driver';
import { chunk, SQLITE_IN_CHUNK } from '../db/sql';
import { assertSafeMediaKey, type NewMedia } from '../media/types';
import type { RepoContext } from './context';
import { upsertMedia } from './mediaRepo';
import { insertImportedState, insertInitialState, type ImportedReviewState } from './reviewRepo';

export type CardSource = 'camera' | 'library' | 'sample' | 'import:anki' | 'import:csv';

export type NewCard = {
  folderId: string;
  media: NewMedia;
  masks: MaskGeometry[];
  source: CardSource;
  title?: string | null;
  externalId?: string;
  importedReview?: ImportedReviewState;
};

export type CreateCardResult =
  | { cardId: string; mediaId: string; reusedMedia: boolean; created: true }
  | { cardId: string; created: false; reason: 'duplicate' };

export type CardMedia = { path: string; thumbPath: string; width: number; height: number };
export type CardListMedia = { thumbPath: string; width: number; height: number };

/** Folder card list row — no full-res path, review timestamps, or mask bboxes. */
export type CardSummary = {
  id: string;
  title: string | null;
  createdAt: number;
  phase: Phase;
  dueAt: number;
  media: CardListMedia;
  masks: MaskDraw[];
};

export type CardDetail = {
  id: string;
  folderId: string;
  title: string | null;
  createdAt: number;
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

type ListMaskRow = { id: string; card_id: string; ord: number; geometry: string };

async function decodeListMasks(
  rows: ListMaskRow[],
  openField: (s: string) => Promise<string>,
): Promise<MaskDraw[]> {
  const masks: MaskDraw[] = [];
  for (const r of rows) {
    const geometry = decodeGeometry(await openField(r.geometry));
    if (!geometry) {
      console.warn(`mask ${r.id} has invalid geometry and was skipped`);
      continue;
    }
    masks.push({ id: r.id, geometry });
  }
  return masks;
}

async function decodeMasks(
  rows: MaskRow[],
  openField: (s: string) => Promise<string>,
): Promise<{ masks: Mask[]; invalid: number }> {
  const masks: Mask[] = [];
  let invalid = 0;
  for (const r of rows) {
    const geometry = decodeGeometry(await openField(r.geometry));
    if (!geometry) {
      invalid++;
      console.warn(`mask ${r.id} has invalid geometry and was skipped`);
      continue;
    }
    masks.push({
      id: r.id,
      ord: r.ord,
      geometry,
      bbox: { x: r.bbox_x, y: r.bbox_y, w: r.bbox_w, h: r.bbox_h },
    });
  }
  return { masks, invalid };
}

async function insertMasks(
  tx: SqlDriver,
  ctx: RepoContext,
  cardId: string,
  geoms: MaskGeometry[],
  img: Size,
  now: number,
) {
  const boxes = geoms.map((g) => geometryBBox(g, img));
  const order = readingOrder(boxes);
  for (let ord = 0; ord < order.length; ord++) {
    const i = order[ord];
    const b = boxes[i];
    await tx.run(
      `INSERT INTO masks (id, card_id, ord, geometry, bbox_x, bbox_y, bbox_w, bbox_h, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ctx.newId(),
        cardId,
        ord,
        await ctx.fields.seal(encodeGeometry(geoms[i])),
        b.x,
        b.y,
        b.w,
        b.h,
        now,
        now,
      ],
    );
  }
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ');
}

function validateInput(input: NewCard) {
  if (input.masks.length === 0) throw new ValidationError(EMPTY_MASKS_MESSAGE);
  if (!input.masks.every(isValidGeometry)) throw new ValidationError('マスクの形が正しくありません');
  const { path, thumbPath, width, height } = input.media;
  // The iOS container path changes between installs, so only document-relative paths may be stored.
  if ([path, thumbPath].some((p) => p.length === 0 || /^([a-z]+:|\/)/i.test(p))) {
    throw new ValidationError('画像のパスは相対パスで保存します');
  }
  try {
    assertSafeMediaKey(path);
    assertSafeMediaKey(thumbPath);
  } catch {
    throw new ValidationError('画像のパスが不正です');
  }
  if (!(width > 0 && height > 0)) throw new ValidationError('画像の寸法が不正です');
}

export function createCardRepo(ctx: RepoContext) {
  const { db, clock } = ctx;

  async function liveFolder(tx: SqlDriver, folderId: string) {
    const f = await tx.get<{ id: string }>('SELECT id FROM folders WHERE id = ? AND deleted_at IS NULL', [
      folderId,
    ]);
    if (!f) throw new ValidationError('保存先のフォルダが見つかりません');
  }

  return {
    /** Saves media (reused by sha256) + card + masks + initial review state atomically. */
    async create(input: NewCard): Promise<CreateCardResult> {
      validateInput(input);
      const now = clock.now();
      return db.transaction(async (tx) => {
        if (input.externalId) {
          const dup = await tx.get<{ id: string }>(
            `SELECT id FROM cards WHERE source = ? AND external_id = ? AND deleted_at IS NULL`,
            [input.source, input.externalId],
          );
          if (dup) return { cardId: dup.id, created: false, reason: 'duplicate' };
        }
        await liveFolder(tx, input.folderId);
        const { mediaId, reused } = await upsertMedia(tx, ctx, input.media, now);
        const cardId = ctx.newId();
        await tx.run(
          `INSERT INTO cards (id, folder_id, media_id, title, source, external_id, created_device_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            cardId,
            input.folderId,
            mediaId,
            input.title != null ? await ctx.fields.seal(input.title) : null,
            input.source,
            input.externalId ?? null,
            ctx.deviceId,
            now,
            now,
          ],
        );
        await insertMasks(tx, ctx, cardId, input.masks, input.media, now);
        if (input.importedReview) {
          await insertImportedState(
            tx,
            ctx.scheduler,
            ctx,
            cardId,
            input.importedReview,
            input.masks.length,
            now,
          );
        } else {
          await insertInitialState(tx, ctx.scheduler, cardId, now);
        }
        return { cardId, mediaId, reusedMedia: reused, created: true };
      });
    },

    async listByFolder(folderId: string): Promise<CardSummary[]> {
      const rows = await db.all<{
        id: string;
        title: string | null;
        created_at: number;
        phase: Phase;
        due_at: number;
        thumb_path: string;
        width: number;
        height: number;
      }>(
        `SELECT c.id, c.title, c.created_at, rs.phase, rs.due_at,
                m.thumb_path, m.width, m.height
         FROM cards c
         JOIN review_states rs ON rs.card_id = c.id
         JOIN media m ON m.id = c.media_id
         WHERE c.folder_id = ? AND c.deleted_at IS NULL
         ORDER BY c.created_at DESC`,
        [folderId],
      );
      const maskRows = await db.all<ListMaskRow>(
        `SELECT mk.id, mk.card_id, mk.ord, mk.geometry
         FROM masks mk JOIN cards c ON c.id = mk.card_id
         WHERE c.folder_id = ? AND c.deleted_at IS NULL AND mk.deleted_at IS NULL
         ORDER BY mk.card_id, mk.ord`,
        [folderId],
      );
      const byCard = new Map<string, ListMaskRow[]>();
      for (const r of maskRows) byCard.set(r.card_id, [...(byCard.get(r.card_id) ?? []), r]);
      const summaries: CardSummary[] = [];
      for (const r of rows) {
        summaries.push({
          id: r.id,
          title: r.title != null ? await ctx.fields.open(r.title) : null,
          createdAt: r.created_at,
          phase: r.phase,
          dueAt: r.due_at,
          media: { thumbPath: r.thumb_path, width: r.width, height: r.height },
          masks: await decodeListMasks(byCard.get(r.id) ?? [], (s) => ctx.fields.open(s)),
        });
      }
      return summaries;
    },

    async get(cardId: string): Promise<CardDetail | null> {
      const r = await db.get<{
        id: string;
        folder_id: string;
        title: string | null;
        created_at: number;
        path: string;
        thumb_path: string;
        width: number;
        height: number;
      }>(
        `SELECT c.id, c.folder_id, c.title, c.created_at, m.path, m.thumb_path, m.width, m.height
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
      const { masks, invalid } = await decodeMasks(maskRows, (s) => ctx.fields.open(s));
      return {
        id: r.id,
        folderId: r.folder_id,
        title: r.title != null ? await ctx.fields.open(r.title) : null,
        createdAt: r.created_at,
        media: { path: r.path, thumbPath: r.thumb_path, width: r.width, height: r.height },
        masks,
        invalidMaskCount: invalid,
      };
    },

    async remove(cardIds: readonly string[]): Promise<void> {
      if (cardIds.length === 0) return;
      const now = clock.now();
      await db.transaction(async (tx) => {
        for (const part of chunk(cardIds, SQLITE_IN_CHUNK)) {
          const ids = placeholders(part);
          await tx.run(
            `UPDATE masks SET deleted_at = ?, updated_at = ? WHERE card_id IN (${ids}) AND deleted_at IS NULL`,
            [now, now, ...part],
          );
          await tx.run(
            `UPDATE cards SET deleted_at = ?, updated_at = ? WHERE id IN (${ids}) AND deleted_at IS NULL`,
            [now, now, ...part],
          );
        }
      });
    },

    async move(cardIds: readonly string[], folderId: string): Promise<void> {
      if (cardIds.length === 0) return;
      const now = clock.now();
      await db.transaction(async (tx) => {
        await liveFolder(tx, folderId);
        for (const part of chunk(cardIds, SQLITE_IN_CHUNK)) {
          await tx.run(
            `UPDATE cards SET folder_id = ?, updated_at = ? WHERE id IN (${placeholders(part)}) AND deleted_at IS NULL`,
            [folderId, now, ...part],
          );
        }
      });
    },
  };
}
export type CardRepo = ReturnType<typeof createCardRepo>;
