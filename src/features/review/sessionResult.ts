import { createHandoff } from '@/features/app/handoff';

/** Hand-off from the review screen to the summary route (kept in memory; not persisted). */
export type SessionResult = {
  /** null = all folders. */
  folderId: string | null;
  folderName: string;
  total: number;
  remembered: number;
  againIds: string[];
  startedAt: number;
  endedAt: number;
  /** Ms until the earliest まだ card comes back, if any are pending. */
  pendingIn: number | null;
};

export const sessionResult = createHandoff<SessionResult>();
