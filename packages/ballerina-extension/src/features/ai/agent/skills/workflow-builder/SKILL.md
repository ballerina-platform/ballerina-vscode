---
name: workflow-builder
description: Use this skill whenever you are writing or modifying a Ballerina workflow — declaring a `@workflow:Workflow` function or its `@workflow:Activity` steps, calling `workflow:run` / `workflow:getWorkflowResult` / `workflow:sendData`, or when the user describes a long-running, durable, or crash-resilient multi-step business process (order fulfillment, approval chains, sagas, scheduled multi-day processes) that must survive restarts without re-running completed work. Applies to every `.bal` file that declares or edits a workflow, including `workflows.bal` and `activities.bal`.
---

# Workflow Builder

**Always reach for `ballerina/workflow`** when the user describes a durable or long-running
process — never a plain function with hand-rolled retry loops, a cron/poll job, or manual
state persisted to a database to survive restarts. That is exactly what this module replaces.

The workflow diagram, like the agent diagram, is parsed directly out of the source you write, not
generated from a model. Code that compiles but does not match the shapes below still renders as a
broken or incomplete node. Follow every rule.

`<...>` marks a placeholder to substitute from the user's request. Never emit it literally.

```ballerina
import ballerina/workflow;
```

## Workflow vs. activity

A workflow is two kinds of function:

- **The workflow function** (`@workflow:Workflow`) — orchestration only: which activity runs
  next, and on what condition. It is replayed from recorded history after any crash or restart,
  so it must be deterministic.
- **Activities** (`@workflow:Activity`) — every piece of real work: calling a service, hitting a
  database, sending a notification, reading the clock, generating a random value. The engine
  records each activity's result once and reuses it on replay, so a completed activity never runs
  twice.

Put all real work in activities. If you find yourself writing an HTTP call, a `time:utcNow()`, or
a `random:` value directly inside a `@workflow:Workflow` function, move it into an activity instead.

**`@workflow:Workflow` functions always go in `workflows.bal`** (mirrors the `agents.bal`
convention for AI agents) — create the file if it does not exist. Never put a workflow function in
`functions.bal`, and never leave one in `main.bal` past a first draft.

Activity functions go in `activities.bal` by the same convention. The one exception: the low-code
diagram itself always appends a newly-generated activity to `functions.bal` so it never shifts the
workflow's own line positions — that placement comes from the diagram tooling, not from you, so
don't imitate it when writing activities from a prompt. When you add an activity, put it in
`activities.bal`.

## The workflow function

```ballerina
@workflow:Workflow
function <name>Workflow(workflow:Context ctx, <Input> input) returns <Result>|error {
    <Result> result = check ctx->callActivity(<activityName>, {<param>: input.<field>});
    return result;
}
```

A workflow function may declare, in this order, only:

1. `workflow:Context` — add it only when the body actually calls a `Context` remote method
   (`callActivity`, `sleep`, `await`, …). Omit it for a workflow that needs none of them.
2. One `anydata`-subtype parameter — the workflow's **input**.
3. One events parameter — a **closed record whose every field is `future<T>`**, one field per
   external data event the workflow waits on:

   ```ballerina
   type <Name>Events record {|
       future<PaymentData> paymentReceived;
       future<string> shipmentReady;
   |};
   ```

   A record with a plain (non-`future`) field is not recognised as an events parameter. Only add
   this parameter when the workflow needs to wait on external data events — see "Waiting on data
   events" below.

All three are optional; a workflow with no external input and no data events to wait on can
declare zero parameters.

### Determinism inside the workflow function

The engine replays this function from recorded history, so it must produce the same sequence of
calls every time it re-runs:

- **Never call `runtime:sleep()`.** Use `check ctx->sleep(<Duration>)` — a durable sleep that
  survives a crash mid-wait.
- **Never call `time:utcNow()`.** Use `check ctx->currentTime()` — deterministic on replay.
- **Never call `random:` functions, read the filesystem, or make a network call directly.** Wrap
  it in an activity and call that instead.

```ballerina
type Duration record {
    int years = 0;
    int months = 0;
    int weeks = 0;
    int days = 0;
    int hours = 0;
    int minutes = 0;
    decimal seconds = 0.0;
};
```

```ballerina
check ctx->sleep({hours: 24});
```

## Activities

```ballerina
@workflow:Activity
function <activityName>(<params>) returns <Result>|error {
    <Result> result = check <the real call>;
    return result;
}
```

Give every activity a `<Result>|error` return type — the parser does not require it structurally,
but it is what every real activity in this codebase does, and it lets a caller distinguish a
failed step from a successful one. Design each activity to be **idempotent**: a failed attempt may
be retried automatically or rerun by a human, so side effects (charging a card, sending an email)
need a dedup key or an equivalent guard.

### Activities backed by a connector

When an activity calls a connector client, add a `@display` annotation so it renders with the
connector's icon — same pattern as an agent tool:

```ballerina
@workflow:Activity
@display {label: "<activityName>", iconPath: "https://bcentral-packageicons.azureedge.net/images/<org>_<package>_<version>.png"}
function <activityName>(<params>) returns <Result>|error {
    <Result> result = check <clientVar>-><action>(<args>);
    return result;
}
```

