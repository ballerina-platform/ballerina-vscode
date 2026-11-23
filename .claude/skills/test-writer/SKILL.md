---
name: test-writer
description: Use when adding tests for a change in this repo, or when checking which tests a change or PR needs. Proposes a test plan (level, file, invariant, defect caught) for the diff, waits for confirmation, then writes and verifies unit, component, integration, Java language server, performance, and reliability tests. Hands E2E work to e2e-test-writer.
---

# Test Writer

Writes tests for a change at the lowest level that can catch its defects. Works in
two stages: a test plan that the developer confirms, then the tests.

Read before starting:
- `AGENTS.md` → "Writing tests": the rules every test follows.
- `docs/TEST_GUIDE.md`: how to run and add tests at each level, with example files.

This skill adds the decisions those documents do not make: which level, which
invariant, and whether a written test catches anything. Do not copy recipes from the
guide into tests from memory; open the guide section and one of its example files.

## Modes

- **Plan and write** (default): steps 1–6.
- **Plan only**: steps 1–3, then stop. Use for a PR review or a coverage question.
- **Direct**: the developer names a level and a target (for example "L2 for
  `DropdownEditor`"). Skip step 2 for that target, still present the plan, then write.

## 1. Read the change

- Default target: `git diff` against the merge base with the branch the work will
  merge into (`git diff $(git merge-base HEAD <remote>/<base>)`; check `git remote -v`
  for the remote that points at `ballerina-platform/ballerina-vscode`), or the PR or
  files the developer names. For a PR, use `gh pr diff <n>`, not a merge commit's
  first-parent diff. If the change is already committed, diff against its base commit
  (`git diff <base> HEAD`). Note the base: step 5 restores production files from it.
- For each changed file, note what behaviour changed, not only which lines.
- Find tests that already cover the changed code. Extending an existing invariant
  (often a new fixture in its corpus) is better than a new test file.
- Run those tests with the change applied. A test that fails now checks behaviour the
  change altered on purpose; it becomes an "update" row in the plan, not a new test.

## 2. Choose levels

Pick the lowest level that can catch the defect. Only add a higher level for a
defect the lower one cannot see.

| The change is in… | Level | Reference |
|---|---|---|
| A pure TS function: transform, validation, matching, range math | L1 unit | `references/unit.md` |
| Extension host code that uses files, auth, or child processes but not the language server | L1 unit, with those modules mocked | `references/unit.md` |
| An exported enum or shared type in `ballerina-core` | L1 contract (extend the enum suite) | `references/unit.md` |
| A React component's output for given props, form state, or RPC data | L2 component, synthetic data | `references/component.md` |
| A component that renders a shape the language server returns | L2 render from a captured fixture, plus its capture test | `references/component.md` |
| Extension host code that calls the language server (RPC manager, client) | L3 integration | `references/integration.md` |
| Java code in `packages/ballerina-language-server` | Java LS test | `references/language-server.md` |
| The cost of an operation a user waits for (LS request, search, opening a form or diagram) | Performance, in addition to the functional row | `references/non-functional.md` |
| How a process or resource starts, stops, or is released (LS JVM, child processes, watchers) | Reliability | `references/non-functional.md` |
| Behaviour only a running VS Code shows: activation, webview wiring, CodeMirror editors, interaction that needs `requestAnimationFrame` | L4 E2E | hand to `e2e-test-writer` |

A change that spans layers gets a row per layer it changes. For example, a Java fix to
a response plus a TS function that reads that response gets a Java LS row and an L1
row. Add a captured-fixture L2 test only when a component renders the shape.

When the visible defect is in the UI but the cause is in the language server, test the
cause at the language server level, and add an L4 row only if the user flow itself
(the editor showing an error, a save failing) has no E2E coverage. Search the specs in
`packages/ballerina-extension/e2e-test/` for the flow before deciding. State which in
the plan.

Not covered here: security and accessibility tests (no suite exists yet), and installer
smoke tests (they live in `wso2/product-integrator`).

A change with no behaviour change (rename, formatting, comments, types only) needs no
test. Say so in the plan rather than inventing one.

## 3. Present the plan

One row per test. Wait for the developer to confirm or edit before writing.

| Level | File | Invariant or case | Data | Defect it catches |
|---|---|---|---|---|
| L1 | `packages/ballerina-visualizer/src/test/utils/range.test.ts` (extend) | every range stays inside the document for any edit | synthetic table | off-by-one when the edit ends on the last line |

- **File:** the exact path, following the location rule in `AGENTS.md`; say "extend" for
  an existing file. If the TS package has no Jest setup, the first row is "set up Jest"
  using "Adding tests to a package that has none" in `docs/TEST_GUIDE.md`.
- **Invariant:** a rule over inputs, not one example. A bug fix adds a fixture to an
  invariant, named `issue-<n>.json` when the PR body, branch name, or commit message
  names an issue. For Java JSON-config tests, where each file is one case, the
  invariant is the set of configs: name the cases that together cover the rule.
- **Changed expected output:** when the change alters the response of existing
  cases, the row is "regenerate `<n>` configs in `<dir>`", with the field that changes.
  Its revert check is that the regenerated configs fail without the change.
- **Data:** synthetic, captured fixture, Java JSON config, or (for performance) the
  project the operation runs on.
- **Defect:** the concrete wrong behaviour the test fails on. A row without one is cut.

List anything deliberately not tested, with the reason (for example "L3 not added:
the RPC handler only forwards the request").

## 4. Write

For each confirmed row:
1. Read the reference file for its level, the `docs/TEST_GUIDE.md` section it points
   to, and one example file named there.
2. Write the test. New files get the WSO2 Apache-2.0 header (copy one from a sibling test).
3. Do not change production code to make it testable, except the sanctioned move in
   `AGENTS.md`: extract a pure function from a heavy module into a sibling module and
   re-export it.

For an L4 row, invoke `e2e-test-writer` with the scenario from the plan.

## 5. Verify

Every check must pass before reporting:

1. **The test passes** with the change applied (command in the level's reference file).
2. **Test code type-checks:** `node scripts/typecheck-tests.js` (TS tests only). If it
   reports other packages that could not run in this checkout, report the result for
   the changed package (`pnpm --filter <pkg> test:typecheck` checks one package).
3. **The test catches its defect.** Undo the production change and run the test again;
   it must fail on the assertion that checks the plan's invariant, not on setup or an
   earlier assertion:
   - Change in the diff: first copy the changed production files to a temporary
     directory. Then restore them from the base (`git show <base>:<file> > <file>`);
     delete a file the change added instead, because `git show` fails for it and the
     redirect leaves the file empty. Run the test, then copy the saved files back. Do
     not put them back with `git checkout HEAD`: it discards changes that are not
     committed. Revert all files of the change together; if a test still
     passes, revert them one at a time to find the file it covers. Leave out a file whose
     old version breaks the test's imports (for example, a new constant), and say so.
     Reverted code can hang, so run Jest with `--forceExit --testTimeout=<ms>`, and copy
     the files back in the same command (`…; cp <tmp>/<file> <file>`) so they are
     restored even if the run fails. Do not use `git stash`: the stash is
     shared by every worktree of the repo, so a `git stash pop` can apply someone
     else's work.
   - Test for existing code: break the asserted behaviour with a one-line edit, run,
     then revert the edit.
   After the check, `git diff --stat` must show the production files exactly as before.
   A test that still passes is not catching anything. Rewrite it or drop the row.
   Exception: a performance test with a loose ceiling usually still passes; report its
   logged numbers with and without the change instead (see `references/non-functional.md`).
   Exception: for a race or other timing-dependent defect, a revert may still pass.
   Do not write a test that relies on timing; make the race deterministic (hold the
   lock, use a latch) or list it under "not tested" with the reason.
4. **It runs where intended.** A fast test is picked up by the package's
   `jest.config.js`; an L3, capture, performance, or reliability test uses its
   non-`jest.config.js` config so it
   stays out of the fast suite.

## 6. Report

For each row: the file, pass or fail with the command that was run, and the result of
the revert check. List rows dropped and why. Do not report a check as passed if it was
skipped (for example, L3 skipped because no Ballerina distribution was found); say it
was skipped.
