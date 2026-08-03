# Ballerina E2E Writer User Guide

Use `ballerina-e2e-writer` when you want an AI agent to create a new Ballerina
extension E2E test from a user-flow description.

> All work happens in `packages/ballerina-extension`. The agent must not edit the
> `submodules/` tree or shared/common libraries.

## What the User Provides

You do not have to write Playwright code first.

Provide either:

- a short scenario description in the prompt, or
- a prepared `scenario.md` file under
  `packages/ballerina-extension/e2e-test/e2e-authoring/scenarios/<scenario-name>/scenario.md`.

If you only describe the scenario, the agent should create `scenario.md` for you.
A tracking sheet row (Test Suite / Scenario / Description / Priority) is usually
enough to derive a draft.

## Expected Flow

1. User describes the scenario.
2. Agent reads `ballerina-e2e-writer`.
3. Agent checks whether an existing spec already covers it (sheet may be stale).
4. Agent creates or updates `scenario.md`.
5. Agent creates small authoring step files under `steps/*.step.js`.
6. Agent runs the authoring flow through the VS Code daemon.
7. Agent adds missing `data-testid` selectors if needed (rebuild + reinstall VSIX).
8. Agent promotes the proven flow into `e2e-playwright-tests`.
9. Agent registers the test in `test.list.ts`.
10. Agent verifies with `npm run e2e-test -- --grep "<test name>"`.

The files under `e2e-authoring/scenarios/<scenario-name>/steps` are for discovery
and debugging. The committed CI test is the promoted Playwright spec under
`e2e-playwright-tests`.

## Prompt: Scenario Only

```text
Use the ballerina-e2e-writer skill.

Create a new Ballerina extension E2E test for this scenario:

- <describe the first user action>
- <describe the next user action>
- <describe the expected editor or diagram state>
- <describe how to run or verify the integration>
- <describe the expected final result>

Use "<test name>" as the promoted test name.
```

## Prompt: Existing Scenario File

```text
Use the ballerina-e2e-writer skill.

Implement the E2E scenario described in:
packages/ballerina-extension/e2e-test/e2e-authoring/scenarios/<scenario-name>/scenario.md

Use "<test name>" as the promoted test name.
```

## Example Prompt

```text
Use the ballerina-e2e-writer skill.

Create a new E2E test for an HTTP upload flow:

- create a new integration project
- create an HTTP service
- add a POST /upload resource
- configure a query parameter named name
- configure a JSON payload
- add a return node from the diagram using the plus button
- select payload from the helper panel and customize the return expression
- save and confirm the diagram/source is updated
- run the integration
- call the endpoint and verify the JSON response

Use "HTTP Upload" as the promoted test name.
```

## Useful Commands

Run all authoring steps:

```bash
cd packages/ballerina-extension
bash e2e-test/e2e-authoring/scripts/run-steps.sh <scenario-name> e2e-test/e2e-authoring/scenarios/<scenario-name>/steps
```

Run part of a scenario:

```bash
bash e2e-test/e2e-authoring/scripts/run-steps.sh <scenario-name> e2e-test/e2e-authoring/scenarios/<scenario-name>/steps 02 04
```

Run the promoted E2E:

```bash
cd packages/ballerina-extension
npm run e2e-test -- --grep "<test name>"
```
