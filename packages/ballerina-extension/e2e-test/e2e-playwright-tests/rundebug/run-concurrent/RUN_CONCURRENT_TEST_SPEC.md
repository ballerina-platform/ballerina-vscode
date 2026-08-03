# Concurrent Run - Test Specification

## Application Overview

WSO2 Integrator runs multiple integrations concurrently (wso2/product-integrator#1012).
This suite verifies the cross-integration behavior using a **two-package Ballerina
workspace** template (`data/concurrent_run_workspace`): packages `alpha_runner` and
`beta_runner`, each a long-running automation printing a unique start marker.

Same-integration restart coverage is split between the two suites: this suite
owns the multi-package branch — re-running an already-running integration and
**declining** (No), proving the cancelled launch leaves every other running
integration untouched (Scenario 4). The full restart flow (accept stops and
restarts cleanly, decline keeps the run, exactly one instance after restart) is
owned by the `run-conflict` suite on a single-package project.

## Harness Notes

- `initTest` accepts an optional `templatePath` (added for this suite) so a suite can
  boot from a custom project template instead of `data/empty_project`.
- The suite disables Do Not Disturb (harness default is on) so notifications render,
  and restores it in `afterAll`.
- Tree item labels are assumed to be the package names (`title` in each package's
  Ballerina.toml is set to the package name to keep labels predictable). If explorer
  labels differ in workspace mode, adjust `openIntegration`.

## Test Scenarios

### 1. Run first integration

1. Click `alpha_runner` in the project explorer, then **Run Integration**.
2. Verify "alpha_runner started" appears in the task terminal.

### 2. Run second integration concurrently without prompts

1. Click `beta_runner`, then **Run Integration**.
2. Verify NO VS Code "task is already active / terminate" modal appears
   (guards against task identity collisions — the type `ballerina-run` task
   definition carries `projectRoot` as an identity property).
3. Verify NO "This integration is already running" notification appears.
4. Verify "beta_runner started" appears.

### 3. Both integrations keep running in separate terminals

1. Verify the terminal tabs list shows both "Ballerina Run - alpha_runner" and
   "Ballerina Run - beta_runner" (dedicated panel per task).
2. Switch to the alpha terminal; its output is intact — the second run did not
   kill or steal the first run's terminal.

### 4. Re-run same integration → decline keeps all runs intact

This scenario owns the decline (No) branch in a multi-package workspace; the
accept (Yes) branch and the rest of the restart flow are covered by the
`run-conflict` suite.

1. Click `beta_runner`, then **Run Integration** again.
2. Verify the "This integration is already running..." notification appears.
3. Click **No**; verify the new launch is cancelled and BOTH integrations —
   including the untouched `alpha_runner` — are still running.

## Out of scope (manual, see validation guide)

- HTTP listeners on real ports (port liveness via curl) — `run-switch-sample`.
- Force-start timeout path (process ignoring SIGTERM >10 s).
- Debug-alongside-run and stop-one-of-many scenarios.
