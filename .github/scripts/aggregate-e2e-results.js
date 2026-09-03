#!/usr/bin/env node
// Aggregates Playwright JSON-reporter output (one or more files per matrix group,
// downloaded into per-artifact subfolders) into a Markdown summary: attempt counts per
// test and the error line for any failed attempt. Exits non-zero if any test's final
// status is not 'passed'/'skipped', if a report file couldn't be parsed, or if no
// readable report was found at all, so callers can gate a failure notification on it.
// A malformed report is tracked separately (unreadableCount) rather than folded into
// the test-level 'failed' count, since it isn't a test outcome and a report full of
// unreadable files would otherwise produce nonsensical totals like "Total: 0 · Failed: 2".
//
// A group can produce more than one report file: run-e2e-group runs a first attempt,
// then re-runs just the failed subset (`--last-failed`) into a second file (see
// PLAYWRIGHT_JSON_OUTPUT_FILE in .github/actions/run-e2e-group/action.yml). Both are
// full Playwright JSON reports, so per-test results across the group's files are merged
// here rather than letting the later file silently replace the earlier one.
//
// When given a second argument, also writes one NDJSON line per test (including
// clean single-attempt passes) so a caller can append it to a cross-run history file.

const fs = require('fs');
const path = require('path');

// Which runner produced the results being aggregated. The caller invokes this script once
// per platform over that platform's own artifact folder, so the step-summary heading and
// every history row say where the numbers came from. Empty when unset, which is how the
// rows written before Windows was added read.
const PLATFORM = process.env.E2E_OS || '';

function findResultFiles(rootDir) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && /^e2e-results.*\.json$/.test(entry.name)) {
        found.push(full);
      }
    }
  };
  if (fs.existsSync(rootDir)) walk(rootDir);
  return found;
}

// The caller downloads each matrix group's artifact into its own explicitly-named
// subfolder (e2e-results/group1, e2e-results/group2, ...) rather than one pattern-based
// download across all groups — so the group name is simply the first path segment
// under rootDir. (A pattern-based download only nests per-artifact when more than one
// artifact matches; with exactly one surviving group it flattens to the root, which a
// folder-name regex here couldn't recover from — controlling the download layout
// avoids that ambiguity entirely instead of guessing around it.)
function groupNameFromPath(filePath, rootDir) {
  const rel = path.relative(rootDir, filePath);
  return rel.split(path.sep)[0];
}

function collectSpecs(suite, out) {
  for (const spec of suite.specs || []) out.push(spec);
  for (const child of suite.suites || []) collectSpecs(child, out);
}

function firstErrorLine(result) {
  const error = result.error || (result.errors && result.errors[0]);
  if (!error) return null;
  const message = (error.message || '').split('\n')[0].trim();
  const stackLine = (error.stack || '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /\.(ts|js):\d+/.test(l));
  return [message, stackLine].filter(Boolean).join(' — ');
}

// Plain string sort puts 'e2e-results-rerun-10.json' before 'e2e-results-rerun-2.json'
// ('1' < '2' as the first differing character), so a group re-run past attempt 9 would
// merge chronologically out of order. localeCompare's numeric mode compares embedded
// digit runs by value instead of character-by-character.
function naturalFileOrder(a, b) {
  return path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true });
}

