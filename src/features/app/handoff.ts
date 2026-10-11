/** In-memory value handed from one route to the next (too large or too transient for route params). */
export function createHandoff<T>() {
  let value: T | null = null;
  return {
    set(v: T) {
      value = v;
    },
    peek(): T | null {
      return value;
    },
    take(): T | null {
      const v = value;
      value = null;
      return v;
    },
  };
}
