import type { ImportPlan, ParsedImportCard } from '@/import/types';

import type { MediaStore } from './media/store';
import type { PreparedImage } from './media/types';
import type { CardRepo } from './repos/cardRepo';
import type { FolderRepo } from './repos/folderRepo';

export type ImportDeps = {
  cards: CardRepo;
  folders: FolderRepo;
  store: MediaStore;
  prepareImageFromBytes(bytes: Uint8Array, mime?: string): Promise<PreparedImage>;
};

async function persistCardImage(
  deps: ImportDeps,
  card: ParsedImportCard,
  imageUri: string,
): Promise<{ media: Awaited<ReturnType<MediaStore['persistImage']>>; prepared: PreparedImage }> {
  const prepared = await deps.store.prepareImage(imageUri);
  const media = await deps.store.persistImage(prepared);
  return { media, prepared };
}

async function cardToNewCard(
  deps: ImportDeps,
  card: ParsedImportCard,
  folderId: string,
  externalId: string,
  source: 'import:anki' | 'import:csv',
  imageUri: string,
) {
  const { media } = await persistCardImage(deps, card, imageUri);
  return {
    input: {
      folderId,
      media,
      masks: card.masks,
      source,
      title: card.title,
      externalId,
      review: card.review,
    },
    media,
  };
}

export async function executeImportPlan(
  deps: ImportDeps,
  plan: ImportPlan,
  source: 'import:anki' | 'import:csv',
  resolveImageUri: (card: ParsedImportCard) => Promise<string>,
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

  for (const action of plan.actions) {
    if (action.kind === 'skip') {
      skipped++;
      continue;
    }
    const imageUri = await resolveImageUri(action.card);
    if (action.kind === 'create' || action.kind === 'duplicate') {
      const { input, media } = await cardToNewCard(
        deps,
        action.card,
        action.folderId,
        action.externalId,
        source,
        imageUri,
      );
      try {
        await deps.cards.create(input);
        imported++;
      } catch (e) {
        await deps.store.discardPersisted(media).catch(() => undefined);
        throw e;
      }
      continue;
    }
    if (action.kind === 'overwrite') {
      const { input, media } = await cardToNewCard(
        deps,
        action.card,
        action.folderId,
        action.externalId,
        source,
        imageUri,
      );
      try {
        await deps.cards.replaceImported(action.existingCardId, input);
        imported++;
      } catch (e) {
        await deps.store.discardPersisted(media).catch(() => undefined);
        throw e;
      }
    }
  }

  return { imported, skipped };
}
