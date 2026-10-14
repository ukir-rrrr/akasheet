import { isValidSealedField, openString, sealString } from './aead';

export const READ_ONLY_SEALED_PLACEHOLDER = '（暗号化されたデータ）';

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

/** Masks sealed DB text when the DEK cannot be loaded (read-only mode). */
export const readOnlyFieldProtector: FieldProtector = {
  seal: async () => {
    throw new Error('read-only: cannot seal fields without a data key');
  },
  open: async (stored) => (isValidSealedField(stored) ? READ_ONLY_SEALED_PLACEHOLDER : stored),
};
