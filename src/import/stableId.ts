/** Stable, content-derived import keys (pure; no platform crypto). */
export function stableImportKey(parts: readonly string[]): string {
  const payload = parts.map((p) => p.trim()).join('\u001f');
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < payload.length; i++) {
    h ^= BigInt(payload.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

export function csvExternalId(imageFile: string, title: string | null): string {
  return stableImportKey([imageFile, title ?? '']);
}
