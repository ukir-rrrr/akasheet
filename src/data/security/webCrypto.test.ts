import { createHash } from 'node:crypto';

import { importAesKey, sealString, openString } from './aead';
import { ensureWebCrypto } from './webCrypto';

describe('ensureWebCrypto', () => {
  it('provides subtle when missing so AEAD works', async () => {
    const saved = globalThis.crypto;
    const subtle = saved?.subtle;
    try {
      Object.defineProperty(globalThis, 'crypto', {
        value: {
          getRandomValues: (a: Uint8Array<ArrayBuffer>) => saved!.getRandomValues(a),
        },
        configurable: true,
      });
      ensureWebCrypto();
      expect(globalThis.crypto.subtle).toBeTruthy();
      const key = await importAesKey(createHash('sha256').update('poly').digest());
      const sealed = await sealString(key, 'hello');
      expect(await openString(key, sealed)).toBe('hello');
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: saved, configurable: true });
      if (subtle && saved && !saved.subtle) {
        Object.defineProperty(saved, 'subtle', { value: subtle, configurable: true });
      }
    }
  });
});
