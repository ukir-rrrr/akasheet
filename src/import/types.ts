import type { MaskGeometry } from '@/domain/mask/types';
import type { Phase, Rating, ReviewState } from '@/domain/scheduler/types';

export type ImportSourceKind = 'import:anki' | 'import:csv';

export type ImportReviewLog = {
  reviewedAt: number;
  rating: Rating;
  prev: ReviewState;
  next: ReviewState;
};

export type ImportCardDraft = {
  externalId: string;
  title: string | null;
  /** Deck / CSV folder path from root to leaf. */
  folderPath: string[];
  imageBytes: Uint8Array;
  imageMime: string;
  masks: MaskGeometry[];
  review?: { state: ReviewState; logs: ImportReviewLog[] };
};

export type ImportFolderPreview = {
  path: string[];
  cardCount: number;
};

export type ImportPreview = {
  source: ImportSourceKind;
  fileName: string;
  folders: ImportFolderPreview[];
  cards: ImportCardDraft[];
};

export type ImportApplyResult = {
  created: number;
  skippedDuplicate: number;
  failed: number;
};

export const IMPORTED_ALGORITHM = 'imported';

export function folderPathKey(path: string[]): string {
  return path
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\u0000');
}

export function ankiExternalId(cardId: number | string): string {
  return String(cardId);
}

export function csvExternalId(row: number): string {
  return `row:${row}`;
}

export function ankiPhaseFromQueue(type: number, queue: number): Phase {
  if (type === 0) return 'new';
  if (type === 1) return queue === 1 ? 'learning' : 'learning';
  if (type === 3) return 'relearning';
  return 'review';
}

export function ankiEaseFactor(factor: number): number {
  return Math.max(1.3, factor / 1000);
}

export function ankiDueAt(card: { due: number; type: number }, nowMs: number): number {
  if (card.type === 0 || card.type === 1) {
    return nowMs + Math.max(0, card.due) * 60_000;
  }
  const dayMs = 86_400_000;
  const dayIndex = card.due;
  return dayIndex * dayMs;
}

export function ankiRatingFromEase(ease: number): Rating {
  return ease < 3 ? 1 : 3;
}
