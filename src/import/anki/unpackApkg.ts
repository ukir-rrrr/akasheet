import { strFromU8, unzipSync } from 'fflate';

export type UnpackedApkg = {
  collection: Uint8Array;
  mediaMap: Record<string, string>;
  files: Map<string, Uint8Array>;
};

/** Unzips an `.apkg` into the collection DB bytes and media file map (pure). */
export function unpackApkg(bytes: Uint8Array): UnpackedApkg {
  const entries = unzipSync(bytes);
  let collection: Uint8Array | null = null;
  const files = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(entries)) {
    files.set(name, data);
    if (name === 'collection.anki21' || name === 'collection.anki2') collection = data;
  }
  if (!collection) throw new Error('Anki パッケージに collection データが見つかりません');

  let mediaMap: Record<string, string> = {};
  const mediaIndex = files.get('media');
  if (mediaIndex) {
    try {
      mediaMap = JSON.parse(strFromU8(mediaIndex)) as Record<string, string>;
    } catch {
      mediaMap = {};
    }
  }

  return { collection, mediaMap, files };
}

export function resolveAnkiMedia(
  imageRef: string,
  mediaMap: Record<string, string>,
  files: Map<string, Uint8Array>,
): Uint8Array | null {
  const key = imageRef.replace(/^.*[/\\]/, '');
  if (files.has(key)) return files.get(key) ?? null;
  for (const [idx, name] of Object.entries(mediaMap)) {
    if (name === key || name.endsWith(`/${key}`)) return files.get(idx) ?? null;
  }
  return null;
}
