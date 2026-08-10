# Run Conflict (Concurrent Runs / Same-Integration Restart) - Test Specification

## Application Overview

WSO2 Integrator supports **running multiple integrations concurrently**
(wso2/product-integrator#1012): each integration runs as its own VS Code task
("Ballerina Run - <package>") in its own terminal, so users can start one
integration and then start others without stopping the first, and switch
between their terminals freely.

A single integration, however, has **at most one running instance**. When the
user starts a run for an integration that is already running, the extension
must prompt and handle both choices gracefully:

- **Yes** → stop the running instance, wait for the process to fully terminate
  (port released), then start the new run.
- **No** → leave the running instance untouched; the new launch is cancelled
  cleanly (no broken debug session, no Try-It popup).

Implementation:

- Per-integration registry: `src/features/project/integration-runner-state.ts`
  (`confirmAndStopActiveRun(targetPath)`), applied in
  `DebugConfigProvider.resolveDebugConfiguration` (BI run, fast run, debug) and
  in the terminal run path.
- Per-integration adapter slots and unique task identities:
  `BIRunAdapter` in `src/features/debugger/config-provider.ts`.
- Per-integration run terminals: `runCommandWithConf` in
  `src/features/project/cmds/cmd-runner.ts`.

## UI Elements Identified

- **Run Integration** button (aria-label "Run Integration") - editor toolbar
- **Restart notification** - info notification: "This integration is already
  running. Do you want to stop it and start it again?" with **Yes** / **No**
- **Force-start notification** - warning notification after a 10 s termination
  timeout: "The previous run has not stopped yet (terminate was already sent).
  Force start anyway?" with **Force Start** / **Cancel new launch**
- **Task terminals** - one per running integration, named
  "Ballerina Run - <package>"

> Note: the e2e harness enables Do Not Disturb by default
> (`toggleNotifications(true)` in `initTest`). This suite re-enables
> notifications so the prompt is visible, and restores DND in `afterAll`.

## Missing Test IDs Recommendations

1. `data-testid="run-restart-notification"`
2. `data-testid="run-restart-yes-button"` / `data-testid="run-restart-no-button"`
3. `data-testid="force-start-notification"`

## Test Scenarios (automated, single-package project)

The suite boots from the `data/run_conflict_project` template, which ships a
pre-baked long-running automation (~5 min sleep) — per the e2e-writer rule,
scenarios must not modify Ballerina sources at runtime. One package means a
second Run always targets the same integration and exercises the restart
prompt. Artifact creation itself is covered by the `automation` suites.

### 1. Second run of the same integration shows restart prompt

1. Start the pre-baked automation via **Run Integration**; wait for its
   "run-conflict automation started" marker in the terminal.
2. Click **Run Integration** again.
3. Verify the "This integration is already running..." notification appears
   with **Yes** and **No** buttons.

### 2. Decline keeps the current run

1. With the prompt visible, click **No**.
2. Verify the notification disappears, the original process is still running,
   and no error notification or Try-It view appears for the cancelled session.

### 3. Accept stops the old instance and starts a new one

1. Click **Run Integration** again; the prompt appears.
2. Click **Yes**.
3. Verify the old task terminates and a fresh `bal run` cycle starts
   ("Compiling source" → run output).

### 4. Exactly one instance after restart

A further Run click must prompt again — exactly one instance of the
integration is running.

### 5. Rapid double Run shows at most one prompt

1. With the integration running, click **Run Integration** twice in quick
   succession.
2. Verify only ONE conflict notification is visible — the duplicate launch is
   cancelled quietly by the in-flight guard dedup in
   `integration-runner-state.ts`.
3. Click **No**; verify the original run is still alive.

### 6. Run right after stopping does not claim already running

Covers product-integrator#1690.

1. Stop the running integration via the debug toolbar.
2. Immediately click **Run Integration**, before the process has exited.
3. Verify NO "This integration is already running..." prompt appears — the
   guard detects the in-flight stop (session gone, process exiting) and
   silently waits for the process to release its ports.
4. Verify a fresh run starts. A cancelled prompt while one is open must also
   never resurrect a dead adapter slot (`restoreOrReleaseSlot`).

## Related Scenarios

### 7. Concurrent runs across integrations — AUTOMATED

Covered by the `run-concurrent` suite (two-package workspace template
`data/concurrent_run_workspace`): no prompts when running a second integration,
dedicated terminals per integration, restart prompt only for the same one.

### 8. Concurrent listeners on real ports — MANUAL

Run `hr_api` (:9090), `inventory_api` (:9091) and `schedule_executor` from the
`run-switch-sample` workspace; verify port liveness via curl and that stopping
one run does not affect the others (see validation guide).

### 9. (Manual) Force-start timeout path

Requires a process that ignores SIGTERM for >10 s; restart the same
integration and verify the force-start prompt appears and both choices behave
sanely.
