export type SqlParam = string | number | null;

/** Minimal async SQL surface shared by expo-sqlite (app) and better-sqlite3 (tests). */
export interface SqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlParam[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: readonly SqlParam[]): Promise<T[]>;
  get<T>(sql: string, params?: readonly SqlParam[]): Promise<T | null>;
  /** Runs fn atomically; writes are serialized. Nested calls reuse the outer transaction. */
  transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T>;
  /**
   * Reclaims free-list pages after in-place sensitive UPDATEs (VACUUM + WAL checkpoint).
   * Must not run inside an app transaction; returns false on failure so callers can retry.
   */
  compactFreelist(): Promise<boolean>;
}
