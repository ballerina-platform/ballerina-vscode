# Agent guide

For AI coding agents (Claude Code, Cursor, Aider, etc.) operating in this repo.
This file captures the things that aren't obvious from reading the code and that
agents repeatedly get wrong on their first try.

Human contributors should read `CONTRIBUTING.md` first. This document assumes that
context.

## Project shape in one paragraph

`ballerina-vscode` is a **rush.js monorepo** combining the Ballerina VS Code
extension (`packages/ballerina-extension`), its Gradle-built Java language server
(`packages/ballerina-language-server`), the TextMate grammar
(`packages/ballerina-grammar`), and ~20 supporting webview / diagram TypeScript
packages also under `packages/`. Shared `@wso2/*` libraries are consumed via a
**git submodule** at `submodules/wso2-vscode-extensions/` pinned to the
`release/ballerina-5.12.x` branch. Rush treats both `packages/*` and a handful
of common-libs inside the submodule as workspace projects.

## Rules of engagement

### 1. Use rush. Don't run `npm install` or `pnpm install` directly.

`rush update` is the only way to install dependencies. Running pnpm or npm
directly will diverge from `common/config/rush/pnpm-lock.yaml` and produce
ambiguous failures the next time someone runs rush.

### 2. The full build needs LS prerequisites.

```bash
rush build                                       # everything (equivalent to --to ballerina)
rush build --to ballerina-language-server        # LS only
rush build --to @wso2/ballerina-visualizer       # one package + its deps (skips LS + extension)
```

All 27 projects in `rush.json` are reachable from `ballerina-extension`, so
`rush build` and `rush build --to ballerina` build the same set. Either form
requires:

- Java 21 on `JAVA_HOME`
- `packageUser`/`packagePAT` in `~/.gradle/gradle.properties` (or the env)

If you don't have those set up, skip the LS by building one of its dependents
directly, e.g. `rush build --to @wso2/ballerina-visualizer` — that skips
both `ballerina-extension` and the LS.

### 3. Use the existing TypeScript / build infrastructure; don't invent new tooling.

The repo has settled conventions:
- All packages build with TypeScript (`tsc`) into `lib/`, or webpack into `dist/`/`build/`.
- The extension uses webpack with the config at `packages/ballerina-extension/webpack.config.js`.
- VSIX packaging uses `vsce` via `submodules/.../common-libs/scripts/package-vsix.js`.
- Project graph and topological order are managed entirely by `rush.json` + workspace `:*` refs.

Don't add a new task runner, alternative bundler, or per-package install
scripts. If you think you need one, raise it first.

### 4. Don't edit `lib/`, `build/`, `dist/`, `out/`, or `packages/ballerina-extension/grammar/ballerina-grammar/`.

These are generated artifacts. They're gitignored or they live in a copy that
`copyGrammar` overwrites on every build. Edit the source under `src/` or the
canonical package (`packages/ballerina-grammar/syntaxes/` for grammars).

### 5. Don't push past hook failures.

Pre-commit hooks (eslint, format) sometimes fail on legitimate, unrelated lint
debt. Fix the lint issue or scope your change away from it. Never use
`--no-verify`.

### 6. Submodule changes are not monorepo changes.

If you edit something under `submodules/wso2-vscode-extensions/`, that's a
change to a **separate git repo**. The monorepo only tracks the submodule's
commit SHA. So:

- Local edits there will not be picked up by anyone else until you push them
  upstream to `wso2/vscode-extensions` and update the submodule pointer here.
- Don't commit submodule edits in a single combined commit with monorepo
  changes; the diff will be confusing.
- Prefer fixing things in the consumer (the ballerina packages) over editing
  the submodule, unless the change really belongs in the shared library.

## Common task recipes

### "Build and verify the extension"

```bash
rush update           # only if package.json / lockfile changed
rush build --to ballerina
# Result: packages/ballerina-extension/ballerina-X.Y.Z.vsix
```

### "Run the extension in a debugger"

Open the repo in VS Code, press F5. The default config is "Ballerina Extension".
Don't try to wire up your own launch config; the root `.vscode/launch.json`
already covers extension + tests + LS attach.

### "Reproduce a CI failure locally"

