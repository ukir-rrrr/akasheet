import { createHash, webcrypto } from 'node:crypto';

import { importAesKey, sealString } from './aead';
import { READ_ONLY_SEALED_PLACEHOLDER, readOnlyFieldProtector } from './fieldProtector';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
});

describe('readOnlyFieldProtector', () => {
  it('masks sealed values and leaves plaintext untouched', async () => {
    const key = await importAesKey(createHash('sha256').update('r').digest());
    const sealed = await sealString(key, 'タイトル');
    expect(await readOnlyFieldProtector.open(sealed)).toBe(READ_ONLY_SEALED_PLACEHOLDER);
    expect(await readOnlyFieldProtector.open('平文')).toBe('平文');
  });
});
