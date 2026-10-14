import { importAesKey } from './aead';

const SECURE_KEY = 'akasheet.dek.v1';
const WEB_KV_KEY = 'akasheet:dek.v1';

export type DekStorage = 'secure-store' | 'web-kv';

export type DataKey =
  { ok: true; key: CryptoKey; storage: DekStorage } | { ok: false; reason: 'unavailable' };

export type DekDeps = {
  platformOs: string;
  isSecureAvailable: () => Promise<boolean>;
  secureGet: (key: string) => Promise<string | null>;
  secureSet: (key: string, value: string) => Promise<void>;
  webKvGet: (key: string) => Promise<string | null>;
  webKvSet: (key: string, value: string) => Promise<void>;
  randomBytes: (n: number) => Uint8Array;
  /** When true, a missing DEK must not be replaced with a new random key. */
  hasProtectedData?: () => Promise<boolean>;
};

function b64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(text: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(text, 'base64'));
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function mustNotCreateFreshKey(deps: DekDeps): Promise<boolean> {
  return deps.hasProtectedData ? await deps.hasProtectedData() : false;
}

/** Loads a 256-bit DEK from Secure Store (native) or the web KV fallback. */
export async function loadOrCreateDataKey(deps: DekDeps): Promise<DataKey> {
  if (deps.platformOs === 'web') {
    const existing = await deps.webKvGet(WEB_KV_KEY);
    if (!existing) {
      if (await mustNotCreateFreshKey(deps)) return { ok: false, reason: 'unavailable' };
      const raw = deps.randomBytes(32);
      await deps.webKvSet(WEB_KV_KEY, b64(raw));
      return { ok: true, key: await importAesKey(raw), storage: 'web-kv' };
    }
    return { ok: true, key: await importAesKey(fromB64(existing)), storage: 'web-kv' };
  }

  if (!(await deps.isSecureAvailable())) return { ok: false, reason: 'unavailable' };

  let encoded = await deps.secureGet(SECURE_KEY);
  if (!encoded) {
    if (await mustNotCreateFreshKey(deps)) return { ok: false, reason: 'unavailable' };
    encoded = b64(deps.randomBytes(32));
    await deps.secureSet(SECURE_KEY, encoded);
  }
  return { ok: true, key: await importAesKey(fromB64(encoded)), storage: 'secure-store' };
}
