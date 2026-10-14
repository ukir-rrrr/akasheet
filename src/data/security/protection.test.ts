import { canMutateLocalData } from './protection';

describe('canMutateLocalData', () => {
  it('is true only in full mode', () => {
    expect(canMutateLocalData({ mode: 'full', storage: 'secure-store' })).toBe(true);
    expect(canMutateLocalData({ mode: 'read-only', storage: null })).toBe(false);
  });
});
