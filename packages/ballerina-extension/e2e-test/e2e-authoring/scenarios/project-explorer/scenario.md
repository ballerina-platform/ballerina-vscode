# Project Explorer

Project Explorer is the tree view in the WSO2 Integrator sidebar that lists a
project's integrations/libraries and, per integration, its entry points
(services, automations), listeners, connections, types, functions, data
mappers and configurations.

## Fixture

`e2e-test/e2e-playwright-tests/data/project_explorer_workspace` is a two-package
Ballerina workspace ("Education"), used as the project template for this
scenario via `initTest(true, true, undefined, undefined, EDUCATION_WORKSPACE_TEMPLATE)`:

- **Institutes** — a RabbitMQ event integration (`myQueue` listener, `onMessage` handler).
- **School** — an HTTP service (`/foo` with `GET /bar` and `POST /greeting`), a
  Kafka event integration (`kafkaListener`, `onConsumerRecord` handler), and an
  Automation (`main`).

Two packages with three different integration kinds gives the tree enough
variety to exercise every action below against more than one artifact type.

## Steps

| # | Action | Verification |
|---|--------|-------------|
| 1 | Open the workspace | Sidebar tree renders `Institutes` and `School` under the "WSO2 Integrator: Education" root |
| 2 | Click "School" to expand it | `Entry Points`, `Listeners`, `Connections`, `Types`, `Functions`, `Data Mappers`, `Configurations` sections appear; `Entry Points` shows `main` (Automation), `Kafka Event Integration`, `HTTP Service - /foo` |
| 3 | Click "Entry Points" to collapse it | Its children (`main`, `Kafka Event Integration`, `HTTP Service - /foo` and their handlers/resources) are hidden; `aria-expanded` flips to `false` |
| 4 | Click "Entry Points" again, then click "HTTP Service - /foo" | Tree re-expands; the HTTP service designer view opens in the editor showing its `bar`/`greeting` resources |
| 5 | Hover "School" and click its "Show Visualizer" toolbar button | Navigates to the School integration overview/architecture diagram |
| 6 | Click "Open Overview" on the workspace-root toolbar | Navigates to the workspace overview listing both `Institutes` and `School` |
| 7 | Click "Refresh" on the workspace-root toolbar | Tree reloads; all packages/artifacts are still listed |
| 8 | Right-click "main" (the Automation) and choose "Delete" | `main` disappears from the tree |
| 9 | Hover "Entry Points" and click "Add Entry Point", pick "Automation", click "Create" | The Add Artifact picker opens; after creation `main` reappears under `Entry Points` |

## Gaps

- The project-root toolbar exposes `Open Overview`/`Refresh`/`Add Integration or Library`; the per-package (e.g. "School") toolbar instead exposes `Show Visualizer`/`Force Update Artifacts`. `PROJECT_EXPLORER_TEST_SPEC.md`'s "Show Visualizer button on project root" description doesn't hold for a multi-package workspace — there is no root-level visualizer button, only "Open Overview".
- Expand/collapse has no dedicated chevron `data-testid`; toggling is done by clicking the tree row itself and reading `aria-expanded`, which is coupled to VS Code's own tree markup rather than an extension-owned selector.
- "Delete" on the tree only exercises the Automation artifact here; deleting the HTTP service or Kafka integration (which also removes a listener) is not covered by this scenario and could behave differently if a listener is shared by multiple services.
- `institutes/functions.bal` ships with an incomplete function body (`function greeting() returns string { }`) in the fixture, which the Ballerina compiler will flag — the tree still renders correctly around it, but this is a pre-existing compile diagnostic in the fixture, not something this scenario fixes.
