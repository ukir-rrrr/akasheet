import type { DekStorage } from './dek';

export type DataProtectionMode = 'full' | 'read-only';

export type DataProtection = {
  mode: DataProtectionMode;
  /** Where the DEK lives; null when read-only because the key could not be loaded. */
  storage: DekStorage | null;
};

export function canMutateLocalData(p: DataProtection): boolean {
  return p.mode === 'full';
}
