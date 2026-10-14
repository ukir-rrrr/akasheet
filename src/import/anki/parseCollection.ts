import type { Phase } from '@/domain/scheduler/types';

import { firstImageFileFromHtml, masksForCardOrd, parseMasksField } from '../masks';
import type { ImportedReviewState, ParsedImportBundle, ParsedImportCard } from '../types';
import { resolveAnkiMedia, type UnpackedApkg } from './unpackApkg';
import type { AnkiSql } from './sqlTypes';

type DeckJson = Record<string, { name: string }>;

type NoteRow = { id: number; mid: number; tags: string; flds: string };
type CardRow = {
  id: number;
  nid: number;
  did: number;
  ord: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  queue: number;
  due: number;
  type: number;
};

function splitFields(flds: string): string[] {
  return flds.split('\x1f');
}

function deckPathFromName(name: string): string[] {
  return name
    .split('::')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseReviewFromField(
  raw: string | undefined,
  fallback: ImportedReviewState | null,
): ImportedReviewState | null {
  if (!raw?.trim()) return fallback;
  try {
    const j = JSON.parse(raw) as ImportedReviewState;
    if (typeof j.phase === 'string' && typeof j.dueAt === 'number') return j;
  } catch {
    return fallback;
  }
  return fallback;
}

function ankiHistoryToReview(card: CardRow, colCrtMs: number): ImportedReviewState | null {
  if (card.reps <= 0 && card.queue === 0) return null;
  const phase: Phase =
    card.type === 0 || card.queue === 0
      ? 'new'
      : card.type === 1 || card.queue === 1
        ? 'learning'
        : card.type === 3
          ? 'relearning'
          : 'review';
  const dueAt = card.ivl > 0 ? colCrtMs + card.ivl * 86_400_000 : colCrtMs + 600_000;
  return {
    phase,
    dueAt,
    intervalDays: Math.max(0, card.ivl),
    ease: Math.max(1.3, card.factor / 1000),
    reps: card.reps,
    lapses: card.lapses,
    lastReviewedAt: card.reps > 0 ? colCrtMs : null,
  };
}

function isAkasheetNote(tags: string, flds: string[]): boolean {
  if (tags.includes('akasheet:import')) return true;
  if (flds.length >= 3 && parseMasksField(flds[2]).length > 0) return true;
  return false;
}

/**
 * Reads an opened Anki collection DB plus unpacked media.
 * Supports Akasheet-tagged notes and Image-Occlusion-style one-mask-per-card (`ord`).
 */
export async function parseAnkiCollection(sql: AnkiSql, pkg: UnpackedApkg): Promise<ParsedImportBundle> {
  const col = await sql.get<{ decks: string; crt: number }>('SELECT decks, crt FROM col LIMIT 1');
  if (!col) throw new Error('Anki コレクションを読み取れません');
  const decksJson = JSON.parse(col.decks) as DeckJson;
  const deckNameById = new Map<number, string>();
  for (const [id, d] of Object.entries(decksJson)) deckNameById.set(Number(id), d.name);

  const notes = await sql.all<NoteRow>('SELECT id, mid, tags, flds FROM notes');
  const cards = await sql.all<CardRow>(
    'SELECT id, nid, did, ord, ivl, factor, reps, lapses, queue, due, type FROM cards WHERE queue != -1',
  );

  const noteById = new Map(notes.map((n) => [n.id, n]));
  const warnings: string[] = [];
  const parsed: ParsedImportCard[] = [];

  for (const card of cards) {
    const note = noteById.get(card.nid);
    if (!note) continue;
    const flds = splitFields(note.flds);
    if (!isAkasheetNote(note.tags, flds)) continue;

    const title = flds[0]?.trim() || null;
    const imageField = flds[1] ?? '';
    const imageFile = firstImageFileFromHtml(imageField) ?? imageField.replace(/<[^>]+>/g, '').trim();
    if (!imageFile) {
      warnings.push(`ノート ${note.id}: 画像ファイルが見つかりません`);
      continue;
    }
    const imageBytes = resolveAnkiMedia(imageFile, pkg.mediaMap, pkg.files);
    if (!imageBytes) warnings.push(`ノート ${note.id}: メディア ${imageFile} がパッケージにありません`);

    const allMasks = parseMasksField(flds[2] ?? '');
    const masks = masksForCardOrd(allMasks, card.ord);
    if (masks.length === 0) {
      warnings.push(`ノート ${note.id} カード ${card.id}: マスクがありません`);
      continue;
    }

    const deckName = deckNameById.get(card.did) ?? 'Imported';
    const review =
      parseReviewFromField(flds[3], ankiHistoryToReview(card, col.crt * 1000)) ??
      ankiHistoryToReview(card, col.crt * 1000);

    parsed.push({
      externalId: String(card.id),
      deckPath: deckPathFromName(deckName),
      title,
      imageFile,
      imageBytes: imageBytes ?? undefined,
      masks,
      review,
    });
  }

  const deckCounts = new Map<string, number>();
  for (const c of parsed) {
    const key = c.deckPath.join('::');
    deckCounts.set(key, (deckCounts.get(key) ?? 0) + 1);
  }
  const decks = [...deckCounts.entries()].map(([key, count]) => ({
    path: key.split('::'),
    cardCount: count,
  }));

  if (parsed.length === 0) {
    warnings.push(
      '取り込み可能なカードがありません。Anki 側で akasheet:import タグ付き、またはマスク JSON 入りノートを用意してください。',
    );
  }

  return { source: 'import:anki', decks, cards: parsed, warnings };
}