The PR workflow (`.github/workflows/pull-request.yml`) calls `.github/workflows/reusable-build.yml`
which delegates to the composite action at `.github/actions/build/action.yml`.
That action ultimately does:

```bash
node common/scripts/install-run-rush.js build --to ballerina --verbose
```

Running that exact command locally is the closest reproduction.

### "Change the LS jar shipped in the vsix"

The extension package's `copyLS` command copies the exact versioned jar into `ls/`.
Rush builds or restores `ballerina-language-server` first through the `workspace:*`
dependency. The jar is always that project's local `pack` output — there is no download
path and nothing to select. To change the shipped jar, rebuild the LS
(`rush build --to ballerina-language-server`).

**The version is authored in exactly one file:
`packages/ballerina-extension/package.json`.** `vsce` reads it directly, and the
language-server Gradle build reads the same manifest at configuration time. To change the
extension and LS version, edit that field and nothing else. `-Pversion=<v>` remains
available for a one-off Gradle build without changing the manifest.

### "Add a dependency to a package"

1. Edit the package's `package.json`.
2. For cross-package deps, use the `workspace:*` protocol (e.g.
   `"@wso2/ballerina-core": "workspace:*"`).
3. Run `rush update`.
4. Commit `package.json` AND `common/config/rush/pnpm-lock.yaml`.

### "Add a new package under packages/"

1. Create the dir with a `package.json` (name + version + scripts).
2. Register it in `rush.json` under `projects[]`.
3. Run `rush update`.

## Writing tests

**Read [`docs/TEST_GUIDE.md`](docs/TEST_GUIDE.md) first — it has, per level, what it is / how to run / how to add / example files to copy.** This is the authoritative how-to; the rules below are the non-negotiables.