Build `iconPath` the same way as for agent tools: org, package name and resolved version joined
by underscores, `.png` appended, using the version actually resolved for the dependency.

Reference the connector client as a **module-level `final` variable** closed over by the activity
body — do not pass the client in as a parameter unless the user's flow specifically calls for
selecting between multiple clients at call time, in which case declare it as a normal parameter and
pass it by name from `callActivity`'s argument map (see below).

Plain computation activities that call no connector take no `@display`.

## Calling an activity — `callActivity`

```ballerina
<Result> result = check ctx->callActivity(<activityName>, {<param1>: <value1>, <param2>: <value2>});
```

Two rules that are easy to get wrong and silently break the diagram or the compile:

- **Arguments are a mapping constructor keyed by the activity's own parameter names**, never a
  positional list — `{message: message}` for `function logEvent(string message)`, not
  `("some message")`.
- **The result must always be bound to a variable, even when there is nothing useful to bind.** A
  bare statement gives the compiler nothing to infer the result type from.

  ```ballerina
  () _ = check ctx->callActivity(logEvent, {message: message});   // checked call, no-value activity
  int|error count = ctx->callActivity(countEvents, {});            // unchecked — bind the T|error union directly
  error? r = ctx->callActivity(logEvent, {message: message});      // unchecked, no-value activity
  ```

  Never write `check ctx->callActivity(...);` as a bare statement, and never assign to a bare `_`.

### Retrying a failed activity

`callActivity` takes a `retryPolicy` argument directly — there is no `options` wrapper — so pass it
by name (positional params sit between it and the activity reference):

```ballerina
<Result> result = check ctx->callActivity(<activityName>, {<args>},
        retryPolicy = {maxRetries: 5, retryDelay: 2.0d, retryBackoff: 2.0d});
```

`retryPolicy` accepts one of:

- `AutoRetry` (`maxRetries`, `retryDelay`, `retryBackoff`, optional `maxRetryDelay`) — retry
  automatically with exponential backoff.
- `HumanReview` — on failure, hand the step to a human for review instead of retrying
  automatically. Verify its field names against the resolved `ballerina/workflow` version before
  writing a literal for it rather than assuming the shape from memory.
- `NoAutomaticRetry` — the default when `retryPolicy` is omitted. The error from the activity is
  returned directly to the caller.

Omit `retryPolicy` entirely for the common case (matches every example in the official guide);
only add it when the user asks for retry or escalation behavior.

## Waiting on data events

A **single** external data event is a plain Ballerina `wait` on the matching `future<T>` field of
the events record — no `Context` call involved:

```ballerina
PaymentData payment = check wait events.paymentReceived;
```

**Multiple** data events together go through `ctx->await`, with the result **tuple-destructured**:

```ballerina
[string, boolean] [note, pass] = check ctx->await([events.reviewerNote, events.compliancePass], minCount = 2);
```

If `minCount` is less than the number of futures passed in, some tuple members may never resolve —
**every member type must then be nilable (`T?`)**:

```ballerina
[string?, boolean] [note, pass] = check ctx->await([events.reviewerNote, events.compliancePass], minCount = 1);
```

A non-nilable member type paired with a `minCount` smaller than the future count is rejected by
the compiler plugin.

`ctx->await` also takes a named `timeout` (the same `Duration` record used elsewhere): pass it to
give up waiting instead of blocking forever. A timeout behaves like an unmet `minCount` — treat it
the same way, with nilable member types for whichever futures may not have resolved yet.

```ballerina
[ValidationResult?, ValidationResult?, ValidationResult?] results =
        check ctx->await([events.validatorA, events.validatorB, events.validatorC], minCount = 2,
                timeout = {hours: 48});
```

## Starting and observing a workflow

```ballerina
public function main() returns error? {
    string workflowId = check workflow:run(<name>Workflow, <input>);
    io:println("Workflow started with ID: " + workflowId);

    anydata result = check workflow:getWorkflowResult(workflowId, <timeoutSeconds>);
}
```

- **Always bind the workflow ID to a variable** — every real usage does this, and you need the ID
  to send data, query the result, or report it to the caller.
- `getWorkflowResult` blocks until the workflow completes or the timeout elapses (default 30s);
  `run` itself returns immediately.
- The target of `run` must be a function annotated `@workflow:Workflow`, and `<input>` must match
  that function's declared input parameter type.

### Sending data into a running workflow

`workflow:sendData` delivers a value into a running workflow's events record so a `wait` on that
field can resolve:

```ballerina
check workflow:sendData(<name>Workflow, workflowId, "<fieldName>", <data>);
```

