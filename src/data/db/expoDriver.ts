import { Platform } from 'react-native';
import { openDatabaseAsync, type SQLiteBindValue, type SQLiteDatabase } from 'expo-sqlite';

import type { SqlDriver, SqlParam } from './driver';

type Executor = Pick<SQLiteDatabase, 'execAsync' | 'runAsync' | 'getAllAsync' | 'getFirstAsync'>;

function ops(x: Executor): Omit<SqlDriver, 'transaction' | 'compactFreelist'> {
  const bind = (p: readonly SqlParam[]) => p as SQLiteBindValue[];
  return {
    exec: (sql) => x.execAsync(sql),
    run: async (sql, params = []) => ({ changes: (await x.runAsync(sql, bind(params))).changes }),
    all: <T>(sql: string, params: readonly SqlParam[] = []) => x.getAllAsync<T>(sql, bind(params)),
    get: async <T>(sql: string, params: readonly SqlParam[] = []) =>
      (await x.getFirstAsync<T>(sql, bind(params))) ?? null,
  };
}

function splitDatabasePath(databasePath: string): { name: string; directory?: string } {
  if (databasePath === ':memory:') return { name: ':memory:' };
  const slash = databasePath.lastIndexOf('/');
  if (slash <= 0) return { name: databasePath };
  return { name: databasePath.slice(slash + 1), directory: databasePath.slice(0, slash) };
}

/** VACUUM must run outside user transactions and without stale prepared statements on other handles. */
async function compactOnConnection(conn: SQLiteDatabase): Promise<void> {
  if (await conn.isInTransactionAsync()) {
    await conn.execAsync('ROLLBACK');
  }
  await conn.execAsync('PRAGMA secure_delete = ON');
  await conn.execAsync('VACUUM');
  if (Platform.OS !== 'web') {
    await conn.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
  }
}

/**
 * Native: withExclusiveTransactionAsync gives each transaction its own connection so unrelated queries
 * cannot interleave. Web does not support it, so transactions are serialized through a promise chain.
 */
export function createExpoDriver(db: SQLiteDatabase): SqlDriver {
  let chain: Promise<unknown> = Promise.resolve();
  const base = ops(db);

  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const p = chain.then(task, task);
    chain = p.catch(() => undefined);
    return p;
  };

  async function compactFreelist(): Promise<boolean> {
    return serialize(async () => {
      try {
        if (Platform.OS === 'web') {
          await compactOnConnection(db);
          return true;
        }

        const { name, directory } = splitDatabasePath(db.databasePath);
        const maint = await openDatabaseAsync(name, { useNewConnection: true }, directory);
        try {
          await compactOnConnection(maint);
          return true;
        } finally {
          await maint.closeAsync();
        }
      } catch (first) {
        try {
          await compactOnConnection(db);
          return true;
        } catch (second) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[sqlite] compactFreelist failed', first, second);
          }
          return false;
        }
      }
    });
  }

  return {
    ...base,
    compactFreelist,
    transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
      return serialize(async () => {
        let result: T | undefined;
        if (Platform.OS === 'web') {
          const tx: SqlDriver = {
            ...base,
            compactFreelist,
            transaction: (inner) => inner(tx),
          };
          await db.withTransactionAsync(async () => {
            result = await fn(tx);
          });
        } else {
          await db.withExclusiveTransactionAsync(async (txn) => {
            const tx: SqlDriver = {
              ...ops(txn),
              compactFreelist,
              transaction: (inner) => inner(tx),
            };
            result = await fn(tx);
          });
        }
        return result as T;
      });
    },
  };
}
