import Constants from 'expo-constants';

export const BUILD_ID_UNKNOWN = 'unknown';

export type BuildMeta = {
  commitSha: string;
  dirty: boolean;
  version: string;
};

/** Normalize env / git output to a 7-char lowercase hex SHA or `unknown`. */
export function normalizeCommitSha(raw: string | null | undefined): string {
  if (raw == null || typeof raw !== 'string') return BUILD_ID_UNKNOWN;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed === BUILD_ID_UNKNOWN) return BUILD_ID_UNKNOWN;
  const head = trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-f]{7}$/.test(head)) return head;
  if (/^[0-9a-f]{40}$/.test(head)) return head.slice(0, 7);
  if (head.length >= 7 && /^[0-9a-f]+$/.test(head.slice(0, 7))) return head.slice(0, 7);
  return BUILD_ID_UNKNOWN;
}

function readExtraRecord(): Record<string, unknown> | undefined {
  const extra = Constants.expoConfig?.extra;
  return extra && typeof extra === 'object' ? (extra as Record<string, unknown>) : undefined;
}

function readDirtyFromExtra(extra: Record<string, unknown> | undefined): boolean {
  if (!extra) return false;
  const v = extra.buildDirty;
  return v === true || v === 'true' || v === 1 || v === '1';
}

function readShaFromExtra(extra: Record<string, unknown> | undefined): string | undefined {
  const v = extra?.buildCommitSha;
  return typeof v === 'string' ? v : undefined;
}

/** Runtime build metadata baked into the bundle via app config `extra` (and optional public env). */
export function readBuildMeta(): BuildMeta {
  const extra = readExtraRecord();
  const commitSha = normalizeCommitSha(readShaFromExtra(extra));
  const dirty = readDirtyFromExtra(extra);
  const version =
    (typeof Constants.expoConfig?.version === 'string' && Constants.expoConfig.version) || '0.0.0';
  return { commitSha, dirty, version };
}

export function formatBuildCaption(meta: BuildMeta): string {
  const shaPart =
    meta.dirty && meta.commitSha !== BUILD_ID_UNKNOWN ? `${meta.commitSha}+dirty` : meta.commitSha;
  return `${shaPart} · v${meta.version}`;
}

export function formatBuildAccessibilityLabel(meta: BuildMeta): string {
  const base = meta.commitSha === BUILD_ID_UNKNOWN ? 'ビルド不明' : `ビルド ${meta.commitSha}`;
  if (meta.dirty && meta.commitSha !== BUILD_ID_UNKNOWN) {
    return `${base}（未コミットの変更あり）`;
  }
  return base;
}
