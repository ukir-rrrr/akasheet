import { webcrypto } from 'node:crypto';

import { loadOrCreateDataKey, type DekDeps } from './dek';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
});

function deps(over: Partial<DekDeps> = {}): DekDeps {
  const web = new Map<string, string>();
  return {
    platformOs: 'web',
    isSecureAvailable: async () => false,
    secureGet: async () => null,
    secureSet: async () => undefined,
    webKvGet: async (k) => web.get(k) ?? null,
    webKvSet: async (k, v) => void web.set(k, v),
    randomBytes: (n) => Uint8Array.from({ length: n }, (_, i) => i + 1),
    ...over,
  };
}

describe('loadOrCreateDataKey', () => {
  it('persists a web KV key', async () => {
    const d = deps();
    const a = await loadOrCreateDataKey(d);
    expect(a.ok).toBe(true);
    const stored = await d.webKvGet('akasheet:dek.v1');
    expect(stored).toBeTruthy();
    const b = await loadOrCreateDataKey(d);
    expect(b.ok).toBe(true);
    expect(await d.webKvGet('akasheet:dek.v1')).toBe(stored);
  });

  it('uses secure store on native when available', async () => {
    const bag = new Map<string, string>();
    const d = deps({
      platformOs: 'ios',
      isSecureAvailable: async () => true,
      secureGet: async (k) => bag.get(k) ?? null,
      secureSet: async (k, v) => void bag.set(k, v),
    });
    const first = await loadOrCreateDataKey(d);
    expect(first.ok).toBe(true);
    expect(bag.size).toBe(1);
    const encoded = [...bag.values()][0];
    const second = await loadOrCreateDataKey(d);
    expect(second.ok).toBe(true);
    expect([...bag.values()][0]).toBe(encoded);
  });

  it('returns unavailable when secure store is missing on native', async () => {
    const res = await loadOrCreateDataKey(
      deps({ platformOs: 'android', isSecureAvailable: async () => false }),
    );
    expect(res).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('does not mint a new DEK when protected data exists but the key is gone', async () => {
    const res = await loadOrCreateDataKey(
      deps({
        platformOs: 'ios',
        isSecureAvailable: async () => true,
        hasProtectedData: async () => true,
      }),
    );
    expect(res).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('does not mint a web DEK when protected data exists but KV is empty', async () => {
    const res = await loadOrCreateDataKey(
      deps({
        hasProtectedData: async () => true,
      }),
    );
    expect(res).toEqual({ ok: false, reason: 'unavailable' });
  });
});
