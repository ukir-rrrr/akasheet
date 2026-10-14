import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Storage } from 'expo-sqlite/kv-store';

import type { DekDeps } from './dek';

export const defaultDekDeps: DekDeps = {
  platformOs: Platform.OS,
  isSecureAvailable: () => SecureStore.isAvailableAsync(),
  secureGet: (k) => SecureStore.getItemAsync(k),
  secureSet: (k, v) => SecureStore.setItemAsync(k, v),
  webKvGet: (k) => Storage.getItem(k),
  webKvSet: (k, v) => Storage.setItem(k, v),
  randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
};
