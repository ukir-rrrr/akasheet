import { File, Paths } from 'expo-file-system';

/** Writes import image bytes to cache and returns a file URI for `prepareImage`. */
export async function writeImportImageBytes(
  bytes: Uint8Array,
  fileName: string,
  now: number,
): Promise<string> {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const file = new File(Paths.cache, `import-${now}-${safe}`);
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}
