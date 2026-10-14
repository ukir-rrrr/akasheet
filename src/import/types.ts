import type { MaskGeometry } from '@/domain/mask/types';
import type { Phase } from '@/domain/scheduler/types';

export type ImportSourceKind = 'import:anki' | 'import:csv';

/** Review snapshot restored from Anki scheduling (when reps > 0). */
export type ImportedReviewSnapshot = {
  phase: Phase;
  dueAt: number;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  lastReviewedAt: number | null;
};

/** One card ready to persist after parsing (no DB / filesystem writes). */
export type ImportCardDraft = {
  externalId: string;
  /** Deck path (`親::子`) or CSV `folder_name`. */
  folderPath: string;
  title: string | null;
  imageBytes: Uint8Array;
  imageMime: string;
  masks: MaskGeometry[];
  review?: ImportedReviewSnapshot;
};

export type ParsedImportBundle = {
  source: ImportSourceKind;
  /** Shown in the confirm sheet (file name, etc.). */
  label: string;
  cards: ImportCardDraft[];
};
