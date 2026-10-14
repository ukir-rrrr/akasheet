import { isWalCheckpointComplete, walCheckpointBusy } from './walCheckpoint';

describe('walCheckpoint', () => {
  it('treats busy=0 as complete', () => {
    expect(isWalCheckpointComplete(walCheckpointBusy({ busy: 0, log: 1, checkpointed: 1 }))).toBe(true);
  });

  it('treats busy!=0 and missing rows as incomplete', () => {
    expect(isWalCheckpointComplete(walCheckpointBusy({ busy: 1, log: 3, checkpointed: 3 }))).toBe(false);
    expect(isWalCheckpointComplete(walCheckpointBusy(null))).toBe(false);
  });
});
