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

function readVersionFromExtra(extra: Record<string, unknown> | undefined): string | undefined {
  const v = extra?.buildAppVersion;
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function readAppVersion(extra: Record<string, unknown> | undefined): string {
  const fromExtra = readVersionFromExtra(extra);
  if (fromExtra) return fromExtra;
  const fromConfig = Constants.expoConfig?.version;
  if (typeof fromConfig === 'string' && fromConfig.length > 0) return fromConfig;
  return '0.0.0';
}

/** Runtime build metadata baked into the bundle via app config `extra`. */
export function readBuildMeta(): BuildMeta {
  const extra = readExtraRecord();
  const commitSha = normalizeCommitSha(readShaFromExtra(extra));
  const dirty = readDirtyFromExtra(extra);
  const version = readAppVersion(extra);
  return { commitSha, dirty, version };
}

/** Shared `… · v{version}` line; `leading` is the SHA or Japanese build prefix segment. */
function formatBuildVersionLine(leading: string, version: string): string {
  return `${leading} · v${version}`;
}

function shaPartForCaption(meta: BuildMeta): string {
  if (meta.dirty && meta.commitSha !== BUILD_ID_UNKNOWN) {
    return `${meta.commitSha}+dirty`;
  }
  return meta.commitSha;
}

function leadingForAccessibility(meta: BuildMeta): string {
  if (meta.commitSha === BUILD_ID_UNKNOWN) {
    return 'ビルド不明';
  }
  return `ビルド ${meta.commitSha}`;
}

export function formatBuildCaption(meta: BuildMeta): string {
  return formatBuildVersionLine(shaPartForCaption(meta), meta.version);
}

export function formatBuildAccessibilityLabel(meta: BuildMeta): string {
  const dirtyNote = meta.dirty ? '（未コミットの変更あり）' : '';
  return `${formatBuildVersionLine(leadingForAccessibility(meta), meta.version)}${dirtyNote}`;
}
