#!/usr/bin/env node
// Every e2e-playwright-tests/*/*.spec.ts file wraps its tests in exactly one
// test.describe.serial(...) block, so its tests share state (the tree, the open webview,
// the on-disk project) across steps. Playwright's own `retries` config already reruns a
// whole serial block from the top on failure — but run-e2e-group's CI re-run step used
// `--last-failed`, which replays only the individually-failed test(s), skipping the
// earlier steps that built the state they depend on.
//
// This script reads the most recent Playwright JSON report for a matrix group and prints
// a ready-to-use --grep pattern matching (the given test group tag) AND (one of the
// serial block titles that had a failing test), so the caller can replay each failing
// block in full without assembling or escaping the regex itself. Prints just the
// escaped test group (still a valid --grep value on its own) if no failure could be
// identified, and prints nothing at all only when no test group was given — either way
// this never throws, so a caller can always trust its stdout.

const fs = require('fs');
const path = require('path');

// Mirrors aggregate-e2e-results.js's naturalFileOrder: plain string sort would put
// 'e2e-results-rerun-10.json' before 'e2e-results-rerun-2.json'.
function naturalFileOrder(a, b) {
  return path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true });
}

function findLatestReport(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^e2e-results.*\.json$/.test(f))
    .map((f) => path.join(dir, f))
    .sort(naturalFileOrder);
  return files.length ? files[files.length - 1] : null;
}

function specFailed(spec) {
  return (spec.tests || []).some((test) => {
    const results = test.results || [];
    const last = results[results.length - 1];
    return last && last.status !== 'passed' && last.status !== 'skipped';
  });
}

// A suite whose own specs include a failing test is the nearest serial block ancestor of
// that failure (every spec sits directly inside its file's single serial block in this
// suite), regardless of how many describe levels sit above it. An empty title (e.g. the
// anonymous test.describe(fn) wrappers in test.list.ts) is skipped: matching it would
// make the alternation below match every title and silently re-run the whole group.
function collectFailingSuiteTitles(suite, out) {
  if (suite.title && (suite.specs || []).some(specFailed)) out.add(suite.title);
  for (const child of suite.suites || []) collectFailingSuiteTitles(child, out);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Returns the failing serial block titles for the latest report under `dir`, or null if
// none could be identified (no directory, no report, unreadable JSON, unexpected shape,
// or no failure found) — the caller always falls back to the whole group in that case.
function findFailingTitles(dir) {
  const reportFile = findLatestReport(dir);
  if (!reportFile) return null;

  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const titles = new Set();
  for (const suite of report.suites || []) collectFailingSuiteTitles(suite, titles);
  return titles.size ? [...titles] : null;
}

function main() {
  const dir = process.argv[2];
  const testGroup = process.argv[3];
  if (!dir) {
    console.error('Usage: extract-failed-serial-groups.js <e2e-reports-dir> [test-group]');
    process.exit(2);
  }

  let titles = null;
  try {
    titles = findFailingTitles(dir);
  } catch (err) {
    console.error(`Failed to read failing serial groups under ${dir}: ${err.message}; falling back to the whole group.`);
  }

  if (!testGroup) {
    // No group to fold in — just report the raw titles (or nothing), as before.
    if (titles) process.stdout.write(titles.map(escapeRegExp).join('|'));
    return;
  }

  const escapedGroup = escapeRegExp(testGroup);
  if (titles) {
    process.stdout.write(`(?=.*${escapedGroup})(?=.*(${titles.map(escapeRegExp).join('|')}))`);
  } else {
    process.stdout.write(escapedGroup);
  }
}

main();
