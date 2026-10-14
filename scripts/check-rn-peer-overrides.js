#!/usr/bin/env node
// Ensures package.json overrides cover every lockfile package whose react-native peer
// range does not semver-match the root RN (prerelease RC vs stable-looking ranges).
const fs = require('fs');
const path = require('path');
const semver = require('semver');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));

const rnVersion = pkg.dependencies['react-native'];
const overrides = pkg.overrides ?? {};

/** @type {{ name: string; range: string }[]} */
const needsOverride = [];

for (const [lockPath, meta] of Object.entries(lock.packages ?? {})) {
  const range = meta.peerDependencies?.['react-native'];
  if (!range || range.trim() === '*') continue;
  if (semver.satisfies(rnVersion, range)) continue;
  const name = lockPath.replace(/^node_modules\//, '');
  needsOverride.push({ name, range });
}

needsOverride.sort((a, b) => a.name.localeCompare(b.name));

const missing = needsOverride.filter(({ name }) => {
  const entry = overrides[name];
  return !(entry && entry['react-native'] === '$react-native');
});

if (needsOverride.length > 0) {
  console.log(`Root react-native@${rnVersion} — peer ranges that need overrides (${needsOverride.length}):`);
  for (const { name, range } of needsOverride) {
    const ok = !missing.some((m) => m.name === name);
    console.log(`  ${ok ? '✓' : '✗'} ${name}: "${range}"`);
  }
}

if (missing.length > 0) {
  console.error('\nMissing package.json overrides (set "react-native": "$react-native" for each package):');
  for (const { name } of missing) console.error(`  - ${name}`);
  process.exit(1);
}

if (needsOverride.length === 0) {
  console.log(`All react-native peer ranges in package-lock.json satisfy ${rnVersion}.`);
}
