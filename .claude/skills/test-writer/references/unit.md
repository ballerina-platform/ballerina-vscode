# L1 — Unit and contract tests

Guide section: `docs/TEST_GUIDE.md` → "L1 — Unit / contract".

## Decide

- The target takes input and returns output with no DOM, no RPC, and no file or
  network I/O. If it renders, use L2.
- The function sits in a heavy module (for example `bi.tsx`) and importing it pulls in
  UI dependencies: extract it into a sibling module and re-export it from the original
  file. Check that importers still resolve and that `tsc --noEmit` is clean.
- A change to an exported enum in `ballerina-core` is covered by the enum contract
  suite. Add the module to its `MODULES` map if it is new; add an assertion inside the
  `describe.each` only for a new rule that applies to all enums.

- **Extension host code with I/O** (files, auth, child processes) is still L1 when no
  language server runs: mock the modules it calls with `jest.mock` and assert what the
  code does with their results. Extraction applies only to pure functions; for code
  with I/O, mock its dependencies instead.

## Write

- Use `it.each` over a table of inputs that states the rule, including the edge cases
  the change touches: empty, boundary, malformed, and the reported case.
- Assert the rule (`every result is inside the document`), not only the output of
  one call.
- Mirror the source path under `src/test/` where the package does (`ballerina-visualizer`).
- In `ballerina-extension`, importing the `@wso2/ballerina-core` barrel (directly or
  through a module that imports it) fails with `SyntaxError: Unexpected token 'export'`
  from `vscode-ws-jsonrpc`. Mock the barrel with only the values the code under test
  uses: `jest.mock("@wso2/ballerina-core", () => ({ … }))`. Existing tests in
  `src/test/` do the same.
- A fake must reproduce the side effects the code waits on. For example, if the real
  collaborator sets a flag that ends a polling loop, the fake must set it too, or the
  test hangs or fails in setup instead of on its assertion.

## Run

```bash
(cd packages/<pkg> && npx jest <path-to-test>)
node scripts/typecheck-tests.js    # from the repository root
```
