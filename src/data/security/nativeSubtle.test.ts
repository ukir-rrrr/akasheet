import { createHash, webcrypto } from 'node:crypto';

import { createNativeSubtleCrypto } from './nativeSubtle';

describe('createNativeSubtleCrypto', () => {
  it('matches Node WebCrypto AES-GCM ciphertext', async () => {
    const raw = createHash('sha256').update('interop').digest();
    const plain = new Uint8Array([1, 2, 3, 4, 5]);
    const iv = new Uint8Array(12).fill(7);

    const nodeKey = await webcrypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const nodeCipher = new Uint8Array(
      await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, nodeKey, plain),
    );

    const subtle = createNativeSubtleCrypto();
    const nativeKey = await subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const nativeCipher = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, nativeKey, plain));
    expect([...nativeCipher]).toEqual([...nodeCipher]);

    const nativePlain = new Uint8Array(
      await subtle.decrypt({ name: 'AES-GCM', iv }, nativeKey, nativeCipher),
    );
    expect([...nativePlain]).toEqual([...plain]);
  });

  it('rejects unsupported algorithms and unknown keys', async () => {
    const subtle = createNativeSubtleCrypto();
    const raw = new Uint8Array(32);

    await expect(
      subtle.importKey('pkcs8', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt']),
    ).rejects.toMatchObject({ name: 'NotSupportedError' });
    await expect(
      subtle.importKey('raw', new Uint8Array(16), { name: 'AES-GCM', length: 256 }, false, ['encrypt']),
    ).rejects.toMatchObject({ name: 'DataError' });
    await expect(subtle.importKey('raw', raw, { name: 'AES-CBC' }, false, ['encrypt'])).rejects.toMatchObject(
      { name: 'NotSupportedError' },
    );

    const key = await subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const bogusKey = { algorithm: { name: 'AES-GCM' } } as CryptoKey;
    const iv = new Uint8Array(12);
    const data = new Uint8Array([1]);

    await expect(subtle.encrypt({ name: 'AES-CBC', iv }, key, data)).rejects.toMatchObject({
      name: 'NotSupportedError',
    });
    await expect(subtle.encrypt({ name: 'AES-GCM', iv }, bogusKey, data)).rejects.toMatchObject({
      name: 'InvalidAccessError',
    });
    await expect(subtle.decrypt({ name: 'AES-CBC', iv }, key, data)).rejects.toMatchObject({
      name: 'NotSupportedError',
    });
    await expect(subtle.decrypt({ name: 'AES-GCM', iv }, bogusKey, data)).rejects.toMatchObject({
      name: 'InvalidAccessError',
    });
  });
});
