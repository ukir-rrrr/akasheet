import type { FolderRepo } from '@/data/repos/folderRepo';
import type { DeckFolderTarget, ParsedImportBundle } from '@/import/types';

export async function resolveDeckFolderIds(
  folders: FolderRepo,
  bundle: ParsedImportBundle,
  mapping: Record<string, DeckFolderTarget>,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const deck of bundle.decks) {
    const key = deck.path.join('::');
    const target = mapping[key];
    if (!target) continue;
    if (target.mode === 'merge') {
      out[key] = target.folderId;
      continue;
    }
    const parentPath = deck.path.slice(0, -1);
    const parentId =
      parentPath.length > 0
        ? await folders.ensurePath(parentPath, target.parentFolderId)
        : target.parentFolderId;
    const leaf = deck.path[deck.path.length - 1] ?? target.name;
    const existing = await folders.findChildByName(parentId, target.name || leaf);
    out[key] = existing?.id ?? (await folders.create(target.name || leaf, undefined, parentId)).id;
  }
  return out;
}
