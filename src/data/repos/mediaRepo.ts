import type { SqlDriver } from '../db/driver';
import type { NewMedia } from '../media/types';
import type { RepoContext } from './context';

/** Inserts the media row, or revives the existing row with the same content hash (same bytes, same size). */
export async function upsertMedia(
  tx: SqlDriver,
  ctx: RepoContext,
  m: NewMedia,
  now: number,
): Promise<{ mediaId: string; reused: boolean }> {
  const existing = await tx.get<{ id: string }>('SELECT id FROM media WHERE sha256 = ?', [m.sha256]);
  if (existing) {
    await tx.run(
      'UPDATE media SET deleted_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NOT NULL',
      [now, existing.id],
    );
    return { mediaId: existing.id, reused: true };
  }
  const mediaId = ctx.newId();
  await tx.run(
    `INSERT INTO media (id, path, thumb_path, sha256, mime, width, height, byte_size, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [mediaId, m.path, m.thumbPath, m.sha256, m.mime, m.width, m.height, m.byteSize, now, now],
  );
  return { mediaId, reused: false };
}

export function createMediaRepo(ctx: RepoContext) {
  const { db, clock } = ctx;
  return {
    /** Marks media whose cards are all gone, or were deleted before `cutoff`, as purged. Returns the count. */
    async purgeUnreferenced(cutoff: number): Promise<number> {
      const now = clock.now();
      const r = await db.run(
        `UPDATE media SET deleted_at = ?, updated_at = ?
         WHERE deleted_at IS NULL AND NOT EXISTS (
           SELECT 1 FROM cards c WHERE c.media_id = media.id AND (c.deleted_at IS NULL OR c.deleted_at > ?))`,
        [now, now, cutoff],
      );
      return r.changes;
    },

    /** Storage keys (image + thumbnail) of every live media row. */
    async livePaths(): Promise<Set<string>> {
      const rows = await db.all<{ path: string; thumb_path: string }>(
        'SELECT path, thumb_path FROM media WHERE deleted_at IS NULL',
      );
      return new Set(rows.flatMap((r) => [r.path, r.thumb_path]));
    },
  };
}

export type MediaRepo = ReturnType<typeof createMediaRepo>;
