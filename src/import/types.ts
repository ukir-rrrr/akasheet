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
  /** Human-readable errors for failed rows (capped). */
  errors: string[];
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

/**
 * Anki revlog ease: 1=Again, 2=Hard, 3=Good, 4=Easy.
 * akasheet の Rating は 1|3 のみのため Hard(2) は Good(3) に寄せる。Easy も 3。
 * lapse 集計はこの変換に依存せず、revlog の ease===1 を数える。
 */
export function ankiRatingFromEase(ease: number): Rating {
  if (ease <= 1) return 1;
  return 3;
}

/** Anki revlog type: 0=learn, 1=review, 2=relearn, 3=filtered, 4=manual. */
export function ankiRevlogPhase(revlogType: number): Phase {
  switch (revlogType) {
    case 0:
      return 'learning';
    case 1:
      return 'review';
    case 2:
      return 'relearning';
    case 3:
    case 4:
      return 'review';
    default:
      return 'review';
  }
}

/**
 * Anki card type: 0=new, 1=learning, 2=review, 3=relearning.
 * queue<0 は suspended / buried — 取り込み対象外 (null)。
 */
export function ankiCardPhase(card: { type: number; queue: number }): Phase | null {
  if (card.queue < 0) return null;
  switch (card.type) {
    case 0:
      return 'new';
    case 1:
      return 'learning';
    case 2:
      return 'review';
    case 3:
      return 'relearning';
    default:
      return 'review';
  }
}

export function ankiEaseFactor(factor: number): number {
  return Math.max(1.3, factor / 1000);
}

/**
 * Anki card `due` の意味は type 依存。
 * - review (2): 収集作成日 crt（秒）からの日数 → (crt + due * 86400) 秒
 * - learning/relearning (1/3): エポック秒（ミリ秒へ変換）
 * - new (0): 現時刻扱い
 */
export function ankiDueAtMs(crtSeconds: number, card: { due: number; type: number }, nowMs: number): number {
  switch (card.type) {
    case 0:
      return nowMs;
    case 1:
    case 3:
      return card.due >= 1_000_000_000_000 ? card.due : card.due * 1000;
    case 2:
      return (crtSeconds + card.due * 86_400) * 1000;
    default:
      return (crtSeconds + card.due * 86_400) * 1000;
  }
}

export function ankiRevlogIsLapse(ease: number): boolean {
  return ease === 1;
}
