import type { ImportApplyResult, ImportPreview } from '@/import/types';
import { errorMessage } from '@/shared/errors';

import type { MediaStore } from '../media/store';
import type { CardRepo } from '../repos/cardRepo';
import type { FolderRepo } from '../repos/folderRepo';

export type ImportDeps = {
  folders: FolderRepo;
  cards: CardRepo;
  store: MediaStore;
};

const MAX_ERRORS = 8;

export async function applyImportPreview(
  deps: ImportDeps,
  preview: ImportPreview,
): Promise<ImportApplyResult> {
  const existing = await deps.cards.existingExternalIds(
    preview.source,
    preview.cards.map((c) => c.externalId),
  );

  let created = 0;
  let skippedDuplicate = 0;
  let failed = 0;
  const errors: string[] = [];

  const noteError = (card: ImportPreview['cards'][number], e: unknown) => {
    failed++;
    if (errors.length < MAX_ERRORS) {
      const label = card.title ?? card.externalId;
      errors.push(`${label}: ${errorMessage(e)}`);
    }
  };

  for (const card of preview.cards) {
    if (existing.has(card.externalId)) {
      skippedDuplicate++;
      continue;
    }
    try {
      const folderId = await deps.folders.ensurePath(card.folderPath);
      const media = await deps.store.persistImportImage(card.imageBytes, card.imageMime);
      try {
        await deps.cards.create({
          folderId,
          media,
          masks: card.masks,
          source: preview.source,
          title: card.title,
          externalId: card.externalId,
          importedReview: card.review,
        });
        created++;
        existing.add(card.externalId);
      } catch (e) {
        await deps.store.discardPersisted(media).catch(() => undefined);
        if (errorMessage(e) === 'duplicate_import') {
          skippedDuplicate++;
          existing.add(card.externalId);
        } else {
          noteError(card, e);
        }
      }
    } catch (e) {
      noteError(card, e);
    }
  }

  return { created, skippedDuplicate, failed, errors };
}
