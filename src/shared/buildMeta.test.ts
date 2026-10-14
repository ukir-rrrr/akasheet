import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import appJson from '../../app.json';
import { normalizeCommitSha as normalizeCommitShaScript } from '../../scripts/normalizeCommitSha';

import Constants from 'expo-constants';

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
  it('uses Japanese labels with version in the caption', () => {
    expect(formatBuildAccessibilityLabel({ commitSha: '1a2b3c4', dirty: false, version: '1.0.0' })).toBe(
      'ビルド 1a2b3c4 · v1.0.0',
    );
    expect(
      formatBuildAccessibilityLabel({ commitSha: BUILD_ID_UNKNOWN, dirty: false, version: '1.0.0' }),
    ).toBe('ビルド不明 · v1.0.0');
    expect(formatBuildAccessibilityLabel({ commitSha: '1a2b3c4', dirty: true, version: '2.0.0' })).toBe(
      'ビルド 1a2b3c4 · v2.0.0（未コミットの変更あり）',
    );
  });
});

describe('readBuildMeta', () => {
  it('reads from mocked expo extra', () => {
    expect(readBuildMeta()).toEqual({ commitSha: 'abcdef0', dirty: false, version: '1.0.0' });
  });

  it('prefers buildAppVersion in extra when expoConfig.version is missing', () => {
    const config = Constants.expoConfig!;
    const prevVersion = config.version;
    const prevExtra = config.extra;
    try {
      config.version = undefined as unknown as string;
      config.extra = { buildCommitSha: 'feedbac', buildDirty: false, buildAppVersion: '1.2.3' };
      expect(readBuildMeta()).toEqual({ commitSha: 'feedbac', dirty: false, version: '1.2.3' });
    } finally {
      config.version = prevVersion;
      config.extra = prevExtra;
    }
  });
});

describe('app.config.js (config time)', () => {
  const root = join(__dirname, '..', '..');
  const expectedAppVersion = appJson.expo.version;

  it('embeds buildAppVersion alongside git metadata in extra', () => {
    const out = execSync(
      `node -e "const c = require('./app.config.js')(); console.log(JSON.stringify(c));"`,
      {
        cwd: root,
        encoding: 'utf8',
      },
    );
    const config = JSON.parse(out.trim()) as {
      version: string;
      extra: { buildAppVersion: string; buildCommitSha: string };
    };
    expect(config.version).toBe(expectedAppVersion);
    expect(config.extra.buildAppVersion).toBe(expectedAppVersion);
    expect(config.extra.buildCommitSha).toMatch(/^(unknown|[0-9a-f]{7})$/);
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

  const resolveBuildMetaInScratch = (scratch: string) => {
    const scriptPath = join(root, 'scripts', 'resolveBuildMeta.js');
    const nodeScript = `const { resolveBuildMeta } = require(${JSON.stringify(scriptPath)}); console.log(JSON.stringify(resolveBuildMeta()));`;
    const out = execSync(`node -e ${JSON.stringify(nodeScript)}`, {
      cwd: scratch,
      encoding: 'utf8',
      env: { ...process.env, BUILD_DIRTY: '', EXPO_PUBLIC_BUILD_DIRTY: '' },
    });
    return JSON.parse(out.trim()) as { dirty: boolean };
  };

  const initScratchGitRepo = (scratch: string) => {
    writeFileSync(join(scratch, 'tracked.txt'), 'ok\n');
    execSync(
      'git init -q && git add tracked.txt && git -c user.email=t@test -c user.name=t commit -q -m init',
      { cwd: scratch },
    );
  };

  it('does not mark dirty for untracked files only', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'akasheet-buildmeta-'));
    try {
      initScratchGitRepo(scratch);
      mkdirSync(join(scratch, '.tmp'), { recursive: true });
      writeFileSync(join(scratch, '.tmp', 'harness-out.txt'), 'scratch\n');
      const meta = resolveBuildMetaInScratch(scratch);
      expect(meta.dirty).toBe(false);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('marks dirty when tracked files are modified', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'akasheet-buildmeta-'));
    try {
      initScratchGitRepo(scratch);
      writeFileSync(join(scratch, 'tracked.txt'), 'changed\n');
      const meta = resolveBuildMetaInScratch(scratch);
      expect(meta.dirty).toBe(true);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
