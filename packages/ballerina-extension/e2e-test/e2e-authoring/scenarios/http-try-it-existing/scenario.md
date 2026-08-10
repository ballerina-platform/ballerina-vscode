# HTTP Try It — Existing Service Scenario

## Goal

Unlike `http-try-it` (which creates the project, service, and resource through
the UI), this scenario opens a **pre-existing fixture project** that already
contains a compiled HTTP service, and verifies Try It works against it without
any authoring step.

Fixture: `e2e-playwright-tests/data/http_try_it_existing_project`
(`service.bal`, pre-baked, not modified at runtime). The service has five
resources — the original `GET /greeting` plus four added to cover path/query/
header params and a JSON body, all on the same service/listener so a single
Try It click generates request cells for all of them:

```ballerina
import ballerina/http;

listener http:Listener httpListener = new (9090);

service / on httpListener {
    resource function get greeting() returns json {
        return {message: "Hello, Ballerina!"};
    }

    resource function get greeting/[string name]() returns json {
        return {message: "Hello, " + name + "!"};
    }

    resource function get search(string q) returns json {
        return {query: q};
    }

    resource function get secure(@http:Header {name: "X-Api-Key"} string apiKey) returns json {
        return {header: apiKey};
    }

    resource function post echo(@http:Payload record {|string message;|} payload) returns json {
        return {echoed: payload.message};
    }
}
```

No project-creation step, no HTTP-service-creation step, no return-node step —
the scenario starts from this fixture directly.

## Steps

| Step | Action | Notes |
|------|--------|-------|
| 01 | Open the fixture workspace, navigate to the existing HTTP service | The Integrator Overview must show the service already discovered from source; open its Service Designer. |
| 02 | Click **Try It** from the Service Designer toolbar, auto-start via **Run Integration**, confirm **Test** | Reuse the auto-start-and-wait-for-hurl pattern from `http-try-it` steps 04–05. Service-level Try It (no `resourceMetadata`) generates one markdown+hurl cell pair per resource in the service — all 5 resources land in one notebook. |
| 03 | Execute the `GET /greeting` request cell and verify a live response | Notebook cell success state + direct HTTP probe. |
| 04 | Run **all** notebook cells via the notebook toolbar's **Run All** action, then verify each of path param / query param / header param / POST-JSON-body via a direct HTTP probe | See "Decisions" below for why Run All instead of per-cell navigation, and why probes use the placeholder values as-is instead of editing the cell. |
| 05 | Navigate to a specific resource's flow diagram (e.g. `secure`) and click **its own** "Try It" button, verify the regenerated notebook is scoped to just that resource | Requires the service to already be running — see "Decisions" below. |

## Decisions (read before re-authoring this scenario)

- **No in-cell editing of path/query/header/body placeholders.** The
  generated Hurl cell already pre-fills a deterministic placeholder for each
  param (path param `name` → literal URL segment `.../name`; query param `q`
  → `q`; header `X-Api-Key` → value `X-Api-Key`; JSON body `message` →
  `"{?}"`). We assert the generated content matches this format and execute
  the cell **as-is**, then probe the same placeholder value directly via
  `fetch`/`waitForEndpoint` — this still exercises the real product code
  (hurl-builder.ts generation + the running service) end-to-end without
  inventing new, unproven Monaco/CodeMirror keyboard-editing automation.
- **Resource-level Try It ("Try It from resource menu") IS in scope (step
  05) — an earlier attempt to drop it was based on a self-inflicted mistake,
  corrected after a screenshot showed the button plainly visible in a real
  session.** The button lives in the resource's Flow Diagram title bar
  (`DiagramWrapper/index.tsx`, `<vscode-button title="Try Resource">`, no
  `data-testid` — locate via `frame.locator('vscode-button[title="Try
  Resource"]')`). Two things had to be understood before it worked reliably:
  - **It only scopes correctly to one resource if the service is ALREADY
    running.** If the service isn't running yet, the click still starts it,
    but the resulting notebook build races against the debug-session's own
    "Test with Try It Client?" hook (`config-provider.ts:433`), which calls
    Try It generically (no `resourceMetadata`) and wins the race — producing
    the full multi-resource notebook instead of a single-resource one. This
    was the root cause of the original "dropped" conclusion: that attempt
    happened to hit this race, was misread as "the button doesn't work", and
    the earlier synthetic-pointer-event workaround was solving the wrong
    problem. With the service already running (true here, since step 05 runs
    after steps 02-04 leave it running), a **plain** `.click({force:true})` on
    that locator works with no workaround needed.
  - **A blocking "Do you want to save the changes you made to TryIt.hurl?"
    dialog appears** because the prior (executed) service-level notebook has
    unsaved cell-execution state at the same `target/TryIt.hurl` path, which
    `openHurlNotebook` tries to close/replace. Must be dismissed (**"Don't
    Save"**) or the flow hangs indefinitely on a `"Loading"` button state.
    See `steps/05_resource_level_tryit.step.js` for the polling loop that
    handles this alongside the usual "Test" prompt.
- **Multiple-services quick pick was scoped out before authoring.** Source
  investigation (`activator.ts`) confirmed the native "Available Services"
  quick pick only fires when Try It runs *without* service metadata — which
  never happens from the Service Designer's Try It button (it always sends
  metadata for the service being viewed). Reaching it would require invoking
  the Try It command directly (bypassing the real UI entry point), so this
  item was dropped rather than authored.
