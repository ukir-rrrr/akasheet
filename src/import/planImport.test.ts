import type { ParsedImportBundle } from './types';
import { planImport } from './planImport';

const bundle: ParsedImportBundle = {
  source: 'import:csv',
  decks: [{ path: ['A'], cardCount: 1 }],
  cards: [
    {
      externalId: 'ext-1',
      deckPath: ['A'],
      title: 't',
      imageFile: 'a.jpg',
      masks: [{ v: 1, shapes: [{ t: 'rect', x: 0, y: 0, w: 0.1, h: 0.1 }] }],
      review: null,
    },
  ],
  warnings: [],
};

describe('planImport', () => {
  it('skips duplicates when asked', () => {
    const plan = planImport(bundle, { A: 'folder-1' }, 'skip', [{ externalId: 'ext-1', cardId: 'c1' }]);
    expect(plan.counts.skip).toBe(1);
    expect(plan.actions[0].kind).toBe('skip');
  });

  it('creates when no collision', () => {
    const plan = planImport(bundle, { A: 'folder-1' }, 'skip', []);
    expect(plan.counts.create).toBe(1);
  });
});
