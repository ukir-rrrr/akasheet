import Database from 'better-sqlite3';

import type { SqlDriver, SqlParam } from '../driver';

/** Test-only driver: runs the production SQL against an in-process SQLite. */
export function createBetterSqliteDriver(filename = ':memory:'): SqlDriver & { raw: Database.Database; close(): void } {
  const raw = new Database(filename);
  raw.pragma('foreign_keys = ON');
  let chain: Promise<unknown> = Promise.resolve();

  const ops: Omit<SqlDriver, 'transaction'> = {
    async exec(sql) {
      raw.exec(sql);
    },
    async run(sql, params: readonly SqlParam[] = []) {
      const r = raw.prepare(sql).run(...params);
      return { changes: r.changes };
    },
    async all<T>(sql: string, params: readonly SqlParam[] = []) {
      const stmt = raw.prepare(sql);
      if (!stmt.reader) {
        stmt.run(...params);
        return [];
      }
      return stmt.all(...params) as T[];
    },
    async get<T>(sql: string, params: readonly SqlParam[] = []) {
      const stmt = raw.prepare(sql);
      if (!stmt.reader) {
        stmt.run(...params);
        return null;
      }
      return (stmt.get(...params) as T | undefined) ?? null;
    },
  };

  const tx: SqlDriver = { ...ops, transaction: (fn) => fn(tx) };

  return {
    ...ops,
    raw,
    close: () => raw.close(),
    transaction<T>(fn: (t: SqlDriver) => Promise<T>): Promise<T> {
      const run = async () => {
        raw.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn(tx);
          raw.exec('COMMIT');
          return result;
        } catch (e) {
          raw.exec('ROLLBACK');
          throw e;
        }
      };
      const p = chain.then(run, run);
      chain = p.catch(() => undefined);
      return p;
    },
  };
}
