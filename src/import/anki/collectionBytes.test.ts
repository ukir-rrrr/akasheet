import { unzipSync } from 'fflate';

import { buildSampleApkg } from './fixture';
import { readCollectionFromZip } from './collectionBytes';

describe('readCollectionFromZip', () => {
  it('reads collection.anki2 from a sample apkg', () => {
    const zip: Record<string, Uint8Array> = {};
    for (const [name, data] of Object.entries(unzipSync(buildSampleApkg()))) {
      zip[name] = data;
    }
    const sqlite = readCollectionFromZip(zip);
    expect(sqlite[0]).toBe(0x53);
  });

  it('reports missing collection clearly', () => {
    expect(() => readCollectionFromZip({})).toThrow(/見つかりません/);
  });

  it('reports invalid anki21b payload', () => {
    expect(() => readCollectionFromZip({ 'collection.anki21b': new Uint8Array([1, 2, 3, 4]) })).toThrow(
      /anki21b/,
    );
  });
});
