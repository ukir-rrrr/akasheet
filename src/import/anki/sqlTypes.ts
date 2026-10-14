/** Minimal async SQL surface used to read an Anki collection (injected by caller). */
export type AnkiSql = {
  get<T>(sql: string, params?: readonly unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
};
