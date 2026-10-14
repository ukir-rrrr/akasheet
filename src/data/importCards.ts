import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';

import type { ParsedImportBundle } from '@/import/types';

import type { MediaStore } from './media/store';
import type { CardRepo } from './repos/cardRepo';
import type { FolderRepo } from './repos/folderRepo';

export type ImportCommitResult = { created: number; skipped: number; folderIds: string[] };

function randomSuffix(): string {
  return Array.from(Crypto.getRandomBytes(8), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function bytesToTempUri(bytes: Uint8Array, mime: string): Promise<string> {
  const ext = mime.includes('png') ? 'png' : 'jpg';
  const file = new File(Paths.cache, `import-${randomSuffix()}.${ext}`);
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

/** Persists parsed import drafts via repos (no direct SQL from UI). */
export async function commitImportBundle(
  deps: { cards: CardRepo; folders: FolderRepo; store: MediaStore },
  bundle: ParsedImportBundle,
): Promise<ImportCommitResult> {
  let created = 0;
  let skipped = 0;
  const folderIds = new Set<string>();
  for (const draft of bundle.cards) {
    const folderId = await deps.folders.ensurePath(draft.folderPath);
    folderIds.add(folderId);
    const uri = await bytesToTempUri(draft.imageBytes, draft.imageMime);
    const prepared = await deps.store.prepareImage(uri);
    const media = await deps.store.persistImage(prepared);
    try {
      const result = await deps.cards.create({
        folderId,
        media,
        masks: draft.masks,
        source: bundle.source,
        title: draft.title,
        externalId: draft.externalId,
        importedReview: draft.review,
      });
      if (result.created) created++;
      else skipped++;
    } catch (e) {
      await deps.store.discardPersisted(media).catch(() => undefined);
      throw e;
    }
  }
  return { created, skipped, folderIds: [...folderIds] };
}
