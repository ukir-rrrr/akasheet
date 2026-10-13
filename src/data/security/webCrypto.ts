/** Ensures `globalThis.crypto.subtle` exists (Hermes / older RN lack WebCrypto). */
export function ensureWebCrypto(): void {
  if (globalThis.crypto?.subtle) return;

  // Modern browsers expose subtle; avoid pulling the polyfill into the web bundle.
  if (typeof document !== 'undefined') return;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Crypto } = require('@peculiar/webcrypto') as typeof import('@peculiar/webcrypto');
  const polyfill = new Crypto();
  Object.defineProperty(globalThis, 'crypto', {
    value: polyfill,
    configurable: true,
    writable: true,
  });
}

ensureWebCrypto();
