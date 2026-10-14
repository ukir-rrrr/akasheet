import { unzipSync } from 'fflate';

export type NamedBytes = ReadonlyMap<string, Uint8Array>;

/** Unzips an archive into a path → bytes map (paths normalized, no leading `./`). */
export function unzipToMap(bytes: Uint8Array): NamedBytes {
  const raw = unzipSync(bytes);
  const map = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(raw)) {
    const key = path.replace(/^\.\//, '').replace(/\\/g, '/');
    map.set(key, data);
  }
  return map;
}
