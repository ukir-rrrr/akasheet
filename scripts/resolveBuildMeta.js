/**
 * Resolves git commit metadata at Expo config / Metro start time.
 * Safe when .git is missing (tarballs): returns commitSha "unknown".
 */

const { execSync } = require('child_process');

const SHORT_LEN = 7;
const UNKNOWN = 'unknown';

/** @param {string | undefined | null} raw */
function normalizeCommitSha(raw) {
  if (raw == null || typeof raw !== 'string') return UNKNOWN;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed === UNKNOWN) return UNKNOWN;
  const head = trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-f]{7}$/.test(head)) return head;
  if (/^[0-9a-f]{40}$/.test(head)) return head.slice(0, SHORT_LEN);
  if (head.length >= SHORT_LEN && /^[0-9a-f]+$/.test(head.slice(0, SHORT_LEN))) {
    return head.slice(0, SHORT_LEN);
  }
  return UNKNOWN;
}

function envTruthy(v) {
  return v === '1' || v === 'true' || v === 'yes';
}

function readGitShortSha() {
  return execSync('git rev-parse --short=7 HEAD', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function readGitDirty() {
  const out = execSync('git status --porcelain', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return out.trim().length > 0;
}

/**
 * @returns {{ commitSha: string; dirty: boolean }}
 */
function resolveBuildMeta() {
  const fromEnv =
    process.env.EXPO_PUBLIC_BUILD_COMMIT_SHA || process.env.BUILD_COMMIT_SHA || process.env.GIT_COMMIT;
  if (fromEnv) {
    return {
      commitSha: normalizeCommitSha(fromEnv),
      dirty:
        envTruthy(process.env.EXPO_PUBLIC_BUILD_DIRTY) ||
        envTruthy(process.env.BUILD_DIRTY) ||
        (() => {
          try {
            return readGitDirty();
          } catch {
            return false;
          }
        })(),
    };
  }

  try {
    const sha = normalizeCommitSha(readGitShortSha());
    const dirty = readGitDirty();
    return { commitSha: sha, dirty };
  } catch {
    return { commitSha: UNKNOWN, dirty: false };
  }
}

module.exports = { resolveBuildMeta, normalizeCommitSha, UNKNOWN, SHORT_LEN };
