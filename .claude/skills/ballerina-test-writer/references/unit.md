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

## Write

- Use `it.each` over a table of inputs that states the rule, including the edge cases
  the change touches: empty, boundary, malformed, and the reported case.
- Assert the rule (`every result is inside the document`), not only the output of
  one call.
- Mirror the source path under `src/test/` where the package does (`ballerina-visualizer`).

## Run

```bash
cd packages/<pkg> && npx jest <path-to-test>
node scripts/typecheck-tests.js
```
