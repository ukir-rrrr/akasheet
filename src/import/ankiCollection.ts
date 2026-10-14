import type { MaskGeometry } from '@/domain/mask/types';

import { extractImageFileName, maskGeometriesFromIo, parseImageOcclusionField } from './ankiIo';
import { mapAnkiSchedule, type AnkiCardSchedule } from './ankiSchedule';
import type { ImportCardDraft, ParsedImportBundle } from './types';
import type { NamedBytes } from './zipEntries';

export type SqlReader = {
  get<T>(sql: string, params?: readonly (string | number | null)[]): Promise<T | null>;
  all<T>(sql: string, params?: readonly (string | number | null)[]): Promise<T[]>;
};

type ColRow = { crt: number; decks: string };
type NoteRow = { id: number; flds: string };
type CardRow = AnkiCardSchedule & { id: number; nid: number; did: number; ord: number };

function parseMediaMap(entries: NamedBytes): Map<string, string> {
  const mediaJson = entries.get('media');
  if (!mediaJson) return new Map();
  const text = new TextDecoder().decode(mediaJson);
  const obj = JSON.parse(text) as Record<string, string>;
  const out = new Map<string, string>();
  for (const [num, name] of Object.entries(obj)) out.set(num, name);
  return out;
}

function readMediaBytes(entries: NamedBytes, mediaMap: Map<string, string>, fileName: string): Uint8Array {
  for (const [num, name] of mediaMap) {
    if (name === fileName || name.endsWith(`/${fileName}`)) {
      const data = entries.get(num);
      if (data) return data;
    }
  }
  const direct = entries.get(fileName) ?? entries.get(`media/${fileName}`);
  if (direct) return direct;
  throw new Error(`メディアが見つかりません: ${fileName}`);
}

function deckNameById(decksJson: string, did: number): string {
  const decks = JSON.parse(decksJson) as Record<string, { name?: string }>;
  const entry = decks[String(did)];
  return entry?.name?.trim() || 'インポート';
}

function noteToMasks(flds: string): MaskGeometry[] {
  const clozes = parseImageOcclusionField(flds);
  const geoms = maskGeometriesFromIo(clozes);
  return geoms.map((g) => g.geometry);
}

/** Reads a parsed Anki collection DB + apkg media into import drafts. */
export async function parseAnkiCollection(
  db: SqlReader,
  entries: NamedBytes,
  label: string,
): Promise<ParsedImportBundle> {
  const col = await db.get<ColRow>('SELECT crt, decks FROM col LIMIT 1');
  if (!col) throw new Error('Anki コレクションが読み取れません');
  const mediaMap = parseMediaMap(entries);
  const notes = await db.all<NoteRow>('SELECT id, flds FROM notes');
  const noteById = new Map(notes.map((n) => [n.id, n]));
  const cards = await db.all<CardRow>(
    'SELECT id, nid, did, ord, queue, due, ivl, factor, reps, lapses FROM cards',
  );
  const drafts: ImportCardDraft[] = [];
  for (const card of cards) {
    const note = noteById.get(card.nid);
    if (!note) continue;
    const masks = noteToMasks(note.flds);
    if (masks.length === 0) continue;
    const imageName = extractImageFileName(note.flds);
    if (!imageName) continue;
    const imageBytes = readMediaBytes(entries, mediaMap, imageName);
    const folderPath = deckNameById(col.decks, card.did);
    const review = mapAnkiSchedule(card, col.crt);
    drafts.push({
      externalId: `anki:card:${card.id}`,
      folderPath,
      title: null,
      imageBytes,
      imageMime: 'image/jpeg',
      masks,
      review,
    });
  }
  if (drafts.length === 0) {
    throw new Error('Image Occlusion カードが見つかりませんでした');
  }
  return { source: 'import:anki', label, cards: drafts };
}
