import type { MaskGeometry } from '@/domain/mask/types';

import type { CardRepo, CardSource } from '../repos/cardRepo';
import { discardPersisted, persistImage } from './mediaStore';
import type { PreparedImage } from './types';

/** Files first (outside the transaction), then one DB transaction; new files are removed if the DB write fails. */
export async function saveCard(
  cards: CardRepo,
  input: {
    folderId: string;
    image: PreparedImage;
    masks: MaskGeometry[];
    source: CardSource;
    title?: string | null;
  },
): Promise<string> {
  const media = await persistImage(input.image);
  try {
    const { cardId } = await cards.create({
      folderId: input.folderId,
      media,
      masks: input.masks,
      source: input.source,
      title: input.title,
    });
    return cardId;
  } catch (e) {
    await discardPersisted(media).catch(() => undefined);
    throw e;
  }
}
