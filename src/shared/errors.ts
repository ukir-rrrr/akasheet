export class ValidationError extends Error {
  override name = 'ValidationError';
}

export class StorageError extends Error {
  override name = 'StorageError';
}

export class MissingAssetError extends Error {
  override name = 'MissingAssetError';
}

/** Local data cannot be written because the device key is unavailable (read-only mode). */
export class DataProtectionError extends Error {
  override name = 'DataProtectionError';
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
