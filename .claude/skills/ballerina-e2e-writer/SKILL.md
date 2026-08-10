---
name: ballerina-e2e-writer
description: Use when adding or updating Ballerina extension E2E tests that need agent-assisted VS Code authoring before promotion into the Playwright suite.
---

# Ballerina E2E Writer

Use this skill when adding new Ballerina extension user-flow E2E coverage in
`packages/ballerina-extension`.

> Scope: work only inside `packages/ballerina-extension`. Do **not** edit the
> `submodules/` tree or shared/common libraries.

For user-facing instructions and prompt examples, see `USER_GUIDE.md` in this
skill directory.

## Workflow

1. Read the requested scenario and existing tests in
   `packages/ballerina-extension/e2e-test/e2e-playwright-tests`. Before writing
   anything, check whether an existing spec already covers the scenario — the
   tracking sheet can be out of date. If covered, document the real flow and
   flag gaps instead of duplicating.
2. Ensure the Ballerina VSIX exists locally. The e2e harness installs from
   `packages/ballerina-extension/vsix/*.vsix`. If none is found, build it:

   ```bash
   rush build -t ballerina
   ```

3. Create `scenario.md` under the authoring scenario directory before writing
   any step files:

   ```text
   packages/ballerina-extension/e2e-test/e2e-authoring/scenarios/<scenario-name>/scenario.md
   ```

   If the user only described the scenario in the prompt, derive the steps and
   write `scenario.md` now. If the user provided a `scenario.md` path, read it
   first. Keep it short: a prose paragraph describing one concrete, verifiable
   end-to-end flow, optionally with a steps table and a "Gaps" section.

4. Write small step files in `steps/*.step.js`. Keep each step focused and
   rerunnable. For diagram flows, steps must build the flow through the product
   UI: click the diagram plus button, open the node palette, search or select
   the node, fill the form, then save.
5. Run the steps through the named daemon:

   ```bash
   bash packages/ballerina-extension/e2e-test/e2e-authoring/scripts/run-steps.sh <scenario-name> packages/ballerina-extension/e2e-test/e2e-authoring/scenarios/<scenario-name>/steps
   ```

6. If a selector is unstable or an element cannot be found by `data-testid`, add
   a stable `data-testid` attribute to that element in the relevant
   `packages/*/src` UI package. Do not use dynamic/generated class names as
   selectors, including Emotion class names.
   After adding any `data-testid` — even a single attribute in one file — always
   rebuild the VSIX and reinstall it before rerunning steps:

   ```bash
   rush build -t ballerina
   ```

   Then reinstall the newly built VSIX into the test VS Code instance (the
   harness installs from `packages/ballerina-extension/vsix/`). If the VS Code
   instance is already running the old extension version, stop it, reinstall the
   VSIX, and restart before retrying.

   **If the installed version looks unchanged** (VS Code loads the cached build
   because the version string is identical): bump the version in
   `packages/ballerina-extension/package.json` by appending a timestamp suffix,
   e.g. `"5.12.0"` → `"5.12.0-20260520"`. Then rebuild and reinstall. This forces
   VS Code to treat it as a genuinely new extension version, bypassing any cached
   install. Once the selector is confirmed working you can revert the version
   string.

7. Once the step flow is proven, promote the same UI flow into a new spec file.
   Place the spec in the subdirectory that best matches the integration category,
   following the existing layout:

   ```text
   packages/ballerina-extension/e2e-test/e2e-playwright-tests/<category>/<scenario-name>.spec.ts
   ```

   Existing categories: `api-integration`, `automation`, `configuration`,
   `copilot`, `data`, `datamapper`, `diagram`, `event-integration`,
   `expression-editor`, `file-integration`, `import-integration`,
   `other-artifacts`, `project-explorer`, `project-overview`, `rundebug`
   (with `debug`/`run`/`run-concurrent`/`run-conflict` subfolders),
   `service-designer`, `test-function`, `tryit`, `type-editor`. Check the
   subdirectories and pick the closest match.
8. Register the promoted spec in
   `packages/ballerina-extension/e2e-test/e2e-playwright-tests/test.list.ts`
   (add the `import` and the matching `test.describe(...)`).
9. Verify with:

   ```bash
   cd packages/ballerina-extension
   npm run e2e-test -- --grep "<test name>"
   ```

   A passing run prints each `logStep` line to the terminal and exits 0. If the
   extension fails to launch, check the VS Code host stderr for VSIX load errors
   — this means a stale build; rebuild and rerun.

## Harness Rules

- The authoring daemon is only for scenario discovery and fast iteration.
- The committed source of truth is the normal Playwright spec.
- Use `@wso2/playwright-vscode-tester` launch behavior through the authoring daemon.
- Prefer existing helpers: `initTest`, `getWebview`, `addArtifact`,
  `ProjectExplorer`, `Form`/`switchToIFrame`, and feature utils (e.g.
  `GraphQLServiceUtils`, `TypeEditorUtils`).
- Extension webview action selectors should be `data-testid`, stable roles, or
  stable accessible names. If an element has no `data-testid`, do not work around
  it with fragile selectors — add the `data-testid`, rebuild, reinstall, and retry.
- VS Code shell selectors may use stable workbench ARIA labels where needed.
- Do not create or modify Ballerina flow files directly to build the scenario.
  Source files may be read for final verification only.
- Build diagram flows top-to-bottom so each saved form leaves the project
  compilable for the next form.
- When a form input opens the helper panel, either use it intentionally to choose
  inputs/variables or press `Escape` to dismiss it before saving. The helper panel
  can cover the Save button.
- Fill form fields through stable labels, `data-testid`, CodeMirror helpers, or
  helper-panel selections. Never select extension UI by dynamic/generated class
  names such as Emotion CSS classes.
- Add terminal-visible progress logs for each major E2E step using `logStep` from
  `e2e-playwright-tests/utils/helpers`, so headless failures show the last
  completed action.
- Always use the authoring harness first, then promote the passing UI flow into
  `e2e-playwright-tests`, and verify with `npm run e2e-test -- --grep "<test name>"`.

## Useful Commands

Run all authoring steps for a scenario:

```bash
cd packages/ballerina-extension
bash e2e-test/e2e-authoring/scripts/run-steps.sh http-upload e2e-test/e2e-authoring/scenarios/http-upload/steps
```

Run a step range:

```bash
bash e2e-test/e2e-authoring/scripts/run-steps.sh http-upload e2e-test/e2e-authoring/scenarios/http-upload/steps 02 03
```

Run promoted test:

```bash
cd packages/ballerina-extension
npm run e2e-test -- --grep "HTTP Upload"
```
