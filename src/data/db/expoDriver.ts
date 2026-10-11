import { Platform } from 'react-native';
import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

import type { SqlDriver, SqlParam } from './driver';

type Executor = Pick<SQLiteDatabase, 'execAsync' | 'runAsync' | 'getAllAsync' | 'getFirstAsync'>;

function ops(x: Executor): Omit<SqlDriver, 'transaction'> {
  const bind = (p: readonly SqlParam[]) => p as SQLiteBindValue[];
  return {
    exec: (sql) => x.execAsync(sql),
    run: async (sql, params = []) => ({ changes: (await x.runAsync(sql, bind(params))).changes }),
    all: <T>(sql: string, params: readonly SqlParam[] = []) => x.getAllAsync<T>(sql, bind(params)),
    get: async <T>(sql: string, params: readonly SqlParam[] = []) => (await x.getFirstAsync<T>(sql, bind(params))) ?? null,
  };
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

  return {
    ...base,
    transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T> {
      return serialize(async () => {
        let result: T | undefined;
        if (Platform.OS === 'web') {
          const tx: SqlDriver = { ...base, transaction: (inner) => inner(tx) };
          await db.withTransactionAsync(async () => {
            result = await fn(tx);
          });
        } else {
          await db.withExclusiveTransactionAsync(async (txn) => {
            const tx: SqlDriver = { ...ops(txn), transaction: (inner) => inner(tx) };
            result = await fn(tx);
          });
        }
        return result as T;
      });
    },
  };
}
