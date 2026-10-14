import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { StorageError } from '@/shared/errors';

import { encodeJpeg } from './encodeJpeg';
import type { MediaBackend } from './store';
import { assertSafeMediaKey, MEDIA_ROOTS, toHex } from './types';

/** Native: files under documentDirectory (iOS changes the container path between installs, keys stay relative). */
function listFiles(dir: Directory, prefix: string, out: string[]) {
  if (!dir.exists) return;
  for (const entry of dir.list()) {
    const rel = `${prefix}/${entry.name}`;
    if (entry instanceof Directory) listFiles(entry, rel, out);
    else out.push(rel);
  }
}

export const platformBackend: MediaBackend = {
  encodeJpeg: (uri, maxSide, quality) => encodeJpeg(uri, maxSide, quality, false),
  async stageImport(bytes, mime) {
    const dir = new Directory(Paths.cache, 'import');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const rnd = await Crypto.getRandomBytes(8);
    const f = new File(dir, `stg-${toHex(rnd.buffer as ArrayBuffer)}.${ext}`);
    f.write(new Uint8Array(bytes));
    return f.uri;
  },
  async discardStage(uri) {
    const f = new File(uri);
    if (f.exists) f.delete();
  },
  readBytes: (uri) => new File(uri).bytes(),
  sha256: async (bytes) => toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes)),
  async putIfAbsent(key, srcUri) {
    assertSafeMediaKey(key);
    const dest = new File(Paths.document, key);
    if (dest.exists) return false;
    const dir = dest.parentDirectory;
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    await new File(srcUri).copy(dest);
    return true;
  },
  async remove(key) {
    assertSafeMediaKey(key);
    const f = new File(Paths.document, key);
    if (f.exists) f.delete();
  },
  async keys() {
    const out: string[] = [];
    for (const root of MEDIA_ROOTS) listFiles(new Directory(Paths.document, root), root, out);
    return out;
  },
  async uriFor(key) {
    assertSafeMediaKey(key);
    const f = new File(Paths.document, key);
    return f.exists ? f.uri : null;
  },
  assertCapacity(bytes) {
    if (Paths.availableDiskSpace < bytes) {
      throw new StorageError(
        '端末の空き容量が足りません。不要なファイルを削除してからもう一度お試しください。',
      );
    }
  },
};
