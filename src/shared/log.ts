import { errorMessage } from './errors';

export type MediaGcStep = 'validate-key' | 'delete-file';

/** Logs a per-item media GC failure without interrupting the rest of cleanup. */
export function logMediaGcFailure(details: { step: MediaGcStep; key: string; error: unknown }): void {
  console.warn(`[media-gc] ${details.step} failed`, {
    key: details.key,
    error: errorMessage(details.error),
    cause: details.error,
  });
}

/** Logs when startup maintenance (DB purge + file GC) fails as a whole; the app still opens. */
export function logMaintenanceFailure(error: unknown): void {
  console.warn('[media-gc] maintenance failed', {
    error: errorMessage(error),
    cause: error,
  });
}
