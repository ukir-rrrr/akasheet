import { openString, sealString } from './aead';

export type FieldProtector = {
  seal(plain: string): Promise<string>;
  open(stored: string): Promise<string>;
};

export function createFieldProtector(key: CryptoKey): FieldProtector {
  return {
    seal: (plain) => sealString(key, plain),
    open: (stored) => openString(key, stored),
  };
}

/** No-op protector for unit tests that do not exercise at-rest encryption. */
export const plaintextFieldProtector: FieldProtector = {
  seal: async (plain) => plain,
  open: async (stored) => stored,
};
