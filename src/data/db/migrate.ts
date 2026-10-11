import type { SqlDriver } from './driver';
import { MIGRATIONS } from './migrations';

export type MigrateOptions = {
  migrations?: typeof MIGRATIONS;
  /** Called once before the first pending migration when the DB already has data (used to back up the file). */
  beforeMigrate?: (fromVersion: number) => Promise<void>;
};

export async function userVersion(db: SqlDriver): Promise<number> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/** Applies pending migrations one by one, each in its own transaction. Returns the versions applied. */
export async function migrate(db: SqlDriver, opts: MigrateOptions = {}): Promise<number[]> {
  const migrations = opts.migrations ?? MIGRATIONS;
  const current = await userVersion(db);
  const pending = migrations.filter((m) => m.version > current).sort((a, b) => a.version - b.version);
  if (pending.length === 0) return [];
  if (current > 0 && opts.beforeMigrate) await opts.beforeMigrate(current);
  for (const m of pending) {
    await db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.exec(`PRAGMA user_version = ${Math.trunc(m.version)}`);
    });
  }
  return pending.map((m) => m.version);
}
