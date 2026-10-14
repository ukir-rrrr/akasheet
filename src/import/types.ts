import type { CardSource, ImportedReviewState } from '@/data/repos/cardRepo';
import type { MaskGeometry } from '@/domain/mask/types';

export type { ImportedReviewState };

export type ImportFormat = 'anki' | 'csv';

export type CollisionPolicy = 'skip' | 'overwrite' | 'duplicate';

/** One card worth of data after parsing (no DB ids). */
export type ParsedImportCard = {
  externalId: string;
  deckPath: string[];
  title: string | null;
  imageFile: string;
  imageBytes?: Uint8Array;
  masks: MaskGeometry[];
  review: ImportedReviewState | null;
};

export type ParsedImportDeck = {
  path: string[];
  cardCount: number;
};

export type ParsedImportBundle = {
  source: Extract<CardSource, 'import:anki' | 'import:csv'>;
  decks: ParsedImportDeck[];
  cards: ParsedImportCard[];
  warnings: string[];
};

export type DeckFolderTarget =
  { mode: 'merge'; folderId: string } | { mode: 'new'; parentFolderId: string | null; name: string };

export type ImportPreviewCounts = {
  create: number;
  skip: number;
  overwrite: number;
  duplicate: number;
};

export type PlannedImportAction =
  | { kind: 'create'; card: ParsedImportCard; folderId: string; externalId: string }
  | { kind: 'skip'; externalId: string }
  | {
      kind: 'overwrite';
      card: ParsedImportCard;
      folderId: string;
      externalId: string;
      existingCardId: string;
    }
  | {
      kind: 'duplicate';
      card: ParsedImportCard;
      folderId: string;
      externalId: string;
    };

export type ImportPlan = {
  actions: PlannedImportAction[];
  counts: ImportPreviewCounts;
};
