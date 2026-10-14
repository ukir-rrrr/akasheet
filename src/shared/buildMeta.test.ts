import { execSync } from 'node:child_process';
import { join } from 'node:path';

import { normalizeCommitSha as normalizeCommitShaScript } from '../../scripts/normalizeCommitSha';

import {
  BUILD_ID_UNKNOWN,
  formatBuildAccessibilityLabel,
  formatBuildCaption,
  normalizeCommitSha,
  readBuildMeta,
} from './buildMeta';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '1.0.0',
      extra: { buildCommitSha: 'abcdef0', buildDirty: false },
    },
  },
}));

describe('normalizeCommitSha', () => {
  it('matches the shared scripts/normalizeCommitSha module', () => {
    const samples = ['AbCdEf0', 'xyzzy', '', '0123456789abcdef0123456789abcdef01234567'];
    for (const s of samples) {
      expect(normalizeCommitSha(s)).toBe(normalizeCommitShaScript(s));
    }
  });

  it('accepts 7-char hex', () => {
    expect(normalizeCommitSha('AbCdEf0')).toBe('abcdef0');
  });

  it('truncates full sha', () => {
    expect(normalizeCommitSha('0123456789abcdef0123456789abcdef01234567')).toBe('0123456');
  });

  it('falls back to unknown for garbage', () => {
    expect(normalizeCommitSha('')).toBe(BUILD_ID_UNKNOWN);
    expect(normalizeCommitSha('not-a-sha')).toBe(BUILD_ID_UNKNOWN);
    expect(normalizeCommitSha(undefined)).toBe(BUILD_ID_UNKNOWN);
  });
});

describe('formatBuildCaption', () => {
  it('shows version and optional dirty suffix', () => {
    expect(formatBuildCaption({ commitSha: '1a2b3c4', dirty: false, version: '1.0.0' })).toBe(
      '1a2b3c4 · v1.0.0',
    );
    expect(formatBuildCaption({ commitSha: '1a2b3c4', dirty: true, version: '2.0.0' })).toBe(
      '1a2b3c4+dirty · v2.0.0',
    );
    expect(formatBuildCaption({ commitSha: BUILD_ID_UNKNOWN, dirty: true, version: '1.0.0' })).toBe(
      'unknown · v1.0.0',
    );
  });
});

describe('formatBuildAccessibilityLabel', () => {
  it('uses Japanese labels', () => {
    expect(formatBuildAccessibilityLabel({ commitSha: '1a2b3c4', dirty: false, version: '1' })).toBe(
      'ビルド 1a2b3c4',
    );
    expect(formatBuildAccessibilityLabel({ commitSha: BUILD_ID_UNKNOWN, dirty: false, version: '1' })).toBe(
      'ビルド不明',
    );
    expect(formatBuildAccessibilityLabel({ commitSha: '1a2b3c4', dirty: true, version: '1' })).toBe(
      'ビルド 1a2b3c4（未コミットの変更あり）',
    );
  });
});

describe('readBuildMeta', () => {
  it('reads from mocked expo extra', () => {
    expect(readBuildMeta()).toEqual({ commitSha: 'abcdef0', dirty: false, version: '1.0.0' });
  });
});

describe('resolveBuildMeta (config time)', () => {
  const root = join(__dirname, '..', '..');

  function runResolveBuildMeta() {
    const out = execSync(
      `node -e "const { resolveBuildMeta, normalizeCommitSha } = require('./scripts/resolveBuildMeta'); console.log(JSON.stringify({ meta: resolveBuildMeta(), norm: normalizeCommitSha('FEEDBAC'), bad: normalizeCommitSha('xyzzy') }));"`,
      { cwd: root, encoding: 'utf8' },
    );
    return JSON.parse(out.trim()) as {
      meta: { commitSha: string; dirty: boolean };
      norm: string;
      bad: string;
    };
  }

  it('normalizes via script and resolves git or unknown', () => {
    const { meta, norm, bad } = runResolveBuildMeta();
    expect(norm).toBe('feedbac');
    expect(bad).toBe('unknown');
    expect(meta.commitSha).toMatch(/^(unknown|[0-9a-f]{7})$/);
    expect(typeof meta.dirty).toBe('boolean');
  });

  it('ignores invalid env SHA and falls back to git', () => {
    const out = execSync(
      `node -e "process.env.EXPO_PUBLIC_BUILD_COMMIT_SHA='not-a-sha'; const { resolveBuildMeta } = require('./scripts/resolveBuildMeta'); console.log(resolveBuildMeta().commitSha);"`,
      { cwd: root, encoding: 'utf8' },
    );
    const sha = out.trim();
    expect(sha).toMatch(/^[0-9a-f]{7}$/);
    expect(sha).not.toBe('unknown');
  });
});
