import type { CardSummary } from '@/data/repos/cardRepo';

import { folderCardMatches } from './folderCardFilter';

const base = (overrides: Partial<CardSummary>): CardSummary => ({
  id: 'c1',
  title: null,
  createdAt: 0,
  phase: 'new',
  dueAt: 0,
  media: { thumbPath: 't.jpg', width: 100, height: 100 },
  masks: [],
  ...overrides,
});

describe('folderCardMatches', () => {
  const dayEnd = 1000;

  it('filters by phase and due', () => {
    expect(folderCardMatches(base({}), 'all', dayEnd)).toBe(true);
    expect(folderCardMatches(base({ dueAt: 500 }), 'today', dayEnd)).toBe(true);
    expect(folderCardMatches(base({ dueAt: 2000 }), 'today', dayEnd)).toBe(false);
    expect(folderCardMatches(base({ phase: 'learning' }), 'again', dayEnd)).toBe(true);
    expect(folderCardMatches(base({ phase: 'review' }), 'again', dayEnd)).toBe(false);
    expect(folderCardMatches(base({ phase: 'new' }), 'new', dayEnd)).toBe(true);
  });
});
