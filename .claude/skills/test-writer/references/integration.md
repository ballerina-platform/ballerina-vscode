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

- Use the shared harness: `resolveIntegrationLaunch()` (it throws when the jar,
  distribution or JDK is missing; do not wrap the suite in `describe.skip`) →
  `new LsHarness(launch)` → `start()` → `initialize(projectRoot)` →
  `didOpen(file)` → `request(method, params)`. It starts the LS jar built from this repo.
  Do not start the LS with `resolveBalCommand()`: running the distribution's LS in tests
  is deprecated, because it lags this repo and cannot catch a change here.
- Keep `.bal` fixture projects small and next to the suite under `src/test/integration/`.

## Run

```bash
cd packages/ballerina-extension && pnpm run test:integration
```

Needs the LS jar built from this repo (`./gradlew build pack -x test` in
`packages/ballerina-language-server`), a Ballerina distribution, and its Java 25 JDK.
Without them, or with a jar older than the LS sources, the suite fails before any test
runs; that is a setup failure, not a test result. For the revert check of a Java LS
change, rebuild the jar after reverting and again after restoring. CI runs it in
the nightly and release builds, and on a PR with the `Checks/Run Integration Tests` label.
