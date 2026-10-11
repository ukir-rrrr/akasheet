import { useSyncExternalStore } from 'react';

import type { ToastSpec } from '@/ui/Toast';

/** One-shot toast handed from a closing modal (e.g. the editor) to the screen underneath. */
let current: ToastSpec | null = null;
let seq = 0;
const listeners = new Set<() => void>();

export const flash = {
  show(spec: Omit<ToastSpec, 'id'>) {
    current = { ...spec, id: ++seq };
    listeners.forEach((l) => l());
  },
  clear() {
    current = null;
    listeners.forEach((l) => l());
  },
};

export function useFlash(): ToastSpec | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