// Merges every report file belonging to one matrix group into a single per-test view,
// keyed by spec.id (falling back to file::title only if a report predates that field)
// plus the test's project name. spec.id is unique per spec location, unlike spec.title
// alone, which collides when two describe blocks reuse the same inner test title;
// the project name further distinguishes the same spec run under more than one
// Playwright project. Files are merged in filename order — 'e2e-results-first.json'
// before 'e2e-results-rerun-1.json', 'e2e-results-rerun-2.json', ... — so a test's
// results carry the first attempt's history followed by each re-run's, giving a true
// attempt count and final outcome even across repeated re-runs.
function mergeGroupReports(files, onUnreadable, onTruncated) {
  const merged = new Map();
  for (const file of [...files].sort(naturalFileOrder)) {
    let report;
    try {
      report = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      onUnreadable(file, err);
      continue;
    }

    const specs = [];
    for (const suite of report.suites || []) collectSpecs(suite, specs);

    // maxFailures (playwright.config.js) aborts the run once that many tests have
    // failed — remaining tests never execute. Detecting that reliably needs two
    // independent signals together, since neither alone is precise:
    //  - Playwright emits a top-level error with this exact wording only when the cap
    //    is actually hit — but it fires even if the cap lands on the suite's last test
    //    with nothing left to run, so it alone would flag a run that in fact finished.
    //  - Remaining tests show up with status 'skipped', same as an intentional
    //    test.skip()/test.fixme() (annotated) or a test skipped because a beforeAll/
    //    beforeEach hook threw (also unannotated) — so an unannotated skip alone
    //    doesn't prove maxFailures was the cause.
    // Requiring both rules out a suite that legitimately finished on its Nth failure
    // (no unannotated skip exists) and a hook failure that coincidentally also has
    // stats.unexpected reach the cap (hook failures don't emit this top-level error).
    const stoppedEarly = (report.errors || []).some(
      (e) => typeof e.message === 'string' && /maximum allowed failures/i.test(e.message)
    );
    const hasInvoluntarySkip = specs.some((spec) =>
      (spec.tests || []).some(
        (t) =>
          t.status === 'skipped' &&
          !(t.annotations || []).some((a) => a.type === 'skip' || a.type === 'fixme')
      )
    );
    if (stoppedEarly && hasInvoluntarySkip) {
      onTruncated(file);
    }

    for (const spec of specs) {
      for (const test of spec.tests || []) {
        const specKey = spec.id || `${spec.file}::${spec.title}`;
        const key = `${specKey}::${test.projectName || ''}`;
        const results = test.results || [];
        const hasSkipAnnotation = (test.annotations || []).some((a) => a.type === 'skip' || a.type === 'fixme');
        const existing = merged.get(key);
        if (existing) {
          existing.results.push(...results);
          existing.hasSkipAnnotation = existing.hasSkipAnnotation || hasSkipAnnotation;
        } else {
          merged.set(key, { title: spec.title, file: spec.file, results: [...results], hasSkipAnnotation });
        }
      }
    }
  }
  return [...merged.values()];
}

function aggregate(rootDir, expectedGroups) {
  const files = findResultFiles(rootDir);
  const byGroup = new Map();
  for (const file of files) {
    const group = groupNameFromPath(file, rootDir);
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(file);
  }

  // A group killed outright (e.g. the 60-minute job timeout) never uploads any report
  // file, so it never gets a byGroup entry at all — groupCount === 0 only catches total
  // loss across every group, not one group silently vanishing while the rest look clean.
  const missingGroups = (expectedGroups || []).filter((g) => !byGroup.has(g));

  const rows = [];
  const allTests = [];
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let flaky = 0;
  let unreadableCount = 0;
  const truncatedGroups = new Set();

  for (const [group, groupFiles] of byGroup) {
    const mergedTests = mergeGroupReports(
      groupFiles,
      (file, err) => {
        console.error(`Skipping unreadable report ${file}: ${err.message}`);
        unreadableCount += 1;
      },
      () => truncatedGroups.add(group)
    );

    for (const test of mergedTests) {
      total += 1;
      const attempts = test.results.length;
      const finalResult = test.results[test.results.length - 1];
      const finalStatus = finalResult ? finalResult.status : 'skipped';
      const isPassed = finalStatus === 'passed';
      const isSkipped = attempts === 0 || finalStatus === 'skipped';

      if (isPassed) passed += 1;
      else if (isSkipped) skipped += 1;
      else failed += 1;
      // Flakiness is derived from the merged attempt history rather than either report
      // file's own test.status: a test re-run via --last-failed spans two separate
      // Playwright invocations, so no single file's status reflects the merged outcome.
      if (isPassed && attempts > 1) flaky += 1;

      const errorLines = test.results
        .map((r, i) => {
          const line = firstErrorLine(r);
          return line ? `attempt ${i + 1}: ${line}` : null;
        })
        .filter(Boolean);

      // Distinguishes, for history/trend analysis, a test that never ran because a
      // group hit maxFailures from one intentionally skipped via test.skip()/fixme() —
      // both otherwise show up identically as finalStatus 'skipped'.
      const skipCause = !isSkipped ? null : test.hasSkipAnnotation ? 'intentional' : 'involuntary';

      allTests.push({
        group,
        title: test.title,
        file: test.file,
        attempts,
        finalStatus,
        skipCause,
        error: errorLines.length ? errorLines[errorLines.length - 1] : null,
      });

      if (attempts > 1 || (!isPassed && !isSkipped)) {
        rows.push({ group, title: test.title, file: test.file, attempts, finalStatus, errorLines });
      }
    }
  }

  return {
    rows,
    allTests,
    total,
    passed,
    failed,
    skipped,
    flaky,
    unreadableCount,
    missingGroups,
    truncatedGroups: [...truncatedGroups],
    groupCount: byGroup.size,
  };
}

