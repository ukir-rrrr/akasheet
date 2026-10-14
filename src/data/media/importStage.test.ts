/* eslint-disable import/first -- jest.mock must run before importStage */
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => {
    const b = new Uint8Array(n);
    b.fill(0xab);
    return b;
  },
}));

import { discardImportStage, readImportStage, stageImportInMemory } from './importStage';

describe('importStage', () => {
  it('stores bytes in memory until discarded', async () => {
    const uri = await stageImportInMemory(new Uint8Array([1, 2, 3]));
    expect(readImportStage(uri)?.[0]).toBe(1);
    discardImportStage(uri);
    expect(readImportStage(uri)).toBeNull();
  });
});
