import type { CardSummary } from '@/data/repos/cardRepo';

export type FolderCardFilter = 'all' | 'today' | 'again' | 'new';

export const FOLDER_CARD_FILTERS: { key: FolderCardFilter; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'today', label: '今日' },
  { key: 'again', label: 'まだ' },
  { key: 'new', label: '新規' },
];

export function folderCardMatches(card: CardSummary, filter: FolderCardFilter, dayEnd: number): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'today':
      return card.dueAt < dayEnd;
    case 'again':
      return card.phase === 'learning' || card.phase === 'relearning';
    case 'new':
      return card.phase === 'new';
  }
}
