import type { SqlDriver } from '../db/driver';

/** Small key-value settings in `app_meta` (device id, one-off hint counters). */
export function createMetaRepo(db: SqlDriver) {
  async function get(key: string): Promise<string | null> {
    const row = await db.get<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [key]);
    return row?.value ?? null;
  }
  async function set(key: string, value: string): Promise<void> {
    await db.run(
      'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  }
  return {
    get,
    set,
    async ensureDeviceId(newId: () => string): Promise<string> {
      const existing = await get('device_id');
      if (existing) return existing;
      const id = newId();
      await set('device_id', id);
      return id;
    },
    /** Increments a counter unless it already reached `max`; true when it was incremented (i.e. "show it"). */
    async bumpCounter(key: string, max: number): Promise<boolean> {
      const n = Number((await get(key)) ?? 0);
      if (n >= max) return false;
      await set(key, String(n + 1));
      return true;
    },
  };
}

export type MetaRepo = ReturnType<typeof createMetaRepo>;
