import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

import type { ImportPick } from '@/import/detect';
import { ValidationError } from '@/shared/errors';

function ext(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

async function readUri(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }
  const { File } = await import('expo-file-system');
  return new File(uri).bytes();
}

export async function pickImportFile(): Promise<ImportPick | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ['application/octet-stream', 'application/zip', 'text/csv', 'text/comma-separated-values', '*/*'],
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const name = asset.name ?? 'import';
  const e = ext(name);

  if (e === 'apkg') {
    const bytes = await readUri(asset.uri);
    return { kind: 'apkg', name, bytes };
  }
  if (e === 'zip') {
    const bytes = await readUri(asset.uri);
    return { kind: 'zip', name, bytes };
  }
  if (e === 'csv') {
    const bytes = await readUri(asset.uri);
    const text = new TextDecoder().decode(bytes);
    return { kind: 'csv', name, text };
  }
  throw new ValidationError(
    `この形式は取り込めません（.${e || '不明'}）。.apkg / .csv / .zip を選んでください`,
  );
}
