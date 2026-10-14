// Metro/Hermes cannot resolve `node:fs` in sql.js's default entry; use the browser WASM build.
import initSqlJs from 'sql.js/dist/sql-wasm-browser.js';
import type { Database } from 'sql.js';

let sqlPromise: ReturnType<typeof initSqlJs> | null = null;
let wasmLocalUri: string | null | undefined;

async function loadBundledWasmAsset(): Promise<string> {
  const { Asset } = await import('expo-asset');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sqlWasmAsset = require('../../../assets/sql/sql-wasm.wasm');
  const asset = Asset.fromModule(sqlWasmAsset);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error('sql-wasm asset has no URI');
  return uri;
}

async function resolveWasmUri(): Promise<string> {
  if (wasmLocalUri !== undefined) {
    if (wasmLocalUri) return wasmLocalUri;
    return require.resolve('sql.js/dist/sql-wasm.wasm');
  }

  if (typeof process !== 'undefined' && process.env.JEST_WORKER_ID) {
    wasmLocalUri = null;
    return require.resolve('sql.js/dist/sql-wasm.wasm');
  }

  try {
    wasmLocalUri = await loadBundledWasmAsset();
  } catch {
    wasmLocalUri = null;
  }
  if (wasmLocalUri) return wasmLocalUri;
  return require.resolve('sql.js/dist/sql-wasm.wasm');
}

async function getSql() {
  if (!sqlPromise) {
    const wasmUri = await resolveWasmUri();
    sqlPromise = initSqlJs({
      locateFile: (file: string) => {
        if (file.endsWith('.wasm')) return wasmUri;
        return require.resolve(`sql.js/dist/${file}`);
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