**Levels & where they run.** Four **scope levels** ordered by how much of the system each test runs — L1 unit/contract (pure logic + shared-type/enum invariants), L2 component (render), L3 LS-integration, L4 E2E — plus an **orthogonal Perf/QA suite** (performance is non-functional and cuts across L1–L4, so it isn't a numbered level). L1 and L2 are **fast, PR-gated** — a package's tests run in CI **only** via a file named exactly `jest.config.js`. L3 (headless LS), L4 (E2E), and perf need Java + a Ballerina distribution (or VSCode) and **must use another config filename** (`jest.ls-integration.config.js`, `jest.realdata.config.js`, `jest.headless-view.config.js`, `jest.perf.config.js`) so they never run on every PR; they `describe.skip` when no distro is found. **Never rename an LS/E2E/perf config to `jest.config.js`.**

**Core rules (apply at every level):**
- **Invariants over per-issue tests.** Assert a *rule over a corpus* ("every array-typed field renders an array editor"), not one reported case. A bug fix ⇒ a fixture feeding the relevant invariant, named `issue-<n>.json`.
- **Don't touch production code to make something testable** — except the one sanctioned move: if a pure function is trapped in a heavy module (e.g. `bi.tsx`), **extract it into a narrow-import sibling and re-export** so importers are unaffected (see `utils/diagnostics.ts`, `utils/range.ts`). Verify importers still resolve + `tsc --noEmit` clean.
- **New test file** = WSO2 Apache-2.0 header, year **2026**. Copy from any existing test.
- **Before pushing:** the affected package's `test` is green (or intentionally red with a documented comment + issue link). L3/L4 + perf need the distro.

**Adding tests to a package with none** (3 lines): add the devDeps + `@wso2/test-config`, create `jest.config.js` = `{ ...require('@wso2/test-config/jest-preset'), rootDir: '.' }` (add `testEnvironment: 'node'` for host-side), `rush update`. Recipe: [`packages/test-config/README.md`](packages/test-config/README.md). Also add a `tsconfig.spec.json` (copy a sibling's) + a `test:typecheck` script.

**Type-check your test code.** Test files aren't type-checked by the build (excluded) or by babel/ts-jest at run time, so run `node scripts/typecheck-tests.js` before pushing — it `tsc --noEmit`s every package's `tsconfig.spec.json` and gates on test-file errors (a wrong prop, a removed export, a mis-shaped fixture). Don't silence a real error with `as any`; fix the type.

**L2 — the one rule:** *render the component with the context it needs, feed it synthetic data for invariants/edge-cases or a captured fixture for fidelity/drift.*
- Context = what the component reads: props → `render(<C {...data}/>)`; `useFormContext` → `renderWithForm` (`ballerina-side-panel/src/test/formHarness.tsx`); `useRpcContext` → `renderWithRpc` + a **fake rpc client** (`rpcHarness.tsx`; mock the `@wso2/ballerina-rpc-client` barrel to delegate to the harness so component + Provider share one context).
- Synthetic data (hand-authored) → fast, PR, for edge cases the LS won't hand you. Captured real data → the **capture→file→render split**: a nightly `*.capture.test.ts` writes/drift-checks `fixture.json` from the live LS; a fast `*.render.test.tsx` loads it and snapshots the render.
- **god-managers (bi-diagram rpc-manager) can't be imported** — their graph pulls all of `core/extension.ts`. Cover them via captured fixtures, never by importing.
- **jsdom limits** (don't fight): CodeMirror expression/chip editors don't instantiate; interaction that advances `requestAnimationFrame` (array add/remove, save-button enable) throws `IndexSizeError`. Push those to L4 (E2E).

## Things that look broken but aren't

| Observation | Reality |
|---|---|
| `Cannot connect to the Docker daemon` during LS build | Persist-service integration tests want Docker. We `-x test` by default. The actual blocker is usually GitHub Packages auth, shown above this line. Read carefully. |
| `unmet peer eslint`/`react` warnings on `rush update` | Same as in source repo. The pnpm overrides keep transitive deps pinned; the peer warnings are loud but inert. |
| `Icon not found in wso2-vscode font: delete` warning during font build | Pre-existing in source repo. The font registry doesn't have a `delete` glyph yet. Not a regression. |
| 263 files in vsix, including 185 JS files | `vsce package` warns about not bundling; we already use webpack, but resources (jslibs, fonts, grammar, codicons) are deliberately unbundled. Ignore the warning. |
| Per-package `.vscode/launch.json` exists alongside root | Both are valid. The root one is what you usually want. Per-package configs use `${workspaceFolder}` relative to that package and are scoped for working *inside* a single package's window. |

## Files that contain the truth

When in doubt about behavior, read these instead of guessing:

| Question | File |
|---|---|
| What gets built when? | `rush.json` + each package's `package.json` `scripts` block |
| What's in the vsix? | `packages/ballerina-extension/.vscodeignore` + `vsce` output |
| Why is this script doing X? | `packages/ballerina-extension/scripts/*.js` — small, readable |
| Why is CI doing X? | `.github/workflows/*.yml` + `.github/actions/*/action.yml` + `.github/workflows/README.md` |
| What version of pnpm/node/rush? | `rush.json` (top), `common/config/rush/pnpm-config.json` |
| What changed recently? | `git log --oneline -30` — commit messages here are descriptive |
| How do I write/run/add a test? | [`docs/TEST_GUIDE.md`](docs/TEST_GUIDE.md) — per-level explain / run / add / example files |

## Migration history (for context)

This monorepo was assembled in 2026-05 by extracting:

- 20 ballerina packages from `wso2/vscode-extensions/workspaces/ballerina/` (via `git-filter-repo`, history preserved)
- The grammar from `ballerina-platform/ballerina-grammar` (history preserved)
- The language server from `ballerina-platform/ballerina-language-server` (history preserved)

Common-libs were intentionally kept in the source repo and pulled in via
submodule rather than re-extracted, to avoid forking infrastructure shared
across multiple WSO2 extensions.

If you find references to old paths (`workspaces/ballerina/...`) anywhere,
they're either:
- Inside the submodule (correct — it's the old layout there).
- A bug we missed in migration; fix it.

## When you're unsure

Read `CONTRIBUTING.md`, `.github/workflows/README.md`, then `git log --oneline -50`
to see how the most recent changes were structured. Ask for clarification rather
than guessing on these:

- Submodule branch / SHA changes
- Rush plugin / build-cache configuration
- VSIX packaging and marketplace publishing (irreversible once pushed)
- Anything that involves credentials