The module's own current documentation gives this order — `(workflow, workflowId, dataName,
data)`, `dataName` before `data`, and `dataName` matching the events record field name exactly.
**Older `ballerina/workflow` versions swapped `data` and `dataName`** — a real fixture from an
older version shows the opposite order. Confirm the resolved signature (hover or go-to-definition)
before writing the call rather than trusting either order from memory.

## Human tasks

`ctx->awaitHumanTask` pauses the workflow — durably, for hours or days if needed — until a person
completes it or it times out. This is a different mechanism from a `HumanReview` retry policy on
`callActivity` above: that one escalates an activity's *failure* to a human; this one is an
explicit pause point the workflow function reaches on its own, whether or not anything failed.

```ballerina
<Result> decision = check ctx->awaitHumanTask("<taskName>", userRoles = "<role>",
        taskInput = {<field>: <value>}, title = "<title>", description = "<description>");
```

- `taskName` is positional; everything else is named.
- `userRoles` (`string|string[]`) says who may complete the task.
- `taskInput` (`map<json>`) is the data shown to the reviewer. **Some `ballerina/workflow`
  versions before 0.9.0 named this field `payload` instead** — the same kind of version drift
  `sendData` has above. Check the resolved version before writing either name.
- `title` and `description` are both optional `string`s shown to the reviewer.
- `timeout` (optional `Duration`, the same record `callActivity`'s retry policy uses) gives up
  instead of waiting forever; omit it to wait indefinitely.

`awaitHumanTask` returns `<Result>|HumanTaskError`. Check for a timeout specifically — it usually
needs its own handling — and treat every other error (rejection, task failure) as a business
failure to propagate or handle generically:

```ballerina
<Result>|error decision = ctx->awaitHumanTask(...);
if decision is workflow:HumanTaskTimeoutError {
    // nobody acted before decision.detail().timedOutAfter — handle as a timeout, not a failure
} else if decision is error {
    // rejection, task failure, or any other business-level outcome
    return decision;
} else {
    // decision is <Result> — the reviewer's actual answer
}
```

A pending task is completed by a separate call, `workflow:completeHumanTask(taskWorkflowId,
result)` — but the integrator's own user portal usually completes tasks this way already, so
generate that call only when the user explicitly asks for a custom completion path outside the
portal, not by default.

### Alternative: approval over a data channel

`awaitHumanTask` is not the only way to model a human decision. When the decision will come from a
system the user already has — an existing approval UI, a webhook, a Slack action — rather than
needing this module's own task inbox, roles, and generated form, use the plain events-record
mechanism from "Waiting on data events" and "Sending data into a running workflow" instead:

```ballerina
type OrderEvents record {|
    future<ApprovalDecision> approval;
|};

@workflow:Workflow
function <name>Workflow(workflow:Context ctx, OrderInput input, OrderEvents events) returns OrderResult|error {
    check ctx->callActivity(validateOrder, {orderId: input.orderId});
    ApprovalDecision decision = check wait events.approval;
    if !decision.approved {
        return {orderId: input.orderId, status: "REJECTED"};
    }
    string fulfillmentId = check ctx->callActivity(fulfillOrder, {orderId: input.orderId});
    return {orderId: input.orderId, status: "COMPLETED", fulfillmentId};
}
```

The external system resolves it with an ordinary `workflow:sendData` call — for example, from an
HTTP resource the user's own approval UI calls:

```ballerina
resource function post orders/[string workflowId]/approve(ApprovalDecision decision) returns json|error {
    check workflow:sendData(<name>Workflow, workflowId, "approval", decision);
    return {status: "accepted"};
}
```

Reach for this instead of `awaitHumanTask` when the user describes an approval source outside this
module's own task mechanism — there is no inbox, no roles, and no generated form; the workflow
simply resumes when the data arrives.

## Child workflows

```ballerina
string childId = check ctx->runChildWorkflow(<childWorkflow>, <input>);
<Result> result = check ctx->waitForChildWorkflow(childId);
```

`callWorkflow` runs and waits in one call (`runChildWorkflow` + `waitForChildWorkflow` fused).
`getChildWorkflowResult` is the non-blocking variant — it returns a `WorkflowBusyError` while the
child is still running, so prefer `waitForChildWorkflow` unless the caller specifically wants to
poll. A parent workflow closing cancels any of its children still in flight.

## Configuration (`Config.toml`)

Development, in-process, no persistence:

```toml
[ballerina.workflow]
mode = "IN_MEMORY"
```

Durable, backed by a local Temporal-compatible runtime:

```toml
[ballerina.workflow]
mode = "LOCAL"
taskQueue = "<queueName>"
```

`mode` also accepts `CLOUD` and `SELF_HOSTED` for hosted/self-managed deployments — ask the user
for connection details rather than inventing keys for those modes; only `IN_MEMORY` and `LOCAL`
(with `taskQueue`) are confirmed here. Default new projects to `IN_MEMORY` unless the user asks
for durability across restarts, at which point use `LOCAL` and pick a `taskQueue` name from the
workflow's purpose.

## Out of scope: `workflow:DurableAgent`

`workflow:DurableAgent` is a separate, more complex construct for building a long-running agentic
process out of activities, tools, events and human tasks together — it is not what this skill
covers. If the user's request is really "an AI agent that also needs to durably survive restarts
and pause for human approval over days," say that `ballerina/workflow`'s `DurableAgent` may be the
right building block, but do not improvise its declaration shape from this skill — treat it as a
distinct, unverified feature and ask before generating it.
