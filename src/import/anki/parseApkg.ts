import { unzipSync } from 'fflate';

import type { ReviewState } from '@/domain/scheduler/types';

import { occlusionMaskForOrd } from '../masks';
import type { ImportCardDraft, ImportPreview, ImportReviewLog } from '../types';
import {
  ankiCardPhase,
  ankiDueAtMs,
  ankiEaseFactor,
  ankiExternalId,
  ankiRatingFromEase,
  ankiRevlogIsLapse,
  ankiRevlogPhase,
  folderPathKey,
} from '../types';
import { readCollectionFromZip } from './collectionBytes';
import { openAnkiDb, queryAll, queryGet } from './sqlite';

const FIELD_SEP = '\u001f';

type DeckMap = Map<number, string>;

function readZip(bytes: Uint8Array): Record<string, Uint8Array> {
  const raw = unzipSync(bytes);
  const out: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(raw)) {
    out[name] = data;
  }
  return out;
}

function deckPath(name: string): string[] {
  return name
    .split('::')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseDecksJson(json: string): DeckMap {
  const decks: DeckMap = new Map();
  try {
    const obj = JSON.parse(json) as Record<string, { name?: string }>;
    for (const [id, d] of Object.entries(obj)) {
      const n = Number(id);
      if (Number.isFinite(n) && d?.name) decks.set(n, d.name);
    }
  } catch {
    // ignore
  }
  return decks;
}

function parseMediaMap(jsonText: string): Record<string, string> {
  try {
    return JSON.parse(jsonText) as Record<string, string>;
  } catch {
    return {};
  }
}

function firstImageName(html: string): string | null {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1] ?? null;
}

function noteTitle(flds: string[], ord: number): string | null {
  const t = flds[ord]?.replace(/<[^>]+>/g, '').trim();
  return t && t.length > 0 ? t : null;
}

function resolveMediaFile(mediaMap: Record<string, string>, zip: Record<string, Uint8Array>, name: string) {
  const entry = Object.entries(mediaMap).find(([, v]) => v === name);
  const key = entry?.[0] ?? name;
  const bytes = zip[key];
  if (!bytes) return null;
  const lower = name.toLowerCase();
  const mime = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return { bytes, mime };
}

function buildReviewFromCard(
  crtSeconds: number,
  card: {
    type: number;
    queue: number;
    due: number;
    ivl: number;
    factor: number;
    reps: number;
    lapses: number;
  },
  logs: { ease: number; ivl: number; factor: number; time: number; type: number }[],
  nowMs: number,
): { state: ReviewState; logs: ImportReviewLog[] } | undefined {
  if (card.reps === 0 && logs.length === 0) return undefined;

  const initial: ReviewState = {
    phase: 'new',
    dueAt: nowMs,
    intervalDays: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    lastReviewedAt: null,
  };

  let state = initial;
  const outLogs: ImportReviewLog[] = [];
  const sorted = [...logs].sort((a, b) => a.time - b.time);
  for (const l of sorted) {
    const prev = state;
    const rating = ankiRatingFromEase(l.ease);
    const intervalDays = Math.max(0, l.ivl);
    const phase = ankiRevlogPhase(l.type);
    const next: ReviewState = {
      phase,
      dueAt: l.time,
      intervalDays,
      ease: ankiEaseFactor(l.factor),
      reps: prev.reps + 1,
      lapses: prev.lapses + (ankiRevlogIsLapse(l.ease) ? 1 : 0),
      lastReviewedAt: l.time,
    };
    outLogs.push({ reviewedAt: l.time, rating, prev, next });
    state = next;
  }

  const phase = ankiCardPhase(card);
  if (!phase) return undefined;

  const base: ReviewState = {
    phase,
    dueAt: ankiDueAtMs(crtSeconds, card, nowMs),
    intervalDays: Math.max(0, card.ivl),
    ease: ankiEaseFactor(card.factor),
    reps: card.reps,
    lapses: card.lapses,
    lastReviewedAt: outLogs[outLogs.length - 1]?.reviewedAt ?? null,
  };

  return { state: base, logs: outLogs };
}

export async function parseApkg(bytes: Uint8Array, fileName: string, nowMs: number): Promise<ImportPreview> {
  const zip = readZip(bytes);
  const colBytes = readCollectionFromZip(zip);

  const db = await openAnkiDb(colBytes);
  try {
    const col = queryGet<{ decks: string; crt: number }>(db, 'SELECT decks, crt FROM col LIMIT 1');
    const crtSeconds = col?.crt ?? 0;
    const decks = parseDecksJson(col?.decks ?? '{}');

    const notes = queryAll<{ id: number; flds: string }>(db, 'SELECT id, flds FROM notes');
    const noteById = new Map(notes.map((n) => [n.id, n.flds.split(FIELD_SEP)]));

    const cards = queryAll<{
      id: number;
      nid: number;
      did: number;
      ord: number;
      type: number;
      queue: number;
      due: number;
      ivl: number;
      factor: number;
      reps: number;
      lapses: number;
    }>(db, 'SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards');

    const revlog = queryAll<{
      cid: number;
      ease: number;
      ivl: number;
      factor: number;
      time: number;
      type: number;
    }>(db, 'SELECT cid, ease, ivl, factor, time, type FROM revlog');
    const logsByCard = new Map<
      number,
      { ease: number; ivl: number; factor: number; time: number; type: number }[]
    >();
    for (const l of revlog) {
      logsByCard.set(l.cid, [...(logsByCard.get(l.cid) ?? []), l]);
    }

    const mediaJson = zip.media ? new TextDecoder().decode(zip.media) : '{}';
    const mediaMap = parseMediaMap(mediaJson);

    const drafts: ImportCardDraft[] = [];

    for (const card of cards) {
      if (ankiCardPhase(card) === null) continue;

      const flds = noteById.get(card.nid);
      if (!flds) continue;
      const html = flds.join('\n');
      const mask = occlusionMaskForOrd(html, card.ord);
      if (!mask) continue;

      const imgName = firstImageName(html);
      if (!imgName) continue;
      const media = resolveMediaFile(mediaMap, zip, imgName);
      if (!media) continue;

      const deckName = decks.get(card.did) ?? 'Imported';
      const review = buildReviewFromCard(crtSeconds, card, logsByCard.get(card.id) ?? [], nowMs);

      drafts.push({
        externalId: ankiExternalId(card.id),
        title: noteTitle(flds, card.ord) ?? noteTitle(flds, 0),
        folderPath: deckPath(deckName),
        imageBytes: media.bytes,
        imageMime: media.mime,
        masks: [mask],
        review,
      });
    }

    const folderCounts = new Map<string, number>();
    for (const d of drafts) {
      const k = folderPathKey(d.folderPath);
      folderCounts.set(k, (folderCounts.get(k) ?? 0) + 1);
    }
    const folders = [...folderCounts.entries()].map(([k, n]) => ({
      path: k.split('\u0000'),
      cardCount: n,
    }));

    return {
      source: 'import:anki',
      fileName,
      folders,
      cards: drafts,
    };
  } finally {
    db.close();
  }
}
