# Contributing to ballerina-vscode

This is a rush.js monorepo containing the Ballerina VS Code extension, the Ballerina
language server, the TextMate grammar, and the supporting webview / diagram packages
that the extension renders. Shared `@wso2/*` libraries (ui-toolkit, font, copilot-utilities,
etc.) are consumed from the `wso2/vscode-extensions` repo via a git submodule.

## Repository layout

```
ballerina-vscode/
├── packages/                         # First-class workspace packages
│   ├── ballerina-extension/          # The VS Code extension (TypeScript)
│   ├── ballerina-language-server/    # Gradle-built Java language server
│   ├── ballerina-grammar/            # TextMate grammar source
│   ├── ballerina-core/               # Shared types
│   ├── ballerina-rpc-client/         # Extension <-> webview RPC
│   ├── ballerina-visualizer/         # Main webview
│   ├── ballerina-side-panel/         # Side-panel webviews
│   ├── ballerina-low-code-diagram/   # Low-code diagram renderer
│   ├── ballerina-statement-editor/   # Statement editor
│   ├── ballerina-data-mapper/        # Data mapper
│   ├── bi-diagram/                   # BI diagram
│   ├── sequence-diagram/             # Sequence diagram
│   ├── component-diagram/            # Component diagram
│   ├── type-diagram/                 # Type diagram
│   ├── persist-layer-diagram/        # Persist layer diagram
│   ├── graphql/                      # GraphQL view
│   ├── graphql-design-diagram/       # GraphQL design diagram
│   ├── type-editor/                  # Type editor
│   ├── record-creator/               # Record creator
│   ├── trace-visualizer/             # Trace visualizer
│   ├── overview-view/                # Overview view
│   └── syntax-tree/                  # Syntax tree utilities
│
├── submodules/
│   └── wso2-vscode-extensions/       # Submodule for shared common-libs
│                                     #   (font-wso2-vscode, ui-toolkit,
│                                     #    playwright-vscode-tester,
│                                     #    copilot-utilities, wso2-platform-core)
│                                     # Pinned to release/ballerina-5.12.x
│
├── common/
│   ├── config/rush/                  # Rush configuration
│   ├── autoinstallers/rush-plugins/  # @gigara/rush-github-action-build-cache-plugin
│   └── scripts/                      # install-run-rush.js, env-webpack-helper.js
│
├── .vscode/                          # Launch/debug configs + tasks
├── .github/
│   ├── workflows/                    # CI workflows (see workflows/README.md)
│   └── actions/                      # Composite actions used by workflows
├── rush.json                         # Project registry
├── rush-config.json                  # Per-project rush settings template
└── ballerina-extension.code-workspace
```

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 20, < 23 (LTS 22.x recommended) | Use [nvm](https://github.com/nvm-sh/nvm) |
| pnpm | 10.11.0 (auto-installed by rush) | Don't install globally |
| Rush | 5.155.1 (auto-installed via `common/scripts/install-run-rush.js`) | A global `rush` shim is enough |
| Java JDK | 21 | The LS needs 21 (some submodules require 21+) |
| Ballerina distribution | 2201.13.x | [Install](https://ballerina.io/downloads/) |
| Docker | Optional | Only needed for persist-service LS integration tests |
| GitHub PAT with `read:packages` | Required for LS build | Authenticates against `maven.pkg.github.com/ballerina-platform/*` |

### Configuring credentials for the language server

The Gradle build pulls Ballerina language artifacts from GitHub Packages. Put your
PAT in `~/.gradle/gradle.properties`:

```properties
packageUser=<your-github-username>
packagePAT=<token-with-read:packages-scope>
```

These are also read from the `packageUser`/`packagePAT` env vars if you prefer
that — `build.gradle` falls back to `findProperty(...)` if env vars are unset.

### Configuring JAVA_HOME

```bash
# in ~/.zshrc (or equivalent)
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export PATH=$JAVA_HOME/bin:$PATH
```

`/usr/libexec/java_home -V` lists installed JDKs (macOS). Install Temurin 21 with:

```bash
brew install --cask temurin@21
```

## Initial checkout

```bash
git clone --recurse-submodules https://github.com/ballerina-platform/ballerina-vscode.git
cd ballerina-vscode

# If you cloned without --recurse-submodules:
git submodule update --init --recursive

# Install all workspace dependencies (rush manages this; do NOT run npm/pnpm install directly)
rush update
```

`rush update` resolves dependencies for all 28 projects (ballerina packages + the
submodule's shared common-libs + the LS package.json stub). The first run takes
several minutes; subsequent runs hit the install cache.

## Day-to-day commands

```bash
# Build everything — TS packages, grammar, LS (via Gradle), and the extension
# (webpack + vsce package). All 27 projects are reachable from ballerina-extension,
# so `rush build` and `rush build --to ballerina` are equivalent.
# Requires Java 21 + packageUser / packagePAT for the LS. Skips ./gradlew test/check.
rush build

# Skip the LS entirely — build only the TS chain up to the visualizer
rush build --to @wso2/ballerina-visualizer

# Only the LS (Gradle)
rush build --to ballerina-language-server
# or directly:
cd packages/ballerina-language-server && ./gradlew build pack -x test -x check

# Watch mode for the extension itself (webpack --watch)
cd packages/ballerina-extension && pnpm run watch-ballerina

# Run only the diagram snapshot tests
rush build --to @wso2/bi-diagram
cd packages/bi-diagram && pnpm test

# Update lockfile after editing a package.json
rush update

# Clean up
rush purge   # nuke node_modules + .rush dirs
```

After a successful `rush build --to ballerina` you'll find `ballerina-X.Y.Z.vsix`
at `packages/ballerina-extension/ballerina-*.vsix`.

## Running and debugging the extension

Open the repo in VS Code and press **F5**. The root `.vscode/launch.json` provides:

| Configuration | Use case |
|---|---|
| **Ballerina Extension** | Primary: extension host + `watch-ballerina` |
| **Ballerina Extension (no watch)** | Faster launch if you've already built |
| **Ballerina Extension Tests** | Mocha tests in extension host |
| **Ballerina Extension AI Tests** | AI test fixtures |
| **Debug Ballerina UI Tests** | vscode-extension-tester (Selenium-style) |
| **Attach to Ballerina Language Server** | Java debugger attach on port 5005 |

To debug the language server: run the **`build:ballerina-language-server (with debug agent)`**
task (Cmd+Shift+P → "Tasks: Run Task") and then launch **Attach to Ballerina Language Server**.

## Testing

How to run, write, and add tests at every level is in [docs/TEST_GUIDE.md](docs/TEST_GUIDE.md). In short,
we push tests **down** a layered pyramid so most coverage is fast and deterministic:

| Layer | What | Runs in |
|---|---|---|
| **L0** Static | TS strict + shared contract types | compile |
| **L1** Unit | pure logic (codegen, search, range math) | Jest, node |
| **L2** Component | fixture → render → assert *semantics* (the workhorse: forms, diagrams) | Jest + jsdom + RTL |
| **L3** Contract | rpc-manager request/response shapes vs recorded LS fixtures | Jest, node, `vscode` mocked |
| **L4** LS integration | a real headless LS over stdio (no VSCode) + nightly fixture validation | Jest, node |
| **L5** E2E smoke | ~critical journeys only | Playwright + VSCode |
| **L6** QA-owned | visual / UX / perf — not automated | humans + perf scripts |

**Deciding where a test goes:** pure in/out → L1. "Does the right UI render for this
data?" → L2. "Do the two sides exchange the right message?" → L3. "Does the LS produce
the right model?" → L4. Whole app → L5 (only if no lower layer can see it).

### Running the fast tests (L0–L3)

Fast tests use **Jest** (Node ≥ 20 required):

```bash
# one package
cd packages/ballerina-side-panel && pnpm test

# what CI runs: every package that has a jest.config.js
for cfg in packages/*/jest.config.js; do ( cd "$(dirname "$cfg")" && pnpm test ); done
```

CI runs the same set in the **`fast-tests`** job on every PR (it auto-discovers any
package with a `jest.config.js` — see `.github/workflows/reusable-build.yml`).

### Adding tests to a package

Shared Jest config, jsdom mocks and fixture helpers live in `@wso2/test-config`. A new
package opts in with a 3-line `jest.config.js` — see
[packages/test-config/README.md](packages/test-config/README.md) for the recipe and the
`renderField` / `mockEditors` form-test helpers.

### Capturing fixtures

Tests replay recorded LS/RPC traffic instead of spawning the LS. To record real traffic,
launch the extension (or an E2E run) with recording on:

```bash
BAL_RECORD_FIXTURES=1 BAL_FIXTURES_DIR=/tmp/fixtures  # then run the app / a flow
```

Curate the JSON under `packages/<pkg>/src/test/fixtures/<method>/`, naming regression
cases `issue-<n>.json`. Secrets and machine paths are redacted on capture.

### Regression policy

**Every bug fix ships a fixture-driven test named after its issue** (`issue-<n>.json` +
an assertion), so the bug can't silently return. Reviewers should ask for it. For
first-occurrence (non-regression) bugs, prefer an **invariant** test (a rule asserted
over the whole fixture corpus, e.g. "every array-typed field renders the array editor")
so untested siblings of the reported bug are caught too.

## Working with the language server jar

The extension reads its LS jar from `packages/ballerina-extension/ls/*.jar`. That jar is
**always** the `pack` output of `packages/ballerina-language-server` in this repo. Rush
builds or restores the LS first through the extension's `workspace:*` dependency; the
extension's `postbuild` then runs `copyLS`, clears `ls/`, derives the exact expected jar
name from the extension manifest, and copies it from the LS `build/` directory. A missing
matching jar fails the build. There is no download fallback or alternate LS selector.

The language server does not have an independently authored version. Set the version in
`packages/ballerina-extension/package.json`; `vsce` reads it directly and Gradle reads the
same manifest at configuration time. There is no generated version file and no build step
rewrites tracked files.

This changes the published language-server artifact from its former independent `1.8.x`
line to the extension's `5.x` line. Consumers pinning
`io.ballerina:ballerina-language-server` must use the corresponding extension version.

After changing the extension version, rebuild the LS before packaging so the exact
versioned jar exists. A stale jar from another version is never selected.

Building the extension therefore requires being able to build the LS: JDK 21 and
GitHub Packages credentials (`packageUser` / `packagePAT` in `~/.gradle/gradle.properties`).

```bash
# Rebuild the LS, then build the extension and copy the exact jar.
rush build --to ballerina-language-server
rush build --to ballerina

# Directly with Gradle — reads the extension manifest by default
cd packages/ballerina-language-server && ./gradlew pack -x test

# Force a one-off version (does not touch any file)
./gradlew pack -x test -Pversion=9.9.9-local
```

## Working with the TextMate grammar

The grammar source lives at `packages/ballerina-grammar/`. During the extension build,
the `copyGrammar` script copies just `syntaxes/` into
`packages/ballerina-extension/grammar/ballerina-grammar/syntaxes/` (gitignored). Edit
the canonical source, then re-build the extension.

## Working with the common-libs submodule

`submodules/wso2-vscode-extensions/` is the `wso2/vscode-extensions` repo pinned to
the `release/ballerina-5.12.x` branch. Rush treats four of its packages as workspace
projects (`@wso2/font-wso2-vscode`, `@wso2/ui-toolkit`, `@wso2/playwright-vscode-tester`,
`@wso2/copilot-utilities`) plus `@wso2/wso2-platform-core`.

```bash
# Update the submodule to the latest commit on the pinned branch
git submodule update --remote submodules/wso2-vscode-extensions
git add submodules/wso2-vscode-extensions
git commit -m "Bump common-libs submodule"

# Test a local change in a common-lib
cd submodules/wso2-vscode-extensions/workspaces/common-libs/ui-toolkit
# edit files
cd -
rush build --to ballerina   # rush picks up the change via workspace:* linking
```

Local edits in the submodule are committed against the submodule's branch, not the
monorepo. If you want them to land here, push them upstream to
`wso2/vscode-extensions` first, then bump the submodule pointer.

## Branching and release

- `main` — active development. Carries `X.Y.0-SNAPSHOT` with an **even** minor.
- `X.Y.x` — release lines (`5.14.x`, `5.16.x`). Even minors are release lines, odd minors
  are the pre-release channel. Cut by hand when a line opens; they carry a **concrete**
  version, never `-SNAPSHOT`.
- `release/X.Y.Z` — one branch per release, pushed by `release-pre-release.yml` and PR'd into its
  `X.Y.x` line.
- `alpha` — staging for alpha builds; concrete version, set by hand.
- `migrate/*` — long-lived migration work
- `builds/nightly` — **machine-managed, do not touch.** `schedule.yml` resets it to
  `origin/main` for scheduled runs or the selected source branch for manual runs, then
  force-pushes it with a single version commit. Never target it with a PR and never merge
  it anywhere; anything committed to it is gone by the next run.

PR → `main` triggers `pull-request.yml` (extension build + tests, LS build if you
touched LS code). PR → a `X.Y.x` release line is intended to add the bal E2E suite
automatically, but that suite is currently disabled and does not run until the
`ExtTest_Ballerina` job is re-enabled.

The version lives in **`packages/ballerina-extension/package.json`** — that is the single
source of truth — and on `main` it always names the *next* release as a snapshot, e.g.
`5.14.0-SNAPSHOT`. It is the only version anyone edits. `vsce` reads it directly, and the
language-server Gradle build reads the same manifest during configuration.
`-Pversion=<v>` remains available for a one-off Gradle build.

`-SNAPSHOT` is never shipped: each publishable build derives a concrete version from it
(nightlies and pre-releases become `major.(minor-1).<minutes since 2020-01-01 UTC>`, so `5.14.0-SNAPSHOT`
ships nightly as `5.13.3458370` and releases as `5.14.0`), and the build fails
outright if the suffix survives to packaging. Only `main` carries `-SNAPSHOT` — on a
release line or `alpha` the authored version ships as-is, so bump those by hand between
releases. After a release cut from `main`, the release workflow opens a PR returning `main`
to `major.(minor+2).0-SNAPSHOT` (`+2` keeps it on an even minor); without it the next
nightly cannot derive a version. See the Versioning section of
`.github/workflows/README.md` for the full table.

Release process is documented at `.github/workflows/README.md`:
1. **release-pre-release** workflow (manual dispatch) — builds, optionally creates the
   GitHub release, pushes `release/<version>`, and opens the release PR into the `X.Y.x`
   line (skipped with a notice if that line branch does not exist yet).
2. **publish-vsix** workflow (manual dispatch) — takes the workflow run ID of the
   release build and publishes the VSIX to VSCode Marketplace + OpenVSX.

## Commit / PR conventions

- Keep commits scoped to a single concern. Don't mix submodule updates with feature work.
- Prefer descriptive messages over template-driven ones. A PR description that explains
  *why* is far more valuable than ten one-line conventional commits.
- Add labels on PRs to opt into heavier CI:
    - `Checks/Run Ballerina UI Tests` — runs the bal E2E suite on the PR
    - `Runner/AWS` — runs CI on the AWS CodeBuild runner pool

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Username must not be null!` in Gradle | Missing GitHub Packages auth | Set `packageUser`/`packagePAT` in `~/.gradle/gradle.properties` |
| `Cannot connect to the Docker daemon` during LS build | persist-service integration tests | Skip with `-x test` (already default in rush build) |
| `Dependency resolution is looking for ... JVM 17, but ... 21 or newer` | `JAVA_HOME` points at JDK 17 | `export JAVA_HOME=$(/usr/libexec/java_home -v 21)` |
| `tracked input file` rush error | Stale `lib/`/`build/` dir in a package | Run `rush purge && rush update` and rebuild |
| `Cannot find module '@wso2/...'` after pulling | Submodule out of date / lockfile changed | `git submodule update --init --recursive && rush update` |
| LS jar copy fails with `ENOENT` | The exact versioned jar is missing from `packages/ballerina-language-server/build/` | Build with Rush so it builds the LS dependency first, or run `rush build --to ballerina-language-server` |
| VSIX has an unexpected version | The extension manifest carries the wrong version, or a stale VSIX was selected | Set the version in `packages/ballerina-extension/package.json`, remove stale VSIXes, then `rush build --to ballerina` |
| `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` | Missing rush project registration or submodule not initialized | Check `rush.json`; verify `submodules/wso2-vscode-extensions/` is populated |

## Where to read next

- `AGENTS.md` — guidance for AI coding agents working in this repo
- [`docs/TEST_GUIDE.md`](docs/TEST_GUIDE.md) — how to run, write, and add tests at every level
- `.github/workflows/README.md` — what each CI workflow does, and required secrets
- `packages/ballerina-language-server/README.md` — language server architecture
- Upstream Rush documentation: <https://rushjs.io>
