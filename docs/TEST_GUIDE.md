# Test Implementation Guide

How to run, write, and add tests for the Ballerina VSCode extension — one section per scope level (plus the orthogonal perf/QA suite), each with **what it is · how to run · how to add · example files**.

> **North star:** prefer **suite-level invariant tests that catch a whole _class_ of bug** over one targeted test per issue. A good test specifies *correct behaviour over a corpus*, so it also catches the next, not-yet-reported instance.

---

## Prerequisites (one-time)

Rush monorepo; Node **≥20 <23** (the shared machine defaults to old Node — use nvm).

```bash
nvm use 22.21.1
node common/scripts/install-run-rush.js update    # install/refresh all deps
```

- **L1–L2** (the fast PR suite) need nothing extra.
- **L3 (LS-integration)** and the **perf suite** additionally need **Java 21** + a **Ballerina distribution** (`~/.ballerina/ballerina-home/bin/bal`). These tests **auto-skip** when no distribution is found, so they never block the fast suite.
- **L4 (E2E)** needs the built `.vsix` + a downloaded VSCode (via `extest`).

**The rule that keeps the PR suite fast:** the fast CI job auto-discovers a package's tests **only if its config file is named exactly `jest.config.js`**. LS/perf/E2E use other config names (`jest.ls-integration.config.js`, `jest.perf.config.js`, `jest.realdata.config.js`, `jest.headless-view.config.js`) so they never run on every PR.

---

## The levels

Four **scope levels**, ordered by how much of the system each test actually runs, plus one **orthogonal** suite (perf/QA) that cuts across all of them.

| Level | Tests | Runtime | Env | PR-gated | Location |
|---|---|---|---|---|---|
| **L1** Unit / contract | pure logic + shared-type (enum) invariants | ms | node/jsdom | ✅ | `<pkg>/src/**`, `ballerina-core/src/test` |
| **L2** Component (render) | React components from data | 10–100 ms | jsdom | ✅ | `<pkg>/src/**` |
| **L3** LS-integration | real headless LS over stdio | seconds | node/jsdom | ❌ nightly | `ballerina-extension/.../ls-integration` + `*.capture.test.ts` |
| **L4** E2E smoke | full VSCode via Playwright | minutes | vscode | matrix | `ballerina-extension/e2e-test` |
| _orthogonal_ · **Perf / QA** | latency baselines, visual/a11y | seconds | node | ❌ manual | `ballerina-extension/.../perf` |

