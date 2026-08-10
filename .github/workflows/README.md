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

`schedule.yml` builds from a `builds/nightly` branch that it maintains itself. Scheduled
runs reset it to `origin/main`; manual runs reset it to the selected `sourceBranch`, which
defaults to `main`. The workflow then commits the timestamped version and force-pushes the
branch. Therefore `git diff origin/<sourceBranch> builds/nightly` is exactly the version
bump, and every nightly VSIX has one commit that pins both its source and its version.

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
  that exact stamped commit. The tag is not a GitHub Release and has no release assets;
  the VSIX remains available from the workflow run.
- The machine branch is named `builds/nightly`, while the stable public marker remains
  the `nightly` tag. Keeping separate names avoids ambiguous Git ref resolution.
- On the first run after this migration, the tag job removes the legacy `nightly`
  GitHub Release before moving the tag. That release currently contains an old
  `5.12.0-SNAPSHOT` VSIX; retaining it would attach a stale asset to every new tag target.

Every release or pre-release GitHub release carries two assets — the VSIX and the bundled LS jar — so the server
can be downloaded on its own to debug a regression, or pointed at an existing install via
`ballerina.langServerPath`. It is the exact jar inside the VSIX, packed at the same version,
so the two can never disagree about what was built.

| Dispatch | GitHub release + tag | LS GitHub Package | Version commit + `release/X.Y.Z` |
|---|---|---|---|
| Release + `githubRelease: true` | yes | yes | yes |
| Release + `githubRelease: false` | no; VSIX artifact only | no | no |
| Pre-release + `githubRelease: true` | yes, on the dispatched commit | yes | no |
| Pre-release + `githubRelease: false` | no; VSIX artifact only | no | no |
| Custom development build | no | no | no |
| Scheduled nightly build | no; updates the `nightly` Git tag | no | nightly version commit only |

Marketplace publishing remains manual: `publish-vsix.yml` takes the `VSIX` workflow artifact
by run ID (30-day retention), independently of the GitHub release.

The release's **pre-release label follows `isPreRelease`** (`actions/release`'s `prerelease`
input defaults to `true`). It used to be hardcoded `true` for
everything, with `publish-vsix.yml` demoting a real release to a proper release once the
marketplace served it. That staged promotion had a failure mode with no signal: cut a release
and skip publishing, and it stayed labelled a pre-release forever. `publish-vsix.yml` still
patches the label, which is now a harmless no-op for releases cut after this change.

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
| `setup-ballerina` | Build and LS workflows — installs the distribution version declared by the LS `gradle.properties` |
| `updateVersion` | `build`, `schedule.yml` — resolves and writes the version in the extension manifest |
| `release` | `release-pre-release.yml` — owns everything that materialises a release: the version commit, `release/<version>`, the tag, the GitHub release and its assets |
| `pr` | `release-pre-release.yml` — opens the follow-up pull requests (release PR into `X.Y.x`, next-snapshot PR into `main`) + Google Chat notification |
| `dailyBuildNotification` | `schedule.yml` — success chat notification |
| `failure-notification` | `schedule.yml`, `release-pre-release.yml` — failure chat notification |
