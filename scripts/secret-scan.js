#!/usr/bin/env node
// Dependency-free publish guard, run by `npm run verify` (pre-commit and CI). CI additionally runs gitleaks
// over the full history. Scans every file git would publish (tracked + untracked-but-not-ignored) for:
//   1. secret-bearing file names (env files, signing keys, Firebase configs),
//   2. credential-looking content,
//   3. images/videos outside the allowlist — real textbook photos are copyrighted and must never be committed.
// A line containing `secret-scan:allow` is skipped. `--self-test` checks the rules against synthetic samples.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const FORBIDDEN_NAMES = [
  { re: /(^|\/)\.env(\.(?!example$)[^/]*)?$/, why: 'env file' },
  {
    re: /\.(pem|key|p8|p12|pfx|jks|keystore|mobileprovision|cer|certSigningRequest)$/i,
    why: 'signing key or certificate',
  },
  { re: /(^|\/)(google-services\.json|GoogleService-Info\.plist)$/, why: 'Firebase config' },
  { re: /(^|\/)(credentials|service-account[^/]*)\.json$/i, why: 'service credentials' },
  { re: /(^|\/)\.npmrc$/, why: 'npm config (may hold tokens)' },
];

const CONTENT_RULES = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: 'private key block' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, why: 'AWS access key id' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/, why: 'GitHub token' },
  { re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/, why: 'Slack token' },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/, why: 'Google API key' },
  { re: /\b(sk|rk)_live_[A-Za-z0-9]{16,}/, why: 'Stripe live key' },
  { re: /\bsk-(ant-|proj-)?[A-Za-z0-9_-]{32,}/, why: 'LLM API key' },
  { re: /\bnpm_[A-Za-z0-9]{36}\b/, why: 'npm token' },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, why: 'JWT' },
  {
    re: /\b(api[_-]?key|secret|token|passw(or)?d|client[_-]?secret)\b["']?\s*[:=]\s*["'][^"'\s]{16,}["']/i,
    why: 'hard-coded credential',
  },
];

const MEDIA_RE = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?|avif|webm|mp4|mov|m4v)$/i;
const MEDIA_ALLOW = [
  /^assets\/images\/[^/]+\.png$/,
  /^assets\/expo\.icon\//,
  /^assets\/sample\/textbook\.jpg$/,
  /^docs\/[^/]+\.(png|jpe?g|webp)$/,
];
const DOCS_MAX_IMAGES = 6;
const DOCS_MAX_BYTES = 800 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

function scanName(file) {
  const out = [];
  for (const r of FORBIDDEN_NAMES) if (r.re.test(file)) out.push(r.why);
  if (MEDIA_RE.test(file) && !MEDIA_ALLOW.some((re) => re.test(file))) {
    out.push(
      'image/video outside the allowlist (no photos of real textbooks; samples must be self-drawn SVG)',
    );
  }
  return out;
}

function scanText(text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    if (line.includes('secret-scan:allow')) return;
    for (const r of CONTENT_RULES) if (r.re.test(line)) out.push(`${r.why} (line ${i + 1})`);
  });
  return out;
}

function isBinary(buf) {
  return buf.subarray(0, 8000).includes(0);
}

function publishableFiles() {
  const raw = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: ROOT,
  });
  return raw
    .toString('utf8')
    .split('\0')
    .filter((f) => f && fs.existsSync(path.join(ROOT, f)));
}

function run() {
  const problems = [];
  const files = publishableFiles();
  const docsImages = files.filter((f) => /^docs\//.test(f) && MEDIA_RE.test(f));
  if (docsImages.length > DOCS_MAX_IMAGES)
    problems.push(`docs/: ${docsImages.length} images (max ${DOCS_MAX_IMAGES})`);
  for (const file of files) {
    for (const why of scanName(file)) problems.push(`${file}: ${why}`);
    const abs = path.join(ROOT, file);
    const size = fs.statSync(abs).size;
    if (docsImages.includes(file) && size > DOCS_MAX_BYTES)
      problems.push(`${file}: ${size} bytes (max ${DOCS_MAX_BYTES})`);
    if (size > MAX_TEXT_BYTES || MEDIA_RE.test(file)) continue;
    const buf = fs.readFileSync(abs);
    if (isBinary(buf)) continue;
    for (const why of scanText(buf.toString('utf8'))) problems.push(`${file}: ${why}`);
  }
  if (problems.length) {
    console.error(`secret-scan: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`secret-scan: ${files.length} files clean`);
}

function selfTest() {
  // Samples are assembled at runtime so this file never contains a literal match.
  const j = (...p) => p.join('');
  const hits = [
    j('-----BEGIN ', 'RSA PRIVATE KEY-----'),
    j('AKIA', 'ABCDEFGHIJKLMNOP'),
    j('ghp_', 'a'.repeat(36)),
    j('xoxb-', '1234567890-abcdef'),
    j('AIza', 'S'.repeat(35)),
    j('sk-', 'ant-', 'x'.repeat(40)),
    j('npm_', 'b'.repeat(36)),
    j('const apiKey', ' = "', 'z'.repeat(20), '"'),
  ];
  const misses = ['const token = useToken();', 'password: string;', 'integrity sha512-abc', 'sk-1'];
  const names = {
    '.env': true,
    '.env.production': true,
    '.env.example': false,
    'ios/key.p8': true,
    'GoogleService-Info.plist': true,
  };
  const media = {
    'photos/page1.jpg': true,
    'docs/overview.png': false,
    'assets/sample/textbook.jpg': false,
    'docs/demo.mp4': true,
  };
  const failed = [];
  for (const s of hits) if (scanText(s).length === 0) failed.push(`missed: ${s.slice(0, 12)}…`);
  for (const s of misses) if (scanText(s).length > 0) failed.push(`false positive: ${s}`);
  for (const [f, bad] of Object.entries({ ...names, ...media }))
    if (scanName(f).length > 0 !== bad) failed.push(`name rule: ${f}`);
  if (scanText(j('AKIA', 'ABCDEFGHIJKLMNOP // secret-scan:allow')).length)
    failed.push('allow marker ignored');
  if (failed.length) {
    console.error(`secret-scan self-test failed:\n  ${failed.join('\n  ')}`);
    process.exit(1);
  }
  console.log('secret-scan: self-test passed');
}

if (process.argv.includes('--self-test')) selfTest();
else run();