- **Notebook is virtualized; per-cell navigation is unreliable.** With 5
  cell pairs, only 1-2 code cells are ever mounted in the DOM at once.
  Neither setting `scrollTop` directly nor `mouse.wheel()` reliably scrolled
  the notebook list to a chosen cell (wheel events over the cell body scroll
  *inside* that cell's Monaco editor instead of the outer list; direction
  sign was also inconsistent between attempts). The reliable mechanism is the
  notebook toolbar's **Run All** button (`getByRole('button', { name: /Run
  All/i })`), which executes every mounted-or-not cell in one action; verify
  results via HTTP probes exactly as the existing GET test does (the
  sandboxed output-renderer iframe still can't be read reliably).

## Selector Policy

Same as `http-try-it`: `data-testid`, stable roles/accessible text only, no
Emotion/generated class selectors.

## Status / Coverage (confirmed via authoring daemon)

**Authored & proven (steps 01–05, run end-to-end in a fresh daemon session):**

- Step 05 confirmed: clicking `secure`'s own Try It button (service already
  running) regenerates `target/TryIt.hurl` containing **only**:
  ```hurl
  # md: ### Try Service: '/' (http://localhost:9090)

  # md: #### GET /secure

  GET http://localhost:9090/secure
  X-Api-Key: X-Api-Key
  ```
  (no `/greeting`, `/search`, or `/echo` cells) — confirming `resourceMetadata`
  scoping works correctly via this entry point. Live probe of `GET /secure`
  with header `X-Api-Key: X-Api-Key` → 200 `{"header":"X-Api-Key"}`.

- Step 04 confirmed the exact generated Hurl text for all four new resources
  (from `hurl-builder.ts`, matches source-level prediction):
  - Path param: `GET http://localhost:9090/greeting/name`
  - Query param: `GET http://localhost:9090/search` + `[QueryStringParams]` /
    `q: q`
  - Header param: `GET http://localhost:9090/secure` + `X-Api-Key: X-Api-Key`
  - POST JSON body: `POST http://localhost:9090/echo` +
    `Content-Type: application/json` + sample body `{"message": "{?}"}`
- **Run All** executes every cell reliably; live probe results after Run All
  (service already running from step 02, so no re-auth-start needed):
  - `GET /greeting/name` → 200 `{"message":"Hello, name!"}`
  - `GET /search?q=q` → 200 `{"query":"q"}`
  - `GET /secure` (header `X-Api-Key: X-Api-Key`) → 200 `{"header":"X-Api-Key"}`
  - `POST /echo` (body `{"message":"{?}"}`) → **201** `{"echoed":"{?}"}` (note:
    201 Created, not 200 — Ballerina's default POST response status; assert
    on this, not 200)

- **How an already-existing service is surfaced (was Gap 1):** no card/testid
  lookup is needed. The Integrator Overview's architecture diagram discovers
  the service straight from `service.bal` and renders a node containing the
  text `http:Service` — the *same* node shape a freshly-created service would
  get. `webview.getByText('http:Service', { exact: false }).first().click()`
  opens the Service Designer directly, which already shows the **Try It**
  button (no artifact-creation step, no distinct "existing service" UI).
- **Workspace entry point (was Gap 2):** the workspace opens directly into a
  usable state — `getBIWebview()` (which just waits for the `WSO2 Integrator`
  webview label) resolves immediately with no prior activity-bar click or
  navigation step. The project was never created through the wizard in this
  session, and that doesn't matter: opening the folder is sufficient for the
  Integrator webview and its Overview/diagram to be ready.
- Steps 02–03 reuse the proven `http-try-it` auto-start-and-wait-for-hurl
  pattern (Try It → Hurl Client pick → **Run Integration** → poll for
  `target/TryIt.hurl` while dismissing "Test with Try It Client?" whenever it
  surfaces) and the execute-cell-then-HTTP-probe verification, unchanged.
- **Notebook-tab-open race (found here, not present in `http-try-it`'s daemon
  steps):** checking for the `TryIt.hurl` editor tab immediately after
  `fs.existsSync(target/TryIt.hurl)` becomes true is flaky — the file write and
  the tab rendering are not atomic; a single check can observe the file but not
  yet the tab. Fixed in `steps/02_try_it_autorun.step.js` with a short
  (15s) poll of `hostSnapshot()` for the `tab "TryIt.hurl` text instead of one
  check. The promoted spec's equivalent assertion
  (`expect(locator).toBeVisible({ timeout: 30000 })`) already auto-retries and
  did not need this fix.

**Promoted spec:** `e2e-playwright-tests/api-integration/http-try-it-existing.spec.ts`
(registered in `test.list.ts`, Group 1), using
`initTest(true, true, undefined, undefined, PROJECT_TEMPLATE)` with
`PROJECT_TEMPLATE = data/http_try_it_existing_project`.

## Gaps

None outstanding for the in-scope flow (steps 01–05: GET, POST+JSON body,
path param, query param, header param via the Service Designer's Try It
button, plus resource-level Try It scoping). Deliberately out of scope (see
"Decisions" above): the multiple-services quick pick (not reachable via the
real button-click entry point — the only way to trigger it bypasses the UI
a real user would use).
