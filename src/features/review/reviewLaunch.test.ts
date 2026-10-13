import { ALL_FOLDERS } from './constants';
import { createReviewLaunch, resolveReviewRoute } from './reviewLaunch';

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
