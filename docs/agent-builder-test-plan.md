# Agent Builder Test Plan

Verify that users can create, configure, run, and maintain agents in Agent Builder mode, and that shared functionality continues to work in normal Ballerina mode.

Use only the existing test types and frameworks. Extend existing tests where possible instead of duplicating coverage.

**Test types**

| Existing type | What to test |
|---|---|
| L1: Unit / contract | Mode selection, validation, tool configuration, and data transformation rules. |
| L2: Component / render | Forms, overview, diagrams, and chat controls, including loading, empty, success, and error states. |
| L3: Language-server integration | Agent models and generated source for agents, tools, triggers, MCP services, and durable agents. |
| L4: End-to-end smoke | Complete user workflows in the running editor. |

Use the existing Jest, Playwright, Java TestNG, and VS Code-hosted Mocha infrastructure as appropriate. Continue existing manual QA for real services, platform behavior, and visual checks. No new test framework or performance suite is required.

**Preparation**

- Record the app, extension, language-server, and Ballerina runtime versions being tested.
- Prepare small projects for a basic agent, a durable agent, an MCP service, and an agent using memory and a knowledge base. Include an empty project and a multi-package/library variant.
- Use predictable local service responses for automated tests. Use a configured test account for real-provider and deployment checks.
- Make the existing E2E launcher and selectors support both product modes. Register new tests in the existing test list and verify they actually run.

**Feature checks**

For editable features, check create, edit, save, cancel, delete, and reopen where supported. Confirm that the UI and generated source agree. Include invalid input and failed requests, with a usable recovery path.

| Area | Checks | Expected result |
|---|---|---|
| Mode selection | Exact `WSO2_PRODUCT_MODE=agent-builder`; missing, empty, or invalid values; initial launch and reload. | The app, extensions, and webviews use the same mode. Other values retain normal-mode behavior. |
| Welcome, settings, and samples | Create/open actions, agent samples, search, and an existing MI/SI profile setting. | Agent Builder shows the correct entry points and uses the Ballerina runtime without overwriting the saved Integrator profile. |
| Project creation and navigation | New/existing projects, invalid or duplicate names, paths with spaces, libraries, multiple packages, and reopen. | The correct project and overview open; invalid operations do not overwrite files or report false success. |
| Overview and explorer | Empty/populated projects, agent navigation, topology search, refresh after changes, and failed loading. | Agents and relationships are accurate. Explorer filtering matches Agent Builder behavior, and the UI recovers from errors. |
| Agents and definitions | Create/edit/delete agents; set role and instructions; create or reuse definitions and model providers. | Configuration persists after reopen, generated source is valid, and shared definitions/providers are preserved when still referenced. |
| Tools | Add/edit/remove local tools and agent-as-tool references; parameter mappings, names, and approval configuration. | The agent uses the intended tool and arguments. Saved configuration is correct and shared connections remain intact. |
| MCP services | Create from empty/populated overview; import OpenAPI; invalid specifications, conflicting names, and cancellation. | A valid service is generated, appears in the UI, and exposes callable tools. Failed/cancelled operations do not appear successful. |
| MCP tools used by agents | Connect to a server, discover tools, select a subset, save/reopen, and remove; authentication and connection failures. | Only selected tools are configured. Failures do not hang the UI or erase saved selections. |
| Durable agents | Create/edit capabilities, reviewers, run triggers, and data channels; save/reopen; execute and resume a representative flow. | Configuration and generated source agree. Required reviewers are validated, and runtime recovery matches the supported durability behavior. |
| Triggers | Add/edit/delete triggers; shared listeners/helpers; navigation and Try It. | The correct agent is called, diagrams refresh, and deleting a trigger preserves resources still used elsewhere. |
| Runtime chat and approvals | Send messages, handle errors, approve/deny requests, prevent duplicate decisions, switch agents, and clear history. | Each agent keeps its own session. Decisions are applied once, and errors leave the interface usable. |
| Memory and knowledge bases | Create/reuse/edit memory; select a new/existing knowledge base; add a retrieval tool; back navigation and failed loading. | Configuration persists and references the correct resources. Only supported retrieval actions are offered as agent tools. |
| Tracing | Enable/disable tracing, switch providers, inspect messages from different sessions, and open a missing trace. | Traces match the correct message/session; settings persist and missing traces are explained. |
| Evaluations | Create/edit an evalset and evaluation; run a small dataset with passing/failing cases; inspect reports/history; malformed data. | Results and counts match execution, edits persist, and invalid data or failed runs are clearly reported. |
| Copilot | Agent Builder identity; generate, review, accept, reject, restore, and reopen chat; authentication/network failures. | Changes apply to the intended project, review state is retained, and restore returns files to the expected state. |
| Run and deployment | Required configuration, run/restart, successful deployment, and failed deployment. | The agent builds and runs with the intended configuration. Deployment errors are actionable. |
| Installation and usability | Clean app profile and bundled runtime, reopen/update, representative platforms, keyboard use, themes, and narrow windows. | Agent projects work without depending on a developer's cached packages. Important controls remain visible and usable. |
| Normal-mode regression | Normal overview, services, automations, provider forms, and run behavior after shared changes. | Normal Ballerina functionality continues to work and Agent Builder settings do not leak into separate normal-mode launches. |

**Automated coverage to add**

Use unit and component tests for variations and error cases. Reuse existing topology, tool-helper, provider, persistence, and language-server tests; extend them only for missing behavior.

- Unit tests: mode fallback, invalid values, naming and validation rules, and approval/tool data handling.
- Component tests: mode loading, overview navigation, agent/MCP forms, save/cancel/error behavior, chat approvals, and knowledge-base selection.
- Language-server tests: missing model/source cases for agents, tools, triggers, MCP imports, and durable agents. Check generated edits and compile representative resulting projects.
- End-to-end tests: the four journeys below. Keep detailed input variations in the faster suites.

