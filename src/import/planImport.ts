import type { CardSource } from '@/data/repos/cardRepo';

import type {
  CollisionPolicy,
  ImportPlan,
  ImportPreviewCounts,
  ParsedImportBundle,
  PlannedImportAction,
} from './types';

export type ExistingExternal = { externalId: string; cardId: string };

function deckKey(path: string[]): string {
  return path.join('::');
}

function emptyCounts(): ImportPreviewCounts {
  return { create: 0, skip: 0, overwrite: 0, duplicate: 0 };
}

function bump(counts: ImportPreviewCounts, kind: PlannedImportAction['kind']) {
  if (kind === 'create') counts.create++;
  else if (kind === 'skip') counts.skip++;
  else if (kind === 'overwrite') counts.overwrite++;
  else counts.duplicate++;
}

function resolveExternalId(
  policy: CollisionPolicy,
  base: string,
  existing: ReadonlySet<string>,
  used: Set<string>,
): { externalId: string; action: 'create' | 'skip' | 'overwrite' | 'duplicate' } {
  if (!existing.has(base) && !used.has(base)) {
    used.add(base);
    return { externalId: base, action: 'create' };
  }
  if (policy === 'skip') return { externalId: base, action: 'skip' };
  if (policy === 'overwrite') {
    used.add(base);
    return { externalId: base, action: 'overwrite' };
  }
  let n = 2;
  let candidate = `${base}#dup${n}`;
  while (existing.has(candidate) || used.has(candidate)) {
    n++;
    candidate = `${base}#dup${n}`;
  }
  used.add(candidate);
  return { externalId: candidate, action: 'duplicate' };
}

/** Builds import actions from parsed cards, resolved folder ids, and collision policy. */
export function planImport(
  bundle: ParsedImportBundle,
  deckFolderIds: Record<string, string>,
  policy: CollisionPolicy,
  existing: readonly ExistingExternal[],
): ImportPlan {
  const byExternal = new Map(existing.map((e) => [e.externalId, e.cardId]));
  const existingIds = new Set(existing.map((e) => e.externalId));
  const used = new Set<string>();
  const counts = emptyCounts();
  const actions: PlannedImportAction[] = [];

  for (const card of bundle.cards) {
    const key = deckKey(card.deckPath);
    const folderId = deckFolderIds[key];
    if (!folderId) continue;

    const baseId = card.externalId;
    const resolved = resolveExternalId(policy, baseId, existingIds, used);
    bump(counts, resolved.action);

    if (resolved.action === 'skip') {
      actions.push({ kind: 'skip', externalId: baseId });
      continue;
    }
    if (resolved.action === 'overwrite') {
      const existingCardId = byExternal.get(baseId);
      if (!existingCardId) {
        actions.push({ kind: 'create', card, folderId, externalId: resolved.externalId });
        counts.overwrite--;
        counts.create++;
        continue;
      }
      actions.push({
        kind: 'overwrite',
        card,
        folderId,
        externalId: resolved.externalId,
        existingCardId,
      });
      continue;
    }
    actions.push({
      kind: resolved.action === 'duplicate' ? 'duplicate' : 'create',
      card,
      folderId,
      externalId: resolved.externalId,
    });
  }

  return { actions, counts };
}

export function defaultDeckFolderIds(
  bundle: ParsedImportBundle,
  defaultFolderId: string | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of bundle.decks) {
    const key = deckKey(d.path);
    if (defaultFolderId) out[key] = defaultFolderId;
  }
  return out;
}

export function listExistingForSource(
  rows: { source: CardSource; external_id: string | null; id: string }[],
  source: Extract<CardSource, 'import:anki' | 'import:csv'>,
): ExistingExternal[] {
  return rows
    .filter((r) => r.source === source && r.external_id)
    .map((r) => ({ externalId: r.external_id!, cardId: r.id }));
}
