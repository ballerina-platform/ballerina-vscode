# L3 — LS-integration tests

Guide section: `docs/TEST_GUIDE.md` → "L3 — LS-integration (headless, no VSCode)".

## Decide

- The defect is in how extension code and the real language server work together:
  a request the server rejects, a response the host misreads, a model that is wrong
  for a real `.bal` project.
- If the host code only forwards a request, test the response handling at L2 with a
  captured fixture instead.
- Prefer an invariant over a corpus (for example "every array-typed parameter maps to
  `REPEATABLE_LIST` across sampled connector actions") over one request.

## Write

- Use the shared harness: `resolveBalCommand()` (skip the suite when it returns null)
  → `new LsHarness(bal)` → `start()` → `initialize(projectRoot)` → `didOpen(file)` →
  `request(method, params)`. To test the LS jar built from this repo, use
  `resolveLocalLsCommand()`.
- Keep `.bal` fixture projects small and next to the suite under `src/test/ls-integration/`.

## Run

```bash
cd packages/ballerina-extension && pnpm run test:ls-integration
```

Needs Java 21 and a Ballerina distribution. Without one the suite skips; report the
test as skipped, not passed. No CI workflow runs this suite yet, so a passing local run
is the only check until it does.
