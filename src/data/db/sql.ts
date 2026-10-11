/** SQLite default max bind variables is 999; stay below that for `IN (...)` lists. */
export const SQLITE_IN_CHUNK = 400;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
