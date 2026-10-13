import type { MediaBackend } from '../media/store';
import { assertSafeMediaKey } from '../media/types';
import { encryptBytes, isEncryptedBlob, isPlainJpeg } from './aead';

export const WEB_WRAP_PREFIX = 'aksh:';

function b64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(text: string): Uint8Array<ArrayBuffer> {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(text, 'base64'));
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function storedBytes(
  inner: MediaBackend,
  mediaKey: string,
  platformOs: string,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const uri = await inner.uriFor(mediaKey);
  if (uri === null) return null;
  if (platformOs === 'web' && uri.startsWith(WEB_WRAP_PREFIX)) {
    return fromB64(uri.slice(WEB_WRAP_PREFIX.length));
  }
  return inner.readBytes(uri);
}

/** Re-encrypts legacy plaintext blobs in place (idempotent). */
export async function encryptMediaFileInPlace(
  inner: MediaBackend,
  key: CryptoKey,
  mediaKey: string,
  platformOs: string,
): Promise<boolean> {
  assertSafeMediaKey(mediaKey);
  const raw = await storedBytes(inner, mediaKey, platformOs);
  if (raw === null) return false;
  if (isEncryptedBlob(raw)) return false;
  if (!isPlainJpeg(raw)) return false;

  const enc = await encryptBytes(key, raw);

  if (platformOs === 'web') {
    await inner.remove(mediaKey);
    await inner.putIfAbsent(mediaKey, WEB_WRAP_PREFIX + b64(enc));
    return true;
  }

  const { File, Paths } = await import('expo-file-system');
  const { Storage } = await import('expo-sqlite/kv-store');
  const dest = new File(Paths.document, mediaKey);
  if (!dest.exists) return false;
  const tmp = new File(Paths.cache, `akasheet-migrate-${mediaKey.replace(/\//g, '_')}.tmp`);
  const tmpDir = tmp.parentDirectory;
  if (!tmpDir.exists) tmpDir.create({ intermediates: true, idempotent: true });
  tmp.write(enc);
  dest.delete();
  tmp.copy(dest);
  tmp.delete();
  await Storage.removeItem(`akasheet-decrypt:${mediaKey}`);
  return true;
}

export { b64, fromB64 };