**Initial automated setup**

One seed test per level, placed and run exactly like the existing Ballerina tests of that level (see `docs/TEST_GUIDE.md`). Grow each level by adding cases beside its seed.

| Level | Seed | Run |
|---|---|---|
| L1 | `packages/ballerina-extension/src/test-support/agentBuilderMode.test.ts` — only the exact `WSO2_PRODUCT_MODE=agent-builder` selects Agent Builder; unset, empty, and near-miss values keep normal mode. | `cd packages/ballerina-extension && pnpm run test:unit` |
| L2 | `packages/ballerina-visualizer/src/hooks/useProductMode.test.tsx` — a webview loads in the mode the host reports, falls back to normal mode when the host cannot be asked, and honours the seeded `window.productMode`. | `cd packages/ballerina-visualizer && pnpm test` |
| L3 | `packages/ballerina-extension/src/test-support/ls-integration/agentFlowModel.test.ts` with the `fixtures/basic-agent` project — the flow model of a chat trigger's resource exposes one agent-run node bound to the declared agent. Needs a current Ballerina distribution; skips without one. | `cd packages/ballerina-extension && npx jest --config jest.ls-integration.config.js --testPathIgnorePatterns nodeTemplateInvariants` |
| L4 | `packages/ballerina-extension/e2e-test/e2e-playwright-tests/agent-builder/` — one spec per Ballerina-side journey (`start-agent-builder`, `create-agent`, `durable-agent`, `knowledge-base-tool`), sharing the form and source helpers in `agentForm.ts`. Registered in `test.list.ts` under the `@agent-builder` tag. | `cd packages/ballerina-extension && pnpm run e2e-test:agent-builder` |

The extension host reads the mode once at launch and the E2E Electron app inherits the Playwright worker's environment, so the L4 group runs in its own VS Code launch via the `e2e-test:agent-builder` script and skips itself when the variable is absent. The scheduled E2E workflow does not run this group yet.

**Where each end-to-end journey lives**

Agent Builder is two extensions. The Ballerina extension owns the visualizer: the Agent Builder
overview, the agent, tool, trigger and knowledge-base forms, the diagram, and the source they
generate. The Product Integrator extension owns the product shell: the activity-bar container, the
welcome screen, project creation and the project explorer.

A journey is automated in the repository that owns the UI it drives. Ballerina-side journeys open a
seeded project and start at the overview, so they never touch the shell. Anything that begins at the
welcome screen or the explorer belongs to the Product Integrator repository, which is also the only
place its UI exists — the published Integrator build the Ballerina E2E harness installs has no Agent
Builder shell in it at all, so such a journey cannot run here even in principle.

**End-to-end journeys**

Two journeys were dropped because each depends on something that does not exist yet rather than on
test effort: creating an MCP service ended in listing and calling a tool from a local MCP client, and
the runtime-chat journey needed two agents actually running against a model provider. Both stay in
the manual QA checklist below. Re-add them once there is a local MCP client and a predictable
model-provider stand-in to drive them against.

| Journey | Steps and expected result |
|---|---|
| 1. Start Agent Builder *(Ballerina)* | Launch in Agent Builder mode on a seeded project. The visualizer opens as Agent Builder and lands on the agent entry point; reload and check again. Launch normal mode separately and check it does not. |
| 1b. Product shell *(Product Integrator)* | Welcome screen, activity-bar container, project creation and explorer in Agent Builder mode, plus assistant identity. Automated in the Product Integrator repository, which owns that UI. |
| 2. Create an agent *(Ballerina)* | On a seeded empty project, add an agent from the overview's gallery, inspect source, and reopen. The declaration carries the typed role and instructions in its system prompt and is bound to a model provider, and survives a reload. Project creation itself belongs to 1b. |
| 3. Create a durable agent *(Ballerina)* | Add a durable agent from the gallery, register a capability on its diagram, inspect source, and reopen. The `workflow:DurableAgent` declaration carries what was typed, names a concrete model provider, and keeps the capability across a reload. |
| 4. Add a knowledge-base tool *(Ballerina)* | On a project seeded with an agent and an in-memory knowledge base, select that knowledge base from Add Tool, add its retrieval tool, save, inspect source, and reopen. Only the retrieval action is offered, the tool is bound to the existing knowledge base, and the knowledge base is reused rather than duplicated. |

Two details of journeys 3 and 4 are deliberately not repeated here.

- A durable agent's **reviewer, run trigger and data channel** are driven end-to-end by
  `workflow-docs/quickstarts/build-durable-agent` and the group-4 durable suites. That code is
  the same in either product mode; what is only reachable in Agent Builder is the gallery entry
  point and the diagram it lands on, which is what journey 3 covers.
- **Creating** a knowledge base from scratch means creating a vector store and an embedding
  provider first — three nested modals whose forms belong to the connection wizard rather than
  to Agent Builder. Journey 4 takes the *select* branch, and the create branch stays in manual QA.

**Existing manual QA checks**

Use the feature table as the checklist for behavior not automated above. Include real-provider authentication, MCP connectivity, durable runtime recovery, memory, tracing, evaluations, Copilot review/restore, deployment, and platform/visual checks. Record manual results separately from automated test results.

**Completion criteria**

- Planned tests are discovered and executed. Skipped, blocked, and not-run tests are reported separately from passed tests.
- New tests, affected existing suites, and test-code type checks pass.
- The four E2E journeys pass on repeat runs, with retries and failures visible.
- Normal-mode regression checks pass.
- Each feature check has a recorded result, build/version, evidence, and any remaining defect or coverage gap.
- Coverage reports measure the relevant production files and distinguish automated coverage from manual verification.
