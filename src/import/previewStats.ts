import type { ImportPreview } from './types';

export type ImportPreviewStats = {
  cardCount: number;
  folderCount: number;
  duplicateCount: number;
};

export function summarizePreview(
  preview: ImportPreview,
  existingExternalIds: ReadonlySet<string>,
): ImportPreviewStats {
  const duplicateCount = preview.cards.filter((c) => existingExternalIds.has(c.externalId)).length;
  return {
    cardCount: preview.cards.length,
    folderCount: preview.folders.length,
    duplicateCount,
  };
}
