import { ValidationError } from '@/shared/errors';

import type { RepoContext } from './context';

export const FOLDER_COLORS = ['tobi', 'ai', 'moegi', 'murasaki', 'yamabuki', 'tetsu'] as const;
export type FolderColor = (typeof FOLDER_COLORS)[number];
export const FOLDER_NAME_MAX = 40;

export type Folder = { id: string; name: string; color: FolderColor };
export type FolderSummary = Folder & {
  cardCount: number;
  dueCount: number;
  lastReviewedAt: number | null;
};

function toColor(c: string | null): FolderColor {
  return (FOLDER_COLORS as readonly string[]).includes(c ?? '') ? (c as FolderColor) : 'tetsu';
}

export function validateFolderName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new ValidationError('フォルダ名を入力してください');
  if ([...trimmed].length > FOLDER_NAME_MAX) throw new ValidationError(`フォルダ名は${FOLDER_NAME_MAX}文字以内にしてください`);
  return trimmed;
}

export function createFolderRepo(ctx: RepoContext) {
  const { db, clock } = ctx;

  return {
    async list(dayEnd: number): Promise<FolderSummary[]> {
      const rows = await db.all<{
        id: string;
        name: string;
        color: string | null;
        card_count: number;
        due_count: number | null;
        last_reviewed_at: number | null;
      }>(
        `SELECT f.id, f.name, f.color,
           COUNT(c.id) AS card_count,
           SUM(CASE WHEN rs.due_at < ? THEN 1 ELSE 0 END) AS due_count,
           MAX(rs.last_reviewed_at) AS last_reviewed_at
         FROM folders f
         LEFT JOIN cards c ON c.folder_id = f.id AND c.deleted_at IS NULL
         LEFT JOIN review_states rs ON rs.card_id = c.id
         WHERE f.deleted_at IS NULL
         GROUP BY f.id ORDER BY f.sort_order, f.created_at`,
        [dayEnd],
      );
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        color: toColor(r.color),
        cardCount: r.card_count,
        dueCount: r.due_count ?? 0,
        lastReviewedAt: r.last_reviewed_at,
      }));
    },

    async get(id: string): Promise<Folder | null> {
      const r = await db.get<{ id: string; name: string; color: string | null }>(
        'SELECT id, name, color FROM folders WHERE id = ? AND deleted_at IS NULL',
        [id],
      );
      return r ? { id: r.id, name: r.name, color: toColor(r.color) } : null;
    },

    async create(name: string, color?: FolderColor): Promise<Folder> {
      const clean = validateFolderName(name);
      const id = ctx.newId();
      const now = clock.now();
      return db.transaction(async (tx) => {
        const count = await tx.get<{ n: number; mx: number | null }>(
          'SELECT COUNT(*) AS n, MAX(sort_order) AS mx FROM folders WHERE deleted_at IS NULL',
        );
        const chosen = color ?? FOLDER_COLORS[(count?.n ?? 0) % FOLDER_COLORS.length];
        await tx.run(
          'INSERT INTO folders (id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [id, clean, chosen, (count?.mx ?? 0) + 1, now, now],
        );
        return { id, name: clean, color: chosen };
      });
    },

    async rename(id: string, name: string): Promise<void> {
      const clean = validateFolderName(name);
      const r = await db.run('UPDATE folders SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [
        clean,
        clock.now(),
        id,
      ]);
      if (r.changes === 0) throw new ValidationError('フォルダが見つかりません');
    },

    /** Soft-deletes the folder and its cards and masks in one transaction. Review logs are kept. */
    async remove(id: string): Promise<void> {
      const now = clock.now();
      await db.transaction(async (tx) => {
        await tx.run(
          `UPDATE masks SET deleted_at = ?, updated_at = ?
           WHERE deleted_at IS NULL AND card_id IN (SELECT id FROM cards WHERE folder_id = ? AND deleted_at IS NULL)`,
          [now, now, id],
        );
        await tx.run('UPDATE cards SET deleted_at = ?, updated_at = ? WHERE folder_id = ? AND deleted_at IS NULL', [
          now,
          now,
          id,
        ]);
        await tx.run('UPDATE folders SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [now, now, id]);
      });
    },
  };
}

export type FolderRepo = ReturnType<typeof createFolderRepo>;
