import initSqlJs, { type Database } from 'sql.js';

let sqlPromise: ReturnType<typeof initSqlJs> | null = null;

async function getSql() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: (file: string) => {
        try {
          // Jest / Node
          return require.resolve(`sql.js/dist/${file}`);
        } catch {
          return `https://sql.js.org/dist/${file}`;
        }
      },
    });
  }
  return sqlPromise;
}

export async function openAnkiDb(bytes: Uint8Array): Promise<Database> {
  const SQL = await getSql();
  return new SQL.Database(bytes);
}

export function queryAll<T extends Record<string, unknown>>(db: Database, sql: string): T[] {
  const stmt = db.prepare(sql);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

export function queryGet<T extends Record<string, unknown>>(db: Database, sql: string): T | null {
  const rows = queryAll<T>(db, sql);
  return rows[0] ?? null;
}