Push tests **down** the pyramid: anything provable at a lower scope level never gets written higher. **Perf/QA is not a scope tier** — performance is a non-functional dimension that cuts across L1–L4 — so it's tracked as its own suite rather than a numbered level. The host↔LS/webview **rpc contract** likewise isn't its own tier — the request/response ride on captured fixtures (consumed at L2) and are re-checked by the L3 drift-check; see [L2 → captured data](#choice-2--the-data-source-by-intent).

---

## L1 — Unit / contract (pure logic + shared-type invariants)

**What.** In-process tests with no I/O, in two flavours:
- **Unit (pure logic):** transforms, codegen, search/matching, diagnostic filtering, range math, validation. No DOM. Fast and precise. Where the target lives in a heavy module (e.g. `bi.tsx`), **extract it into a narrow-import sibling module and re-export** so it's testable without dragging UI deps — e.g. `utils/diagnostics.ts`, `utils/range.ts`.
- **Contract (shared-type invariants):** `@wso2/ballerina-core` is ~95% compile-time-only types (erased at runtime, guarded by the TS build). The runtime-testable surface is the **enums** — the discriminants both the host and webviews branch on and that cross the LS/RPC wire as JSON. The contract suite auto-discovers every exported enum and asserts rules over all of them: unique/non-empty values, valid keys, no barrel name-collision, and **wire-safety** (string-valued unless an audited numeric exception). These assert over an enum *table* rather than a function, but they still execute code in-process — so they're unit-level contract tests, not a separate static tier (`tsc`/lint are the actual static checks).

**How to run.**
```bash
pnpm --filter @wso2/ballerina-core test        # contract invariants
pnpm --filter @wso2/ballerina-side-panel test
pnpm --filter @wso2/ballerina-visualizer test
```

**How to add.** For pure logic, write a table-driven suite that asserts a *rule* over inputs, not one case:
```ts
import { filterTypeBrowserItems } from "./utils";
it.each([["case", input, expected], ...])("%s", (_n, input, expected) =>
    expect(fn(input)).toEqual(expected));
```
If the function is trapped in a heavy file, extract it first (move + re-export; verify importers still resolve + `tsc --noEmit`). For a contract invariant, add the enum-bearing module to the `MODULES` map in the suite (discovery covers its enums automatically); for a *new* invariant, add an assertion inside the `describe.each` over `ENUMS`.

**Example files.**
- [`enums.contract.test.ts`](../packages/ballerina-core/src/test/enums.contract.test.ts) — the auto-discovering enum contract-invariant suite.
- [`editorUtils.test.ts`](../packages/ballerina-side-panel/src/test/editorUtils.test.ts) · [`typeCompletionUtils.test.ts`](../packages/ballerina-side-panel/src/test/typeCompletionUtils.test.ts) · [`formValidationUtils.test.ts`](../packages/ballerina-side-panel/src/test/formValidationUtils.test.ts) — side-panel value/validation utils.
- [`diagnostics.test.ts`](../packages/ballerina-visualizer/src/utils/diagnostics.test.ts) · [`range.test.ts`](../packages/ballerina-visualizer/src/utils/range.test.ts) · [`convertConfig.test.ts`](../packages/ballerina-visualizer/src/utils/convertConfig.test.ts) — visualizer diagnostic filtering / range math / form assembly (extracted from `bi.tsx`).
- [`TypeBrowser/utils.test.ts`](../packages/ballerina-visualizer/src/views/BI/ServiceDesigner/components/TypeBrowser/utils.test.ts) — type-search matching invariants (#602/#619).

---

## L2 — Component (render semantics) — the workhorse

Render a real component and assert *meaning* (which editor is picked, a node/link is present, a value registers), not pixels. There's **one rule**, with two independent choices:

> **Render the component with the context it needs; feed it synthetic data for invariants & edge cases, or a captured fixture for fidelity & drift.**

### Choice 1 — the context (dictated by what the component reads)

| The component reads… | Render it with | Harness |
|---|---|---|
| props only | `render(<Comp {...data} />)` | — |
| `useFormContext` (editors) | `renderWithForm(<Editor field={…} />, { defaultValues })` | [`formHarness.tsx`](../packages/ballerina-side-panel/src/test/formHarness.tsx) |
| `useRpcContext` (views) | `renderWithRpc(<Comp … />, fakeClient)` | [`rpcHarness.tsx`](../packages/ballerina-side-panel/src/test/rpcHarness.tsx) |

This isn't a style choice — you provide exactly the context the component consumes. (rpc components import `useRpcContext` from the barrel; mock it to delegate to the harness so component and Provider share one context — see the snippet under *How to add*.)

### Choice 2 — the data source (by intent)

| | **Synthetic** (hand-authored) | **Captured** (real LS) |
|---|---|---|
| Purpose | invariants & **edge cases** (empty array, array-of-enum, malformed diagnostic, flag-gated node) | **fidelity & drift** — renders the LS's *actual* output shape |
| Tier | fast, PR-gated, no distro | nightly (needs a Ballerina distro) |
| You can craft any case? | yes | no — only shapes the LS emits |

Both feed any context above. They're complementary: synthetic proves the rules and the shapes the LS won't hand you; captured proves you still render today's real output. **Captured** uses a capture→file→render split so the PR stays fast:

```
[nightly, real LS]  *.capture.test.ts  → fetch live → write fixture.json / drift-check live == committed
[fast PR, no LS]    *.render.test.tsx  → load fixture.json → render component → snapshot + semantic assert
```

The committed fixture is the **real rpc data in a file**; the fast test renders + snapshots it; the drift assertion (which also covers the host↔LS **contract** — the fixture carries `{request, response}`) runs nightly.

### How to run
```bash
pnpm --filter @wso2/ballerina-side-panel test
pnpm --filter @wso2/bi-diagram test
# focus: npx jest DropdownEditor   |   npx jest -t "REPEATABLE_LIST"
# captured (nightly, needs distro): npx jest --config jest.realdata.config.js   (regen: BAL_UPDATE_FIXTURES=1)
```

### How to add
- **Editor** (form context, synthetic): `renderWithForm(<SomeEditor field={…} />, { defaultValues })` → assert label / options / `getForm().getValues(key)`.
- **Editor selection**: drop a `FormField` fixture in `fixtures/fields/` — the `EditorFactory` invariant runs it automatically.
- **rpc component** (rpc context, synthetic): mock the barrel to delegate to the harness, then `renderWithRpc(<Comp … />, fakeClient)`:
  ```ts
  jest.mock("@wso2/ballerina-rpc-client", () => {
      const h = require("./rpcHarness");
      return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
  });
  ```
- **Captured**: add a `*.capture.test.ts` that writes/drift-checks `fixture.json` from the live LS, and a fast `*.render.test.tsx` that loads it and snapshots the render.

> jsdom limits (document, don't fight): **CodeMirror** editors (expression/chip) don't instantiate in jsdom, and **interaction** that advances `requestAnimationFrame` (array add/remove, save-button enable) trips a jsdom `IndexSizeError`. Push those to **L4 (E2E)**.

### Example files
- **props + synthetic:** [`WarningPopup.test.tsx`](../packages/ballerina-side-panel/src/test/WarningPopup.test.tsx), [`CardList.test.tsx`](../packages/ballerina-side-panel/src/test/CardList.test.tsx), [`GroupList.test.tsx`](../packages/ballerina-side-panel/src/test/GroupList.test.tsx); diagram semantics [`bi-diagram Diagram.semantic.test.tsx`](../packages/bi-diagram/src/test/Diagram.semantic.test.tsx), [`sequence-diagram Diagram.semantic.test.tsx`](../packages/sequence-diagram/src/test/Diagram.semantic.test.tsx); DOM snapshot [`Diagram.test.tsx`](../packages/bi-diagram/src/test/Diagram.test.tsx).
- **form context + synthetic:** [`DropdownEditor.test.tsx`](../packages/ballerina-side-panel/src/test/DropdownEditor.test.tsx), [`CheckBoxEditor.test.tsx`](../packages/ballerina-side-panel/src/test/CheckBoxEditor.test.tsx), [`FormMapEditor.test.tsx`](../packages/ballerina-side-panel/src/test/FormMapEditor.test.tsx), [`SliderEditor.test.tsx`](../packages/ballerina-side-panel/src/test/SliderEditor.test.tsx) (…and more); selection invariant [`EditorFactory.test.tsx`](../packages/ballerina-side-panel/src/test/EditorFactory.test.tsx) (+ [`helpers.tsx`](../packages/ballerina-side-panel/src/test/helpers.tsx)).
- **rpc context + synthetic:** [`NodeList.test.tsx`](../packages/ballerina-side-panel/src/test/NodeList.test.tsx).
- **captured (capture → render pairs):** [`jsonToRecord.capture.test.ts`](../packages/record-creator/src/test/jsonToRecord.capture.test.ts) → [`jsonToRecord.render.test.tsx`](../packages/record-creator/src/test/jsonToRecord.render.test.tsx); [`Diagram.flowModel.capture.test.ts`](../packages/bi-diagram/src/test/Diagram.flowModel.capture.test.ts) → [`Diagram.flowModel.render.test.tsx`](../packages/bi-diagram/src/test/Diagram.flowModel.render.test.tsx).

---

## L3 — LS-integration (headless, no VSCode)

**What.** Drive the **real** language server over stdio (JSON-RPC) against small `.bal` fixture projects and assert model correctness — flow models, node templates, completions — plus the **capture/drift** tests above. No VSCode. Seconds to start the LS, then ms/request. Auto-skips without a distribution.

**How to run.**
```bash
cd packages/ballerina-extension && pnpm run test:ls-integration
# capture/drift tests (per package):
cd packages/bi-diagram      && npx jest --config jest.realdata.config.js
cd packages/record-creator  && npx jest --config jest.headless-view.config.js
# regenerate a fixture from the live LS:
BAL_UPDATE_FIXTURES=1 npx jest --config jest.realdata.config.js
```

**How to add.** Use the harness: `resolveBalCommand()` (skip if null) → `new LsHarness(bal)` → `start()` → `initialize(projectRoot)` → `didOpen(file)` → `request(method, params)`. Prefer **invariants over a corpus** (e.g. "array-typed param ⇒ REPEATABLE_LIST" across sampled connector actions) over one-off assertions. A **headless-host** variant runs a real *thin* rpc-manager by mocking `StateMachine.langClient()` to route to the harness (god-managers can't be imported — cover them via capture instead).

**Example files.**
- [`ls-harness.js`](../packages/test-config/ls-harness.js) — the shared spawn/initialize/request harness, published from `@wso2/test-config` and imported as `@wso2/test-config/ls-harness`.
- [`ls.test.ts`](../packages/ballerina-extension/src/test-support/ls-integration/ls.test.ts) — baseline LS requests.
- [`nodeTemplateInvariants.test.ts`](../packages/ballerina-extension/src/test-support/ls-integration/nodeTemplateInvariants.test.ts) — connector node-template type invariants (#1491 class; intentionally red until the LS bug is fixed).
- [`headlessHost.test.ts`](../packages/ballerina-extension/src/test-support/ls-integration/headlessHost.test.ts) — real rpc-manager handler against the real LS.

---

## L4 — E2E smoke (Playwright + real VSCode)

**What.** ~12 cross-boundary journeys that only a real VSCode instance can prove: activation, webview loads & wires up, create → run → deploy. Slow (minutes) — keep it to smoke, not edge cases (those belong at L1/L2).

**How to run.**
```bash
cd packages/ballerina-extension
pnpm run e2e-test-setup     # downloads VSCode + installs the vsix (once)
pnpm run e2e-test           # runs the Playwright specs
```

**How to add.** Add a Playwright spec under `e2e-test/e2e-playwright-tests/` driving the extension host. Also: an E2E run with `BAL_RECORD_FIXTURES=1` (or the [`capture-fixtures`](../packages/ballerina-extension/scripts/capture-fixtures.js) script) seeds L2 capture fixtures for free.

**Example files.**
- `packages/ballerina-extension/e2e-test/` (Playwright suite).

---

## Perf / QA (orthogonal — not a scope level)

**What.** Latency baselines and trend records (LS request latency, search, form-open), plus human-owned visual/UX/a11y review. **Not a level in the scope pyramid** — performance is a non-functional dimension that cuts across L1–L4 — so it's an orthogonal suite. Reported as trends, not merge gates.

**How to run.**
```bash
cd packages/ballerina-extension && pnpm run test:perf
```

**How to add.** Name the file `*.perf.ts` under `src/test-support/perf`; measure and **log** timings, assert only loose ceilings.

**Example files.**
- [`lsLatency.perf.ts`](../packages/ballerina-extension/src/test-support/perf/lsLatency.perf.ts) — LS request-latency baseline.

---

## Foundation (shared infra)

Not a level, but everything above depends on it:
- **`@wso2/test-config`** — the shared Jest preset (jsdom, transforms, asset mocks, single-React pin) + `loadFixture(s)`. Adopt in ~3 lines: add the devDeps + `jest.config.js` = `{ ...require('@wso2/test-config/jest-preset'), rootDir: '.' }`. Full recipe: [`packages/test-config/README.md`](../packages/test-config/README.md).
- **Fixture recorder** — [`fixtureRecorder.ts`](../packages/ballerina-extension/src/test-support/fixtureRecorder.ts): env-gated (`BAL_RECORD_FIXTURES`) taps on the LS client + webview RPC that dump `{method, request, response}`. Dormant otherwise (zero production impact).
- **Capture script** — [`capture-fixtures.js`](../packages/ballerina-extension/scripts/capture-fixtures.js) (`pnpm run capture-fixtures`): runs the E2E with recording on and dedupes the dump into per-method fixtures.

> **Review captured fixtures before committing.** Secret redaction is **key-name based** (`token`, `password`, `apiKey`, …) — a secret embedded inside a *value* under a non-matching key (e.g. a token in a URL query string) is **not** masked. The recorder is env-gated and fixtures are curated, so eyeball every new/updated `fixture.json` for leaked credentials or machine-specific data before it lands.

---

## Adding tests to a package that has none

```jsonc
// package.json
{ "scripts": { "test": "jest --coverage" },
  "devDependencies": { "@wso2/test-config": "workspace:*", "jest": "29.7.0", "ts-jest": "29.3.4",
    "babel-jest": "29.7.0", "@babel/core": "7.29.6", "@babel/preset-env": "7.27.2",
    "@babel/preset-react": "7.27.1", "@babel/preset-typescript": "7.27.1",
    "jest-environment-jsdom": "29.7.0", "@testing-library/react": "16.3.0",
    "@testing-library/dom": "10.4.0", "@types/jest": "29.5.14" } }
```
```js
// jest.config.js
const base = require('@wso2/test-config/jest-preset');
module.exports = { ...base, rootDir: '.' };          // testEnvironment: 'node' for host-side
```
Add a `tsconfig.spec.json` (copy a sibling's) and a `"test:typecheck": "tsc --noEmit -p tsconfig.spec.json"` script so the test code is type-checked (see below). Then `rush update` and `pnpm --filter <pkg> test`. The fast CI job auto-discovers the new `jest.config.js`.

---

## Type-checking test code

Test files are excluded from the emitting build (`tsconfig.json`) and babel/ts-jest don't type-check at run time — so a type error in a test (wrong prop, removed export, mis-shaped fixture) would otherwise ship silently. Each test package has a **`tsconfig.spec.json`** (`extends` its build tsconfig, `noEmit`, `include: src/**` for production context, shared `@wso2/test-config/jest-matchers.d.ts` ambient for jest-dom + Node globals). The CI step and [`scripts/typecheck-tests.js`](../scripts/typecheck-tests.js) run every package's `tsc --noEmit` and gate on **errors located in test files only** — pre-existing errors in production source (packages built via webpack never `tsc`) or in cross-package `src` imports are tallied but don't gate. Run locally: `node scripts/typecheck-tests.js` (all) or `pnpm --filter <pkg> test:typecheck` (one).

---

## Conventions checklist

- Invariants over targeted tests; a bug fix ⇒ a fixture feeding the relevant invariant (`issue-<n>.json`).
- Keep the fast suite fast: anything needing Java/LS/VSCode uses a non-`jest.config.js` config name.
- Extract, don't mock-the-world: a pure function trapped in a heavy module → move it to a narrow-import sibling + re-export.
- WSO2 Apache-2.0 header on every test file.
- Before pushing: the affected package's `test` is green (or intentionally-red with a documented `it`/comment + issue link), and `node scripts/typecheck-tests.js` passes.
