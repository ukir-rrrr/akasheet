import type { ImportApplyResult, ImportPreview } from '@/import/types';
import { errorMessage, ValidationError } from '@/shared/errors';

import type { MediaStore } from '../media/store';
import type { CardRepo } from '../repos/cardRepo';
import type { FolderRepo } from '../repos/folderRepo';

export type ImportDeps = {
  folders: FolderRepo;
  cards: CardRepo;
  store: MediaStore;
};

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
          failed++;
        }
      }
    } catch (e) {
      if (e instanceof ValidationError) failed++;
      else failed++;
    }
  }

  return { created, skippedDuplicate, failed };
}
