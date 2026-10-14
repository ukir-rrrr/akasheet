import { parseApkg } from './parseApkg';
import { buildSampleApkg } from './fixture';

describe('parseApkg', () => {
  it('extracts deck hierarchy, masks, and review history', async () => {
    const bytes = buildSampleApkg();
    const preview = await parseApkg(bytes, 'sample.apkg', 1_700_000_100_000);
    expect(preview.source).toBe('import:anki');
    expect(preview.cards).toHaveLength(1);
    expect(preview.cards[0].externalId).toBe('42');
    expect(preview.cards[0].folderPath).toEqual(['親', '子']);
    expect(preview.cards[0].masks).toHaveLength(1);
    expect(preview.cards[0].review?.logs.length).toBeGreaterThan(0);
    const dueMs = preview.cards[0].review?.state.dueAt;
    expect(dueMs).toBe((1_600_000_000 + 10 * 86_400) * 1000);
  });
});
