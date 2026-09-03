# Workflows status

Ported from `wso2/vscode-extensions` and `ballerina-platform/ballerina-language-server`,
then pruned to a ballerina-only monorepo. Paths have been rewritten to the new layout
(`packages/ballerina-extension`, `submodules/wso2-vscode-extensions/workspaces/common-libs/`).

The LS build, tests, Trivy scan, GitHub Release asset, and Maven package publication are
integrated into the corresponding extension workflows. There is no independent LS release
workflow because the extension manifest owns the shared extension/LS version.

## VSCode extension workflows

| File | Trigger | Notes |
|---|---|---|
| `reusable-build.yml` | `workflow_call` only | Reusable build pipeline (ballerina-only) |
| `devBuild.yml` | manual + `workflow_call` | Builds a custom branch as a timestamped pre-release VSIX. It creates workflow artifacts only: no GitHub release and no marketplace publication. `schedule.yml` reuses this workflow after stamping the nightly branch. |
| `schedule.yml` | nightly cron + manual | Syncs the `builds/nightly` branch, runs the LS multi-branch pack/test/Windows-build matrix, calls `devBuild.yml`, and moves the `nightly` tag after every job passes. Manual runs can select a source branch and otherwise behave exactly like scheduled nightlies, including notifications. The VSIX remains a workflow artifact; no GitHub Release is created. See [Versioning](#versioning) and [The nightly branch](#the-nightly-branch). |
| `e2e-scheduled.yml` | every 6h cron + manual | Runs the Playwright E2E suite on Linux and Windows against the nightly VSIX without rebuilding, and tracks flakiness over time. See [Scheduled E2E testing](#scheduled-e2e-testing). |
| `pull-request.yml` | PRs + manual | Detects changes with `dorny/paths-filter`; if anything build-relevant changed, runs `reusable-build.yml` which builds the entire chain (LS via Gradle, then all TS packages and the extension VSIX via rush) in a single job. Windows LS coverage runs in `schedule.yml` only. |
| `release-pre-release.yml` | manual dispatch | Builds either a timestamped pre-release or the release version authored in the extension manifest. Its `githubRelease` input creates a GitHub Release with the VSIX and LS jar and publishes the matching `io.ballerina:ballerina-language-server` package. Real releases also perform the release branch/PR handling. |
| `publish-vsix.yml` | manual dispatch | Publishes a built VSIX (passed by `workflowRunId`) to VSCode Marketplace + OpenVSX |
| `cache-cleanup.yml` | PR closed + manual | Generic — usable as-is |
| `sync-main-with-releases.yml` | PR merged to a `*.*.x` line branch | Opens an auto-sync PR back to `main` |

## Versioning

The **`version` field in `packages/ballerina-extension/package.json` is the single
source of truth** for the shipped version, and on `main` it always carries the *next* release as a snapshot:
`major.minor.patch-SNAPSHOT` (e.g. `5.14.0-SNAPSHOT`). `-SNAPSHOT` is never shipped —
every publishable build derives a concrete version from it, and `updateVersion` fails
the build if one reaches packaging with the suffix intact.

**Only `main` uses `-SNAPSHOT`.** Release lines (`5.14.x`) and staging branches (`alpha`)
carry a concrete version that is authored by hand, and builds from those ship it as-is.
See [Branches](#branches).

**Even minors are release lines; odd minors are the pre-release channel** — the VS Code
convention, and the reason for the arithmetic below. `main`'s snapshot therefore always
names an even minor.

**It is the only version anyone edits.** `vsce` reads it directly and ships that manifest
inside the VSIX as `extension/package.json`. The language-server Gradle build reads the
same manifest during configuration, so there is no generated version file and no build
step that rewrites tracked files.

`-Pversion=<v>` overrides the Gradle side for a one-off build, by normal Gradle precedence
(an explicit project property beats the manifest default). The scheduled nightly LS matrix
uses it to pin a version.

Packaging itself goes through the shared
`submodules/.../common-libs/scripts/package-vsix.js`, unchanged. The extension's `postbuild`
does add one step before it, `clearVsix`, which deletes previously built VSIXes from the
package root and `vsix/`. Without it they accumulate: `vsce` only overwrites a file of the
*same* name, and `copyVSIX` (`copyfiles *.vsix ./vsix`) then copies every root VSIX forward,
so one file per version ever built piles up in both places. That is not cosmetic — e2e
resolves the VSIX to install by newest mtime across those folders
(`e2e-test/.../utils/helpers/setup.ts`), and a set copied in one pass shares a timestamp, so
the winner is undefined and a run can install a months-old build.

Its glob is `ballerina-[0-9]*.vsix`, requiring a digit after the dash so it can never match
`ballerina-integrator-*.vsix` — which really can sit in `vsix/`, because the e2e pre-release
path downloads it there (`test.list.ts`). `setup.ts` makes the same exclusion.

`.github/actions/updateVersion` is the only workflow code that mutates the version, and the
extension manifest is the only file it authors. It applies an optional explicit override,
then derives the version for the build type. Release and nightly commits therefore stage
that manifest alone.

The derivation depends on the *shape* of the extension version, not on the branch:

| Build | Extension version | Result | Example | `vsce --pre-release` |
|---|---|---|---|---|
| PR / local | either | untouched | `5.14.0-SNAPSHOT` (never packaged) | no |
| Nightly | `-SNAPSHOT` | `major.(minor-1).<minutes since 2020-01-01 UTC>` | `5.13.3458370` | yes |
| Pre-release (`isPreRelease: true`) | `-SNAPSHOT` | `major.(minor-1).<minutes since 2020-01-01 UTC>` | `5.13.3458385` | yes |
| Pre-release | concrete | as authored | `5.13.3458385` | yes |
| Release | `-SNAPSHOT` | minus `-SNAPSHOT` | `5.14.0` | no |
| Release | concrete | as authored | `5.14.1` | no |

Nightlies and snapshot-based pre-releases share one derivation
(`common/scripts/nightly-version.js`), which **decrements the minor** — landing on an odd
one, the pre-release channel — so the version sorts above every real release of the
previous line (`5.13.4` < `5.13.3458370`) and below the release `main` is heading for
(`5.13.3458370` < `5.14.0`). Publishing either as `5.14.x` would make it outrank the
eventual `5.14.0` and VS Code would never update off it. It goes in the *patch* position
because VS Code extension versions must be three integers — `5.14.0-alpha.1` is not
available.

The stamp is **whole minutes since 2020-01-01 UTC**, not a readable `yymmddHHmm`, because
Marketplace version components are `int32` (max `2147483647`) and a `yymmddHHmm` stamp
passes that from 2022 onward — `2607291530` is `2,607,291,530`, so `vsce publish` would
reject every pre-release. Minutes-since-epoch is 7 digits, stays under the limit until the
year 6098, and is still monotonic. Two builds collide only if cut within the same minute.
`nightly-version.js` rejects a stamp over the limit rather than letting it fail at publish
time, long after the release is tagged. Decode one with:

```bash
node -e 'console.log(new Date(Date.UTC(2020,0,1) + <stamp>*60000).toISOString())'
```

The script hard-fails on an extension version that is not `major.minor.patch-SNAPSHOT`, on a
minor of `0`, or on an odd snapshot minor. A positive even source minor is required so
`minor - 1` is always the odd pre-release channel. `updateVersion` therefore only calls it
when the extension manifest actually carries `-SNAPSHOT`; on a release line or staging
branch the authored version is published as-is.
**Consequence:** those branches must be bumped by hand between releases, or the second run
reuses a version that both the Marketplace and the git tag reject.

After a release cut from `main`, `.github/actions/pr` opens a PR returning `main` to
`major.(minor+2).0-SNAPSHOT` — `+2`, because `+1` would land on an odd minor, i.e. the
pre-release line, and the next nightly would then derive `5.14.<ts>` and collide with the
`5.14.x` line just released. It fires only when `main` is sitting on the very snapshot the
release consumed, so a patch cut from a line branch leaves `main` alone. Leaving `main` on
a concrete version is not cosmetic: the next nightly fails, because that derivation
requires a snapshot.

A note on `npm version`: the version is always written through it and **read back** from
`package.json` rather than reusing a composed string, because npm normalizes on write
(notably stripping a leading zero that an appended timestamp can produce, which is not
strict semver).

`isPreRelease` does more than pick a version: it is exported into the rush build env, where
`common-libs/scripts/package-vsix.js` turns it into `vsce package --pre-release`. A nightly
passes `isPreRelease: true` for exactly that reason — a nightly *is* a pre-release, its
derived version already sits on the odd-minor pre-release channel, and the two paths should
differ only in how they are branched and tagged, never in how they are packaged. It does not
affect the nightly's version, which is already committed on the `builds/nightly` branch:
`updateVersion` is gated on the `ballerina` input. `schedule.yml` passes `false` through
`devBuild.yml` because its nightly commit has already been stamped.

## Branches

| Branch | Extension version | Created by |
|---|---|---|
| `main` | `X.Y.0-SNAPSHOT`, **Y even** | — |
| `builds/nightly` | `X.(Y-1).<minutes since 2020-01-01 UTC>` | `schedule.yml`, force-pushed every run |
| `X.Y.x` — `5.14.x`, `5.16.x` | concrete, never `-SNAPSHOT` | **by hand**, when a line opens |
| `alpha` | concrete, set by hand | **by hand** |
| `release/X.Y.Z` | inherited from the branch it was cut from | `release-pre-release.yml`, non-pre-release only |

A release dispatched with `isPreRelease: false` commits the packaged version, pushes
`release/<version>` (reusing it only when its tree is identical), and opens a PR from it
into `X.Y.x`.
The commit matters: `updateVersion` writes the version into the *working tree* during the
build, so without it the released version would exist in no commit anywhere — and the
`v<version>` tag is pinned to that commit, not to the dispatched one, so the tagged tree
carries the version it is named after. **The line branch is never created
automatically** — deciding when to open a line is a human call — so if it does not exist the
PR is skipped with a notice naming the branch to cut, rather than failing a release that has
already been published. Merging that PR triggers `sync-main-with-releases.yml`, which opens
the PR carrying the line's fixes back to `main`.

Releases from `main` are the only ones that bump anything: see the `+2` rule above.

Nothing here targets `stable/ballerina`. That branch came from `wso2/vscode-extensions`,
where one repo held several extensions and each needed its own stable trunk
(`stable/ballerina`, `stable/mi`, `stable/choreo`, …). Here `main` is that trunk.

## The nightly branch

`schedule.yml` builds from a `builds/nightly` branch that it maintains itself. Scheduled runs,
and manual runs with `sourceBranch` left blank, reset it to the latest `staging/*` branch if one
exists, otherwise `main` — resolved by the `resolve-source-branch` composite action. A manual
run can still pass an explicit `sourceBranch` to override that. The workflow then commits the
timestamped version and force-pushes the branch.
Therefore `git diff origin/<resolved-branch> builds/nightly` is exactly the version bump, and
every nightly VSIX has one commit that pins both its source and its version.

- **Never open a PR against `builds/nightly` and never merge it anywhere** — it is discarded
  and recreated on every run.
- The extension build is pinned to the nightly *commit SHA*, not the branch name, so a
  concurrent run cannot swap the tree mid-build. The build does not re-stamp the
  version; the commit is authoritative (re-deriving the timestamp would produce a
  different version as soon as the clock ticked past the minute).
- The version commit carries only `packages/ballerina-extension/package.json`; Gradle
  reads that manifest directly, so the jar built from the commit carries the same version.
- The force-push uses `GITHUB_TOKEN`, whose pushes do not trigger workflows, so the
  nightly build cannot re-enter itself.
- After every validation job passes, the workflow force-moves the `nightly` Git tag to
  that exact stamped commit, then overwrites the `nightly` prerelease to target it, with
  that night's timestamped VSIX as its only asset. The release is deleted and recreated
  rather than edited: the tag has just moved, and an existing release keeps pointing at
  the commit it was created from; the asset filename also carries the timestamped version,
  so editing in place would accumulate one VSIX per night instead of replacing it.
- The release exists so the VSIX is reachable by tag rather than only through the
  authenticated Actions artifact API — `e2e-scheduled.yml` downloads it from there (see
  "Scheduled E2E testing" below). Its once-a-day delete/recreate window is why that
  workflow retries every `gh release` call.
- The machine branch is named `builds/nightly`, while the stable public marker remains
  the `nightly` tag. Keeping separate names avoids ambiguous Git ref resolution.

Every release or pre-release GitHub release cut by `release-pre-release.yml` carries two assets —
the VSIX and the bundled LS jar (the nightly prerelease is the exception; it carries only the
VSIX) — so the server can be downloaded on its own to debug a regression, or pointed at an
existing install via `ballerina.langServerPath`. It is the exact jar inside the VSIX, packed at
the same version, so the two can never disagree about what was built.

| Dispatch | GitHub release + tag | LS GitHub Package | Version commit + `release/X.Y.Z` |
|---|---|---|---|
| Release + `githubRelease: true` | yes | yes | yes |
| Release + `githubRelease: false` | no; VSIX artifact only | no | no |
| Pre-release + `githubRelease: true` | yes, on the dispatched commit | yes | no |
| Pre-release + `githubRelease: false` | no; VSIX artifact only | no | no |
| Custom development build | no | no | no |
| Scheduled nightly build | yes; overwrites the `nightly` tag + prerelease (VSIX only) | no | nightly version commit only |

Marketplace publishing remains manual: `publish-vsix.yml` takes the `VSIX` workflow artifact
by run ID (30-day retention), independently of the GitHub release.

The release's **pre-release label follows `isPreRelease`** (`actions/release`'s `prerelease`
input defaults to `true`). It used to be hardcoded `true` for
everything, with `publish-vsix.yml` demoting a real release to a proper release once the
marketplace served it. That staged promotion had a failure mode with no signal: cut a release
and skip publishing, and it stayed labelled a pre-release forever. `publish-vsix.yml` still
patches the label, which is now a harmless no-op for releases cut after this change.

## Scheduled E2E testing

`e2e-scheduled.yml` runs the Playwright E2E suite (`packages/ballerina-extension/e2e-test/`)
every 6 hours, purely to track flakiness over time — not for fresh-code feedback, which PR
builds already cover. It exists because E2E was too flaky to keep gating the nightly build and
was disabled there (see the `TODO` in `schedule.yml`'s `Build` job).

**Tests the nightly VSIX instead of rebuilding.** The `E2E` job downloads the `ballerina-*.vsix`
asset from the `nightly` GitHub Release rather than running a full `rush build`/`vsce package`,
saving that cost 4x/day. Testing the same build across all 4 daily runs is deliberate: it holds
product code constant so variance is attributable to test flakiness, not code churn. The
`nightly` tag only moves once `schedule.yml`'s build and LS tests all pass, so it always points
at the last known-good build — no separate fallback is needed for "what if last night's build
failed". The job's own checkout stays on the default ref rather than the `nightly` tag's commit,
because every local `uses: ./.github/actions/...` step resolves against whatever is checked
out — pinning to an older tag commit would break (permanently, not just once) whenever an
action under `.github/actions/` changes, until a future nightly build advanced the tag past it.
The accepted trade-off is that test source and the installed VSIX are no longer commit-matched.
For the same reason, `setup-ballerina`'s `gradlePropertiesRef: nightly` input pins the installed
Ballerina distribution version to what the nightly LS actually shipped with, not to
`gradle.properties` on the current checkout — otherwise a version bump on the default branch
between nightly builds would fail the whole suite in a way indistinguishable from flakiness.

**Runs on Linux and Windows.** The `E2E` matrix is platform × group, so a run executes 8 legs.
`run-e2e-group` lowercases `runner.os` into a platform label and puts it in every artifact name
(`Ballerina-e2e-test-results-windows-group1-1`), and skips the Linux-only setup on Windows: no
`apt-get`, no `xvfb`, no `dbus`, and no `ffmpeg` X11 screen grab, because the Windows runner already
has a desktop session. The suite captures its own failure screenshots (`setup.ts`) and session video
(`test.list.ts`) on both platforms — these do not come from Playwright's `use.video`/`use.screenshot`,
which are both `off`; only the whole-session `record.mp4` is Linux-only. `Prepare` publishes the platform list
as an output so the matrix and `Report`'s download/aggregation loops read the same list.

**Windows runs but does not gate.** The Windows legs set `continue-on-error`, and `Report` turns a
Windows-only aggregation failure into a warning, so `needs.E2E.result` stays `success` and the chat
notification does not fire on a Windows failure. Windows results still reach the step summary and the
`e2e-metrics` history — `aggregate-e2e-results.js` runs once per platform, and every history row now
carries an `os` field (absent on rows written before this). It is not a gate yet because parts of
the suite are still Linux-only — a `zip` shell-out for failure snapshots, a `bal` invocation that
does not resolve `bal.bat`, a hard-coded `/tmp` path in one spec, and `SIGKILL` teardown that leaves
Windows file locks behind. Those are tracked separately.

There are four places that let Windows through, and making it a gate means reverting all four: the
`continue-on-error` expression on the `E2E` job, the `windows` branch in `Report`'s download loop,
the `windows` branch in `Report`'s aggregation loop, and the `runner.os != 'Windows'` guard on
`run-e2e-group`'s re-run step — a gating platform wants the `--last-failed` pass back. That guard
pairs with the `Surface Windows first-attempt failure` step just above it, which exists only because
the guard removes the one step that would otherwise fail the job; drop both together.

**The Windows legs run with `BI_E2E_RETRIES: 0`.** `playwright.config.js` otherwise retries a failed
test twice, and the suite is serial (`workers: 1`) with a 20-minute per-test timeout — so while the
blockers above are still open, retries burn the 60-minute job budget re-running tests that fail for a
platform reason rather than a flaky one. A leg killed by that timeout uploads no artifact, and the
run records nothing. Zero retries reaches more distinct tests per run, which is the pass rate this
phase exists to measure; the cost is that Windows flakiness is not distinguishable from Windows
failure until retries are turned back on. `maxFailures: 10` is deliberately left alone: it truncates
a badly-failing group early, which is what keeps a leg inside the job timeout and producing an
artifact at all.

Two things follow from zero retries. `run-e2e-group`'s `--last-failed` re-run is a second whole
invocation whose condition is independent of the retry count, so on Windows it is skipped on a first
attempt — it would re-execute up to ten platform failures against what is left of the 60-minute
budget, which is the cost zero retries removes from the first pass. It still runs on a manual
"Re-run failed jobs", the resume path it exists for. And `trace: 'on-first-retry'` captures nothing
when nothing is retried, so the Windows legs set `BI_E2E_TRACE: retain-on-first-failure`; the trace
is the only one of the three diagnostics that depends on a retry, since the screenshots and video are
the suite's own.

**Handles GitHub's "Re-run failed jobs" across the whole pipeline.** A matrix group can be
re-run independently, advancing only its own `github.run_attempt`; `run-e2e-group` restores the
previous attempt's `.last-run.json` to resume `--last-failed` targeting, and deliberately keeps
(does not discard) the restored `e2e-reports/` report — a re-run is a continuation of the same
logical test run, so a test's full attempt history across it (failures before the re-run, plus
the re-run's own attempts) is what should be recorded, not just the re-run's small subset. Each
re-run's own report is written to a `run_attempt`-suffixed filename so a *second* re-run can't
overwrite the first re-run's data the same way. The `Report` job mirrors this at the group level:
it picks whichever artifact attempt actually exists per group (a passing group's artifact stays
at a lower attempt number than a re-run group's), rather than assuming every group is at the
run's current attempt.

**The `nightly` release is briefly unavailable once a day.** `schedule.yml`'s `Tag` job deletes
then recreates it, so every `gh release view`/`gh release download`/artifact-listing call in
this workflow retries (`.github/scripts/retry.sh`, sourced rather than duplicated — a prior
omission of the retry on one of these calls, while its siblings had it, is what prompted
extracting it) instead of failing outright on that narrow window. One related race is accepted
rather than closed: `sourceSha` is resolved once in `Prepare` before the E2E matrix starts, but
each matrix leg separately re-downloads the VSIX later, so a retag landing in between could in
principle leave a leg testing a different commit than the one recorded in its history row. Fully
closing that would mean downloading the VSIX once and distributing it to all 4 legs as a shared
artifact — a real redesign for a multi-second daily window with no effect on the tests
themselves, so it's left as a known, narrow gap rather than solved here.

**Reports go outside Playwright's `outputDir`.** Both the first-attempt and re-run JSON reports
are written to `e2e-reports/`, not `test-results/` — Playwright wipes its `outputDir`
(`test-results/`) at the start of every invocation, so a report placed there would be deleted by
the very next invocation before ever being read (confirmed by reproducing it locally, not just
by inspection).

**`aggregate-e2e-results.js`** merges a group's report(s) into one Markdown summary (posted to
the run's Step Summary) and one NDJSON line per test, keyed by `spec.id` + project name (not
`file::title`, which collides across `describe` blocks reusing a title). It separately tracks
and warns on: unparseable report files, groups with no report at all (e.g. killed by the
60-minute job timeout), and groups that hit `maxFailures` and stopped early. The last needs two
signals together, since neither alone is precise: a top-level Playwright error containing
"maximum allowed failures" (emitted only when the cap is hit, but also when the cap happens to
land on the suite's last test with nothing left to run) AND at least one test with status
`skipped` and no `skip`/`fixme` annotation (true for a test the cap left un-run, but also true
for one skipped by a failed `beforeAll`/`beforeEach` hook). Requiring both rules out a suite that
legitimately finished on its Nth failure and a hook failure that coincidentally also reaches the
cap. Any of these marks the run failed, not just a test failure. Each NDJSON row also carries a
`skipCause` (`'involuntary'`/`'intentional'`/`null`) using the same annotation check, so a
history reader can tell a test that never ran due to the cap apart from one skipped on purpose,
even though both show `finalStatus: 'skipped'` — this is per-test detail the group-level
truncation warning above doesn't carry.

**History persists to an orphan `e2e-metrics` branch**, appended once per scheduled run (not
batched across the day — see below), in a throwaway clone rather than the job's own checkout
(switching that checkout to `e2e-metrics`, which contains only `history/`, would delete every
other tracked file the job still needs, including `./.github/actions/failure-notification`).
The clone is `--depth 1 --single-branch`: `e2e-metrics` is an orphan branch with no relation to
`main`'s history, so an unrestricted clone would still pull the whole repo's packfiles for a
branch that only ever holds small `history/YYYY-MM.jsonl` files (rotated monthly to bound
growth). Each NDJSON row also carries `sourceSha` — the `nightly` release's `targetCommitish`,
resolved once in the `Prepare` job before the E2E matrix starts (not re-queried later in
`Report`, which risks reading a commit the tag has since moved past) — so a regression from a
new nightly build and a genuinely flaky test remain distinguishable in the history, since the
`nightly` tag itself moves nightly while `E2E_SOURCE_TAG` stays a constant label.

*Why not batch the whole day's stats into one write instead of one per run?* Each of the 4 daily
runs is an independent GitHub Actions job with no shared filesystem, so batching would mean
stashing each run's stats in an artifact (its own retention window, its own chance of expiring)
until some later run decides it's "last" and pushes for the day — new failure modes for a
problem the shallow clone above already solves directly. Writing immediately after each run
means each run's data is durably committed the moment it exists, with no held state to lose.

## The bundled language server

The jar in `packages/ballerina-extension/ls/` is **always** the `pack` output of
`packages/ballerina-language-server` in this repo. Rush builds or restores that workspace
dependency first, then the extension's `copyLS` command clears `ls/` and copies the jar
whose version matches the extension manifest. There is no download fallback or way to
select a different LS: a
prebuilt jar from elsewhere could not carry this repo's version, so a VSIX built around
one would ship an extension and a server claiming different versions.

Consequence: building the extension requires being able to build the LS — JDK 21 and
GitHub Packages credentials (`packageUser` / `packagePAT`). If the exact versioned jar is
missing, the copy command fails rather than silently substituting one.

When `githubRelease` is selected, `release-pre-release.yml` publishes
`io.ballerina:ballerina-language-server` to GitHub Packages at the same version after
creating the GitHub release or pre-release and uploading both assets. Gradle publishes
the exact jar from `packages/ballerina-extension/ls/` that was bundled in the VSIX and
uploaded as the release asset, rather than rebuilding a second candidate. On a rerun,
GitHub Packages' HTTP 409 is accepted only after the workflow downloads the existing
Maven jar and verifies that its SHA-256 equals the canonical release jar. A missing or
mismatched package fails the release. The workflow sends its completion announcement
only after both operations finish. There is no independent LS publication workflow
because the extension manifest owns the shared version. This path publishes only
Gradle's `mavenJava` publication and does not run Gradle's `release` task: that task
rewrote the `version=` key in `gradle.properties`, which no longer exists now that the
extension manifest owns the version.

## Language server test coverage

Every LS test run reports coverage to [Codecov](https://codecov.io/gh/ballerina-platform/ballerina-vscode)
under the `language-server` flag. `.github/actions/ls-test` owns the whole flow, so any
workflow that runs LS tests gets it: after `./gradlew test` it runs
`./gradlew createCodeCoverageReport` (defined in the LS root `build.gradle`, modelled on
ballerina-lang's task of the same name), which merges every module's JaCoCo execution data
into `.jacoco/reports/jacoco/report.xml`, then uploads that file and attaches the report
directory as the `ls-coverage-<branch>` artifact.

Three details worth knowing:

- **Linux only.** The Windows matrix leg runs the same suite over the same sources, so a
  second upload would only duplicate the report and its paths do not map onto the repo layout.
- **Runs even when tests fail** (`if: !cancelled()`), because a partial number beats none. A
  cancelled run is excluded — a superseded run should not publish a half-finished report.
  Report generation is `continue-on-error`, so it cannot turn a passing suite red.
- **`schedule.yml` passes `codecov-branch`.** Its matrix checks out `matrix.branch` rather
  than the ref the schedule fired on, so the upload has to be attributed explicitly. These
  nightly runs are what give `main` and each release line the baseline that PR comparisons
  need — PR builds only run LS tests when language server files change.

Coverage thresholds are informational in `codecov.yml` (repository root — Codecov reads it
from nowhere else): coverage is reported but never fails a build. To flip it to a merge gate,
set `informational: false` on the statuses there — worth doing only after the first full CI
run establishes the real baseline, since the `range` there is currently a placeholder.

## Required GitHub secrets for publishing and notifications

- `BALLERINA_BOT_USERNAME` / `BALLERINA_BOT_TOKEN` — `release-pre-release.yml`, when
  `githubRelease` is selected: publish and verify the LS Maven package in GitHub Packages.
- `VSCE_TOKEN` — `publish-vsix.yml`: publish to VS Code Marketplace.
- `OPENVSX_TOKEN` — `publish-vsix.yml`: publish to OpenVSX.
- `EDITOR_TEAM_CHAT_API` — `release-pre-release.yml`, `schedule.yml`,
  `sync-main-with-releases.yml`, and failure-notification actions: release progress,
  nightly success, and build/sync failure notifications.

## Optional GitHub secrets

- `CLOUD_EDITOR_BUILDER_REPO` / `CLOUD_EDITOR_BUILDER_REPO_TOKEN` —
  `publish-vsix.yml`: optional cross-repository dispatch after a stable release.
- `COPILOT_ROOT_URL` / `COPILOT_DEV_ROOT_URL` / `APPINSIGHTS_INSTRUMENTATION_KEY` —
  `schedule.yml`, `devBuild.yml`, and `release-pre-release.yml`: optional build-time
  endpoint and telemetry configuration. Pull-request builds receive none of these secrets.
- `CODECOV_TOKEN` — every workflow that runs LS tests: authenticates the language server
  coverage upload. Unset, the upload falls back to Codecov's tokenless flow for public
  repositories; either way it never fails a build. See
  [Language server test coverage](#language-server-test-coverage).

Configure these in the new repo's settings before triggering anything.

All chat notifications share one secret, so a chat webhook is configured in exactly one place.
Before this, the nightly build used a separate `BI_TEAM_CHAT_API` that was never configured on the
repo, which is what failed run `30416319364`: an unset secret hands `curl` a URL that is only a
query string, so it exits 3 with `URL rejected: Malformed input to a URL function` and fails the
job *after* the build, release and asset uploads have all succeeded.

The release notifications (`actions/release`, `actions/pr`, and the inline steps in
`release-pre-release.yml`) skip with a notice when the secret is empty, so a fork can run a release
without a webhook. `dailyBuildNotification` and `failure-notification` do **not** — they still
fail the job on an empty value, which is only safe as long as `EDITOR_TEAM_CHAT_API` stays
configured.

## Composite actions under `.github/actions/`

| Action | Used by |
|---|---|
| `build` | `reusable-build.yml` — runs rush install + `rush build --to ballerina` |
| `setup-ballerina` | Build and LS workflows — installs the distribution version declared by the LS `gradle.properties`; accepts an optional `gradlePropertiesRef` to read that file from a git tag instead of the checkout (used by `e2e-scheduled.yml` to pin to the `nightly` tag) |
| `ls-test` | `reusable-build.yml`, `schedule.yml` — runs the LS gradle suite, then aggregates and uploads coverage (see [Language server test coverage](#language-server-test-coverage)) |
| `updateVersion` | `build`, `schedule.yml` — resolves and writes the version in the extension manifest |
| `resolve-source-branch` | `schedule.yml` — the latest-`staging/*`-else-`main` resolution described under [The nightly branch](#the-nightly-branch) |
| `run-e2e-group` | `reusable-build.yml`, `e2e-scheduled.yml` — runs one matrix group of the E2E suite (first attempt + `--last-failed` re-run) on a Linux or Windows runner and uploads its artifacts under a platform-tagged name; see [Scheduled E2E testing](#scheduled-e2e-testing) |
| `release` | `release-pre-release.yml` — owns everything that materialises a release: the version commit, `release/<version>`, the tag, the GitHub release and its assets |
| `pr` | `release-pre-release.yml` — opens the follow-up pull requests (release PR into `X.Y.x`, next-snapshot PR into `main`) + Google Chat notification |
| `dailyBuildNotification` | `schedule.yml` — success chat notification |
| `failure-notification` | `schedule.yml`, `release-pre-release.yml`, `e2e-scheduled.yml` — failure chat notification |
