import * as Crypto from 'expo-crypto';

import { toHex } from './types';

const PREFIX = 'akasheet-import:';

const vault = new Map<string, Uint8Array<ArrayBufferLike>>();

export function isImportStageUri(uri: string): boolean {
  return uri.startsWith(PREFIX);
}

/** In-memory import staging (no plaintext temp files on disk). */
export async function stageImportInMemory(bytes: Uint8Array<ArrayBufferLike>): Promise<string> {
  const rnd = await Crypto.getRandomBytes(8);
  const uri = `${PREFIX}${toHex(rnd.buffer as ArrayBuffer)}`;
  vault.set(uri, new Uint8Array(bytes));
  return uri;
}

export function readImportStage(uri: string): Uint8Array<ArrayBufferLike> | null {
  return vault.get(uri) ?? null;
}

export function discardImportStage(uri: string): void {
  vault.delete(uri);
}
