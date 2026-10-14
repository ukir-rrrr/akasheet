import Constants from 'expo-constants';

import {
  BUILD_ID_UNKNOWN as SCRIPT_UNKNOWN,
  normalizeCommitSha as normalizeCommitShaFromScript,
} from '../../scripts/normalizeCommitSha';

export const BUILD_ID_UNKNOWN = SCRIPT_UNKNOWN;

export type BuildMeta = {
  commitSha: string;
  dirty: boolean;
  version: string;
};

/** Normalize env / git output to a 7-char lowercase hex SHA or `unknown`. */
export function normalizeCommitSha(raw: string | null | undefined): string {
  return normalizeCommitShaFromScript(raw);
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

/** Runtime build metadata baked into the bundle via app config `extra`. */
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
