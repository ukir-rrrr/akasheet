export type WalCheckpointRow = { busy: number; log?: number; checkpointed?: number };

/** busy column from PRAGMA wal_checkpoint; non-zero means checkpoint did not fully complete. */
export function walCheckpointBusy(row: WalCheckpointRow | null | undefined): number {
  if (row == null || typeof row.busy !== 'number') return 1;
  return row.busy;
}

export function isWalCheckpointComplete(busy: number): boolean {
  return busy === 0;
}
