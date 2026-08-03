#!/usr/bin/env node

/**
 * Derives the nightly version from the extension package.json and prints it.
 *
 * main always carries the *next* release as a snapshot — 'major.minor.patch-SNAPSHOT'
 * (e.g. 5.14.0-SNAPSHOT). A nightly is unreleased work heading toward that version,
 * so it is published as:
 *
 *     major.(minor - 1).<minutes since 2020-01-01 UTC>    5.14.0-SNAPSHOT -> 5.13.3458370
 *
 * The minor is decremented so a nightly sorts *above* every real release of the
 * previous line (5.13.4 < 5.13.3458370) and *below* the release main is heading
 * for (5.13.3458370 < 5.14.0). Publishing it as 5.14.x instead would make the
 * nightly outrank the eventual 5.14.0 release, and VS Code would never update off
 * it. The timestamp lands in the patch position rather than being appended so the
 * result is a plain three-part version, with no leading-zero semver trap.
 *
 * WHY MINUTES-SINCE-EPOCH AND NOT A READABLE 'yymmddHHmm':
 * VS Code Marketplace version components are int32, max 2147483647. A yymmddHHmm
 * stamp is 2607291530 for this very date — over the limit — and every value the
 * scheme can produce from 2022 onward exceeds it, so 'vsce publish' would reject
 * every pre-release. Minutes since 2020-01-01 is 7 digits (~3.4M), three orders of
 * magnitude clear of the limit, still monotonic and still minute-granular. It stays
 * under int32 until the year 6099, which is long enough.
 *
 * Decode one with:
 *     node -e 'console.log(new Date(Date.UTC(2020,0,1) + <stamp>*60000).toISOString())'
 *
 * Pre-releases use this same derivation. The stamp is minute-granular, so a nightly
 * and a pre-release collide only if they are cut within the same minute.
 *
 * Usage: node common/scripts/nightly-version.js [--timestamp <minutes>]
 *
 * Exit codes:
 * - 0: version printed on stdout
 * - 1: the extension version is not a 'major.minor.patch-SNAPSHOT' with a positive even minor,
 *      or the stamp is not a positive integer below int32
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const SNAPSHOT_VERSION = /^(\d+)\.(\d+)\.\d+-SNAPSHOT$/;

/** Version components must fit in a signed 32-bit int or the Marketplace rejects them. */
const MAX_VERSION_COMPONENT = 2147483647;

/** Epoch for the patch stamp. Fixed forever — moving it would renumber every nightly. */
const STAMP_EPOCH_UTC = Date.UTC(2020, 0, 1);

/**
 * Whole minutes since 2020-01-01 UTC. Mirrors the shell in updateVersion/action.yml,
 * which computes the same value from `date -u +%s` — the two must agree.
 */
function timestamp(now) {
  return String(Math.floor((now.getTime() - STAMP_EPOCH_UTC) / 60000));
}

/**
 * Derive an odd-minor nightly version from the next even-minor release snapshot.
 */
function deriveNightlyVersion(extensionVersion, stamp) {
  if (typeof stamp !== 'string' || !/^(0|[1-9]\d*)$/.test(stamp)) {
    throw new Error(
      `Invalid nightly timestamp "${stamp}": expected decimal digits ` +
      `(minutes since 2020-01-01 UTC).`
    );
  }

  if (Number(stamp) > MAX_VERSION_COMPONENT) {
    throw new Error(
      `Invalid nightly timestamp "${stamp}": exceeds the maximum version component ` +
      `${MAX_VERSION_COMPONENT} (int32), which the VS Code Marketplace rejects.`
    );
  }

  const match = SNAPSHOT_VERSION.exec(extensionVersion);
  if (!match) {
    throw new Error(
      `The extension package.json version is "${extensionVersion}", which is not a snapshot.\n` +
      `main must always carry the next release as 'major.minor.patch-SNAPSHOT' ` +
      `(e.g. 5.14.0-SNAPSHOT); the nightly version is derived from it as ` +
      `major.(minor-1).<minutes since 2020-01-01 UTC>.`
    );
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);

  if (minor === 0) {
    // No sensible answer: 'major.-1.<timestamp>' is nonsense, and silently reusing
    // minor 0 would make the nightly outrank the release main is heading for.
    // Fail loudly — a human has to decide what the first nightly of a new major
    // line should be called.
    throw new Error(
      `Cannot derive a nightly version from "${extensionVersion}": the minor version is 0, ` +
      `so there is no 'minor - 1' to publish under. Set the extension version to a ` +
      `positive even minor (e.g. ${major}.2.0-SNAPSHOT) or adjust the nightly scheme.`
    );
  }

  if (minor % 2 !== 0) {
    throw new Error(
      `Cannot derive a nightly version from "${extensionVersion}": the snapshot minor ` +
      `must be even so minor - 1 is the odd pre-release channel. Set the extension ` +
      `version to the next even-minor release snapshot.`
    );
  }

  return `${major}.${minor - 1}.${stamp}`;
}

/** Validate CLI arguments, derive the version, and print it for workflow callers. */
function main() {
  const args = process.argv.slice(2);
  const flagIndex = args.indexOf('--timestamp');
  const stamp = flagIndex !== -1 ? args[flagIndex + 1] : timestamp(new Date());

  const extensionVersion = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'packages', 'ballerina-extension', 'package.json'), 'utf8')
  ).version;

  try {
    console.log(deriveNightlyVersion(extensionVersion, stamp));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { deriveNightlyVersion, timestamp, MAX_VERSION_COMPONENT };
