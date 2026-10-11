/** Hand-off from the review screen to the summary route (kept in memory; not persisted). */
export type SessionResult = {
  folderId: string;
  folderName: string;
  total: number;
  remembered: number;
  againIds: string[];
  startedAt: number;
  endedAt: number;
  /** Ms until the earliest まだ card comes back, if any are pending. */
  pendingIn: number | null;
};

let last: SessionResult | null = null;

export const sessionResult = {
  set: (r: SessionResult) => {
    last = r;
  },
  get: () => last,
};