function toNdjson(allTests) {
  const timestamp = new Date().toISOString();
  const runId = process.env.GITHUB_RUN_ID || '';
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT || '';
  const sourceTag = process.env.E2E_SOURCE_TAG || '';
  const sourceSha = process.env.E2E_SOURCE_SHA || '';

  return allTests
    .map((t) =>
      JSON.stringify({
        timestamp,
        runId,
        runAttempt,
        sourceTag,
        sourceSha,
        os: PLATFORM,
        ...t,
      })
    )
    .join('\n');
}

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

// Markdown table cells break on a bare '|' and render garbage on raw ANSI escapes —
// both show up routinely in Playwright assertion/diff output.
function cell(value) {
  return String(value ?? '').replace(ANSI_PATTERN, '').replace(/\|/g, '\\|');
}

function toMarkdown({
  rows,
  total,
  passed,
  failed,
  skipped,
  flaky,
  unreadableCount,
  missingGroups,
  truncatedGroups,
  groupCount,
}) {
  const lines = [];
  lines.push(PLATFORM ? `## E2E flakiness report (${PLATFORM})` : '## E2E flakiness report');
  lines.push('');
  lines.push(
    `Groups reported: ${groupCount} · Total: ${total} · Passed: ${passed} · Failed: ${failed} · Skipped: ${skipped} · Flaky (passed after retry): ${flaky}`
  );
  if (unreadableCount > 0) {
    lines.push(`⚠️ ${unreadableCount} report file(s) could not be parsed — this run is marked failed.`);
  }
  if (missingGroups && missingGroups.length > 0) {
    lines.push(
      `⚠️ No report at all from: ${missingGroups.join(', ')} (killed before uploading, e.g. by the job timeout) — this run is marked failed.`
    );
  }
  if (truncatedGroups && truncatedGroups.length > 0) {
    lines.push(
      `⚠️ Hit maxFailures and stopped early in: ${truncatedGroups.join(', ')} — remaining tests in that group never ran and are counted as skipped, not as a smaller suite. This run is marked failed.`
    );
  }
  lines.push('');

  if (rows.length === 0) {
    if (unreadableCount === 0 && (!missingGroups || missingGroups.length === 0) && (!truncatedGroups || truncatedGroups.length === 0)) {
      lines.push('No retries or failures — every test passed on the first attempt.');
    }
    return lines.join('\n');
  }

  lines.push('| Group | Test | Attempts | Final status | Errors |');
  lines.push('|---|---|---|---|---|');
  for (const row of rows.sort((a, b) => b.attempts - a.attempts)) {
    const errors = row.errorLines.map(cell).join('<br>');
    lines.push(
      `| ${cell(row.group)} | ${cell(row.title)} (${cell(row.file)}) | ${row.attempts} | ${cell(row.finalStatus)} | ${errors} |`
    );
  }
  return lines.join('\n');
}

function main() {
  const rootDir = process.argv[2];
  const ndjsonOutPath = process.argv[3];
  if (!rootDir) {
    console.error('Usage: aggregate-e2e-results.js <downloaded-artifacts-dir> [ndjson-output-path]');
    process.exit(2);
  }

  let expectedGroups = [];
  if (process.env.EXPECTED_GROUPS_JSON) {
    try {
      const parsed = JSON.parse(process.env.EXPECTED_GROUPS_JSON);
      if (Array.isArray(parsed)) {
        expectedGroups = parsed;
      } else {
        console.error('EXPECTED_GROUPS_JSON is not an array; ignoring.');
      }
    } catch (err) {
      console.error(`Failed to parse EXPECTED_GROUPS_JSON: ${err.message}; ignoring.`);
    }
  }

  const summary = aggregate(rootDir, expectedGroups);
  console.log(toMarkdown(summary));

  if (ndjsonOutPath && summary.allTests.length > 0) {
    fs.writeFileSync(ndjsonOutPath, toNdjson(summary.allTests) + '\n');
  }

  if (summary.groupCount === 0) {
    console.error(`No e2e-results*.json found under ${rootDir}; the artifact contract is broken.`);
    process.exit(1);
  }

  if (
    summary.failed > 0 ||
    summary.unreadableCount > 0 ||
    summary.missingGroups.length > 0 ||
    summary.truncatedGroups.length > 0
  )
    process.exit(1);
}

main();
