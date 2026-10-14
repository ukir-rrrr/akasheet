const SHORT_LEN = 7;
const BUILD_ID_UNKNOWN = 'unknown';

/** @param {string | undefined | null} raw */
function normalizeCommitSha(raw) {
  if (raw == null || typeof raw !== 'string') return BUILD_ID_UNKNOWN;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed === BUILD_ID_UNKNOWN) return BUILD_ID_UNKNOWN;
  const head = trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-f]{7}$/.test(head)) return head;
  if (/^[0-9a-f]{40}$/.test(head)) return head.slice(0, SHORT_LEN);
  if (head.length >= SHORT_LEN && /^[0-9a-f]+$/.test(head.slice(0, SHORT_LEN))) {
    return head.slice(0, SHORT_LEN);
  }
  return BUILD_ID_UNKNOWN;
}

module.exports = { normalizeCommitSha, BUILD_ID_UNKNOWN, SHORT_LEN };
