/**
 * Resolves git commit metadata at Expo config / Metro start time.
 * Safe when .git is missing (tarballs): returns commitSha "unknown".
 */

const { execSync } = require('child_process');

const { normalizeCommitSha, BUILD_ID_UNKNOWN } = require('./normalizeCommitSha');

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

function resolveDirtyFlag() {
  if (envTruthy(process.env.EXPO_PUBLIC_BUILD_DIRTY) || envTruthy(process.env.BUILD_DIRTY)) {
    return true;
  }
  try {
    return readGitDirty();
  } catch {
    return false;
  }
}

function shaFromEnv() {
  const candidates = [
    process.env.EXPO_PUBLIC_BUILD_COMMIT_SHA,
    process.env.BUILD_COMMIT_SHA,
    process.env.GIT_COMMIT,
  ];
  for (const raw of candidates) {
    if (raw == null || raw === '') continue;
    const sha = normalizeCommitSha(raw);
    if (sha !== BUILD_ID_UNKNOWN) {
      return sha;
    }
  }
  return null;
}

/**
 * @returns {{ commitSha: string; dirty: boolean }}
 */
function resolveBuildMeta() {
  const fromEnv = shaFromEnv();
  if (fromEnv != null) {
    return { commitSha: fromEnv, dirty: resolveDirtyFlag() };
  }

  try {
    const sha = normalizeCommitSha(readGitShortSha());
    const dirty = readGitDirty();
    return { commitSha: sha, dirty };
  } catch {
    return { commitSha: BUILD_ID_UNKNOWN, dirty: false };
  }
}

module.exports = {
  resolveBuildMeta,
  normalizeCommitSha,
  UNKNOWN: BUILD_ID_UNKNOWN,
  SHORT_LEN: 7,
};
