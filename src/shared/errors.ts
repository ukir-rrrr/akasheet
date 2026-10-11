export class ValidationError extends Error {
  override name = 'ValidationError';
}

export class StorageError extends Error {
  override name = 'StorageError';
}

export class MissingAssetError extends Error {
  override name = 'MissingAssetError';
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
