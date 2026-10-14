import { createHash } from 'node:crypto';

import { importAesKey, sealString, openString } from './aead';
import { ensureWebCrypto } from './webCrypto';

jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => new Uint8Array(n).fill(9),
}));

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

  it('bootstraps crypto from expo-crypto when global crypto is absent', () => {
    const saved = globalThis.crypto;
    try {
      Reflect.deleteProperty(globalThis, 'crypto');
      ensureWebCrypto();
      const buf = new Uint8Array(4);
      globalThis.crypto.getRandomValues(buf);
      expect(buf.every((b) => b === 9)).toBe(true);
      expect(globalThis.crypto.subtle).toBeTruthy();
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: saved, configurable: true });
    }
  });
});
