# Non-functional tests: performance and reliability

Guide sections: `docs/TEST_GUIDE.md` → "Perf / QA" and "Reliability". Both suites live in
`packages/ballerina-extension` and stay out of the fast suite through their own configs
(`jest.perf.config.js`, `jest.reliability.config.js`).

No security or accessibility suite exists yet. Do not add plan rows for them; list them
under "not tested" when a change affects them.

## Decide

- **Performance:** the change alters the cost of an operation a user waits for: an LS
  request on a large project, search, or opening a form or diagram. A functional test
  stays the first row; the performance row records how long the operation takes.
- **Reliability:** the change alters how a process or resource starts, stops, or is
  released: the LS JVM, child processes, file watchers, or connections. The defect is
  something left behind or unbounded (a process that does not exit, a handle that is
  not closed).
- A change that only moves code without changing what runs needs neither.

## Write

**Performance** (`src/test/perf/*.perf.ts`):
- Start the LS with `resolveBalCommand()` and skip the suite when it returns null
  (`describe.skip`), as `lsLatency.perf.ts` does.
- Run the operation enough times to report percentiles, and log one JSON record per
  operation with a `[perf]` prefix, so runs can be compared.
- Assert only a loose ceiling that catches a hang or an order-of-magnitude slowdown.
  The suite has no committed baseline yet, so do not assert a tight threshold.

**Reliability** (`src/test/reliability/*.reliability.ts`):
- Start the LS with `new LsHarness(resolveLocalLsCommand())` and skip when it returns
  null, unless `BAL_RELIABILITY_REQUIRED=true`, in which case fail. Copy the pattern in
  `lsProcessExit.reliability.ts`.
- Assert on the resource itself (the process exit status and signal, the open handle),
  not on a log line.
- Kill any process the test started in `afterEach`, so a failing test does not leave
  one behind. Assign the handle before the first `await` so `afterEach` can reach it.

## Verify

- Reliability tests follow the revert check in `SKILL.md` step 5: with the fix reverted,
  the test must fail.
- A performance test with a loose ceiling usually still passes when the change is
  reverted. Instead of the revert check, report the logged numbers with and without the
  change, so the developer can see the difference.

## Run

```bash
cd packages/ballerina-extension
pnpm run test:perf
rush build --to ballerina-language-server && pnpm run test:reliability
```

Performance needs Java 21 and a Ballerina distribution; reliability needs the LS jar
built from this repo, a distribution, and a JDK. Without them the suites skip; report
the test as skipped, not passed.
