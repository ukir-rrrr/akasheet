import { ALL_FOLDERS } from './constants';
import { consumeReviewLaunch, createReviewLaunch, resolveReviewRoute, reviewLaunch } from './reviewLaunch';

describe('resolveReviewRoute', () => {
  it('uses the hand-off payload when present (ignoring stale URL ids)', () => {
    const taken = createReviewLaunch({
      folderId: 'folder-a',
      folderName: '日本史',
      onlyCardIds: ['card-1', 'card-2'],
    });
    const resolved = resolveReviewRoute(taken, {
      folderId: 'folder-a',
      ids: 'other-1,other-2',
    });
    expect(resolved.launchKey).toBe(taken.key);
    expect(resolved.folderId).toBe('folder-a');
    expect(resolved.folderName).toBe('日本史');
    expect(resolved.onlyCardIds).toEqual(['card-1', 'card-2']);
  });

  it('falls back to route params when there is no hand-off', () => {
    const resolved = resolveReviewRoute(null, {
      folderId: ALL_FOLDERS,
      ids: 'a,b',
    });
    expect(resolved.folderId).toBeNull();
    expect(resolved.folderName).toBeNull();
    expect(resolved.onlyCardIds).toEqual(['a', 'b']);
    expect(resolved.launchKey).toContain(ALL_FOLDERS);
  });

  it('treats a daily queue launch with null onlyCardIds as non-replay', () => {
    const taken = createReviewLaunch({
      folderId: null,
      folderName: 'すべてのフォルダ',
      onlyCardIds: null,
    });
    const resolved = resolveReviewRoute(taken, { folderId: ALL_FOLDERS, ids: 'should-not-apply' });
    expect(resolved.onlyCardIds).toBeNull();
    expect(resolved.folderName).toBe('すべてのフォルダ');
  });
});

describe('consumeReviewLaunch', () => {
  it('returns the same launch when called twice (StrictMode-style double init)', () => {
    const launch = createReviewLaunch({
      folderId: 'folder-a',
      folderName: '日本史',
      onlyCardIds: null,
    });
    reviewLaunch.set(launch);
    expect(consumeReviewLaunch()).toEqual(launch);
    expect(consumeReviewLaunch()).toEqual(launch);
    expect(reviewLaunch.peek()).toBeNull();
  });

  it('does not reuse a consumed launch after the StrictMode window (deep link / remount)', async () => {
    const launch = createReviewLaunch({
      folderId: 'folder-a',
      folderName: '日本史',
      onlyCardIds: ['card-replay'],
    });
    reviewLaunch.set(launch);
    expect(consumeReviewLaunch()).toEqual(launch);
    await Promise.resolve();
    expect(consumeReviewLaunch()).toBeNull();
    const fromUrl = resolveReviewRoute(null, { folderId: 'other-folder', ids: 'x,y' });
    expect(fromUrl.folderId).toBe('other-folder');
    expect(fromUrl.onlyCardIds).toEqual(['x', 'y']);
  });

  it('clears the sticky launch when a new launch is set', () => {
    const first = createReviewLaunch({
      folderId: 'f1',
      folderName: 'One',
      onlyCardIds: null,
    });
    reviewLaunch.set(first);
    consumeReviewLaunch();
    const second = createReviewLaunch({
      folderId: 'f2',
      folderName: 'Two',
      onlyCardIds: null,
    });
    reviewLaunch.set(second);
    expect(consumeReviewLaunch()).toEqual(second);
  });
});

describe('createReviewLaunch', () => {
  it('assigns distinct keys for successive launches with the same card ids', () => {
    const a = createReviewLaunch({
      folderId: 'f',
      folderName: 'F',
      onlyCardIds: ['c1'],
    });
    const b = createReviewLaunch({
      folderId: 'f',
      folderName: 'F',
      onlyCardIds: ['c1'],
    });
    expect(a.key).not.toBe(b.key);
  });
});
