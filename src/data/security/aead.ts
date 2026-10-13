import './webCrypto';

/** AES-256-GCM wire format shared by on-disk media and sealed DB text fields. */

export const FILE_MAGIC = new Uint8Array([0x41, 0x4b, 0x53, 0x48, 0x31]); // "AKSH1"
export const IV_BYTES = 12;
export const FIELD_PREFIX = 'enc1:';

export function isEncryptedBlob(bytes: Uint8Array): boolean {
  return bytes.byteLength >= FILE_MAGIC.length + IV_BYTES + 1 && FILE_MAGIC.every((b, i) => bytes[i] === b);
}

/** Plain JPEG files start with FF D8 FF (legacy, pre-migration). */
export function isPlainJpeg(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function isSealedField(value: string): boolean {
  return value.startsWith(FIELD_PREFIX);
}

/** `enc1:` prefix plus a well-formed AKSH1 payload (not accidental plaintext). */
export function isValidSealedField(value: string): boolean {
  if (!isSealedField(value)) return false;
  try {
    return isEncryptedBlob(b64Decode(value.slice(FIELD_PREFIX.length)));
  } catch {
    return false;
  }
}

function asBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.byteLength !== 32) throw new Error('DEK must be 32 bytes');
  return crypto.subtle.importKey('raw', asBufferSource(raw), { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptBytes(key: CryptoKey, plain: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, asBufferSource(plain)),
  );
  const out = new Uint8Array(FILE_MAGIC.length + IV_BYTES + cipher.byteLength);
  out.set(FILE_MAGIC, 0);
  out.set(iv, FILE_MAGIC.length);
  out.set(cipher, FILE_MAGIC.length + IV_BYTES);
  return out;
}

export async function decryptBytes(key: CryptoKey, packed: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  if (!isEncryptedBlob(packed)) throw new Error('not an encrypted blob');
  const iv = asBufferSource(packed.subarray(FILE_MAGIC.length, FILE_MAGIC.length + IV_BYTES));
  const cipher = packed.subarray(FILE_MAGIC.length + IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, asBufferSource(cipher));
  return new Uint8Array(plain);
}

function b64Encode(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64Decode(text: string): Uint8Array<ArrayBuffer> {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(text, 'base64'));
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sealString(key: CryptoKey, plain: string): Promise<string> {
  const bytes = new TextEncoder().encode(plain);
  const packed = await encryptBytes(key, bytes);
  return FIELD_PREFIX + b64Encode(packed);
}

export async function openString(key: CryptoKey, stored: string): Promise<string> {
  if (!isSealedField(stored)) return stored;
  const packed = b64Decode(stored.slice(FIELD_PREFIX.length));
  const plain = await decryptBytes(key, packed);
  return new TextDecoder().decode(plain);
}
