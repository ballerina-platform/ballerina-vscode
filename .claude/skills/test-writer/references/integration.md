# L3 — Integration tests

Guide section: `docs/TEST_GUIDE.md` → "L3 — Integration (headless, no VSCode)".

## Decide

- The defect is in how extension code and the real language server work together:
  a request the server rejects, a response the host misreads, a model that is wrong
  for a real `.bal` project.
- If the host code only forwards a request, test the response handling at L2 with a
  captured fixture instead.
- Prefer an invariant over a corpus (for example "every array-typed parameter maps to
  `REPEATABLE_LIST` across sampled connector actions") over one request.

## Write

- Use the shared harness: `resolveIntegrationLaunch()` (skip the suite when it returns
  null) → `new LsHarness(launch)` → `start()` → `initialize(projectRoot)` →
  `didOpen(file)` → `request(method, params)`. It starts the LS jar built from this repo.
  Do not start the LS with `resolveBalCommand()`: running the distribution's LS in tests
  is deprecated, because it lags this repo and cannot catch a change here.
- Keep `.bal` fixture projects small and next to the suite under `src/test/integration/`.

## Run

```bash
cd packages/ballerina-extension && pnpm run test:integration
```

Needs Java 25 and a Ballerina distribution. To test this repo's LS, pack it first
(`./gradlew build pack -x test` in `packages/ballerina-language-server`). Without a jar
or distribution the suite skips; report the test as skipped, not passed. CI runs it in
the nightly and release builds, and on a PR with the `Checks/Run Integration Tests` label.
