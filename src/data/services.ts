import type { MaskGeometry } from '@/domain/mask/types';
import type { Clock } from '@/shared/clock';

import type { MediaStore } from './media/store';
import type { PreparedImage } from './media/types';
import type { CardRepo, CardSource } from './repos/cardRepo';
import type { MediaRepo } from './repos/mediaRepo';

export const MEDIA_GC_GRACE_MS = 30 * 86_400_000;

export type SaveCardInput = {
  folderId: string;
  image: PreparedImage;
  masks: MaskGeometry[];
  source: CardSource;
  title?: string | null;
};

/** Files first (outside the transaction), then one DB transaction; new files are removed if the DB write fails. */
export async function saveCard(
  deps: { cards: CardRepo; store: MediaStore },
  input: SaveCardInput,
): Promise<string> {
  const media = await deps.store.persistImage(input.image);
  try {
    const result = await deps.cards.create({
      folderId: input.folderId,
      media,
      masks: input.masks,
      source: input.source,
      title: input.title,
    });
    if (!result.created) throw new Error('duplicate card');
    return result.cardId;
  } catch (e) {
    await deps.store.discardPersisted(media).catch(() => undefined);
    throw e;
  }
}

/**
 * Startup maintenance: purge media rows whose cards were deleted 30+ days ago, then delete every stored file
 * no live row references (including orphans of interrupted saves). Must run before any user action.
 */
export async function runMaintenance(deps: { media: MediaRepo; store: MediaStore; clock: Clock }) {
  const purged = await deps.media.purgeUnreferenced(deps.clock.now() - MEDIA_GC_GRACE_MS);
  const removedFiles = await deps.store.collectGarbage(await deps.media.livePaths());
  return { purged, removedFiles };
}
