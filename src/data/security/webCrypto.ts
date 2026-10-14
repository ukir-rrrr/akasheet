/** Ensures `globalThis.crypto.subtle` exists (Hermes / older RN lack WebCrypto). */
export function ensureWebCrypto(): void {
  if (globalThis.crypto?.subtle) return;

  // Modern browsers expose subtle; avoid pulling the native polyfill into the web bundle.
  if (typeof document !== 'undefined') return;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createNativeSubtleCrypto } = require('./nativeSubtle') as typeof import('./nativeSubtle');
  const subtle = createNativeSubtleCrypto();

  if (globalThis.crypto) {
    Object.defineProperty(globalThis.crypto, 'subtle', {
      value: subtle,
      configurable: true,
      writable: true,
    });
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getRandomBytes } = require('expo-crypto') as typeof import('expo-crypto');

  Object.defineProperty(globalThis, 'crypto', {
    value: {
      getRandomValues<T extends ArrayBufferView>(array: T): T {
        const bytes = getRandomBytes(array.byteLength);
        const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
        view.set(bytes);
        return array;
      },
      subtle,
    },
    configurable: true,
    writable: true,
  });
}

ensureWebCrypto();
