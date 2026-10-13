import { createHash, webcrypto } from 'node:crypto';

import {
  decryptBytes,
  encryptBytes,
  FIELD_PREFIX,
  importAesKey,
  isEncryptedBlob,
  isPlainJpeg,
  isSealedField,
  isValidSealedField,
  openString,
  sealString,
} from './aead';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
});

async function testKey() {
  return importAesKey(createHash('sha256').update('test-dek').digest());
}

describe('aead', () => {
  it('round-trips binary blobs with AKSH1 framing', async () => {
    const key = await testKey();
    const plain = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    expect(isPlainJpeg(plain)).toBe(true);
    const enc = await encryptBytes(key, plain);
    expect(isEncryptedBlob(enc)).toBe(true);
    expect(isPlainJpeg(enc)).toBe(false);
    const back = await decryptBytes(key, enc);
    expect([...back]).toEqual([...plain]);
  });

  it('seals and opens empty strings', async () => {
    const key = await testKey();
    expect(await openString(key, await sealString(key, ''))).toBe('');
  });

  it('rejects accidental enc1: plaintext as sealed', async () => {
    expect(isValidSealedField('enc1:not-valid-base64-payload')).toBe(false);
    expect(isValidSealedField('plain')).toBe(false);
  });

  it('seals and opens text fields', async () => {
    const key = await testKey();
    const sealed = await sealString(key, '{"v":1}');
    expect(isSealedField(sealed)).toBe(true);
    expect(sealed.startsWith(FIELD_PREFIX)).toBe(true);
    expect(await openString(key, sealed)).toBe('{"v":1}');
    expect(await openString(key, 'plain')).toBe('plain');
  });
});
