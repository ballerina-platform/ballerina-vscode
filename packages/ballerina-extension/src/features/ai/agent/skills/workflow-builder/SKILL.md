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

## Durable agents — `workflow:DurableAgent`

A durable AI agent declared as an object. Its capabilities — activities, tools, event channels,
human tasks, peers — are fixed in the constructor, and the compiler plugin generates the Temporal
registration for them at module init.

**This section describes `ballerina/workflow` 0.10.0**, which reshaped the declaration surface:
several 0.9.x fields were removed, and the compiler plugin rejects them outright rather than
ignoring them (`WORKFLOW_163`). Check the resolved version before writing a declaration, the same
way you would for `sendData` or `awaitHumanTask` above.

```ballerina
final workflow:DurableAgent <agentName> = check new ({
    systemPrompt: {role: "<role>", instructions: "<instructions>"},
    model: <modelProvider>,
    activities: [<activityName>, <activityName>],
    events: {<channelName>: {request: <RequestType>, response: <ResponseType>}}
});
```

Declaration rules, all compiler-enforced:

- **Assign it to a module-level `final` variable** (`WORKFLOW_149`). Never a local variable, never
  a non-`final` one.
- **Initialize it inline** with `new ({...})` or `new workflow:DurableAgent({...})` in the variable
  declaration itself (`WORKFLOW_151`). Never build the config into a variable first, and never
  return the agent from a factory function: every worker replica has to derive the same
  registration deterministically.
- **The module-level variable name is the agent's stable identity**, so renaming the variable
  renames the agent.
- **`check new ({...})`** — `init` takes `*DurableAgentConfig` as an included record, so the whole
  configuration is a single mapping argument, and the constructor returns an error on an invalid
  config.

`bindAgentName` exists on the object but is called by the compiler-plugin-generated module-init
code and is not part of the public API surface — never write a call to it.

### `DurableAgentConfig`

| Field | Type | Default |
|---|---|---|
| `systemPrompt` | `ai:SystemPrompt` | required |
| `model` | `ai:ModelProvider` | required |
| `inputType` | `typedesc<json>?` | `json` |
| `resultType` | `typedesc<anydata>?` | `()` |
| `activities` | `(ActivityDecl\|function)[]` | `[]` |
| `tools` | `(ToolDecl\|ai:ToolConfig\|ai:BaseToolKit\|function)[]` | `[]` |
| `events` | `map<EventConfig>` | `{}` |
| `humanTasks` | `map<HumanTaskDefinition>` | `{}` |
| `peers` | `PeerDecl[]` | `[]` |
| `maxIter` | `int` | `16` |
| `eventTimeout` | `Duration?` | `()` |
| `maxEventWaits` | `int` | `50` |

`maxIter` caps reasoning iterations per turn. `eventTimeout` is the maximum wait per event-channel
wait; omitted, a conversation stays open as long as it takes, and on a timeout the model is told so
it can wrap up gracefully. `maxEventWaits` caps event waits per run — chat turns and events
together — as the backstop for a conversation nobody closes; raise it for a chat-like agent whose
turns are many and short.

**Capability names share one namespace** across `activities`, `tools`, `events`, `humanTasks` and
`peers`. A name claimed twice is reported at compile time as `WORKFLOW_150`, and rejected again
when the agent registers, so the program does not start.

For a capability that needs no extra configuration, pass the bare value — an `@workflow:Activity`
function in `activities` (as the example above does), or an `@ai:AgentTool` function,
`ai:ToolConfig` or `ai:BaseToolKit` in `tools`. The records below are the with-configuration forms.

#### `ActivityDecl`

An activity capability, with optional gating and retry config.

| Field | Type | Default |
|---|---|---|
| `activity` | `function` | required — the `@workflow:Activity` function |
| `name` | `string` | optional — the function name |
| `description` | `string` | optional — the function's doc comment |
| `bindings` | `map<anydata\|object {}>` | optional |
| `approvalPolicy` | `ReviewTaskDefinition\|NoApproval` | `NoApproval` |
| `retryPolicy` | `AutoRetry\|ReviewTaskDefinition\|RetryBeforeReview\|NoRetry` | `NoRetry` |

`name` and `description` are what the model sees; they default to the function's own name and doc
comment. `bindings` are fixed arguments partially applied to the activity (a connection, say),
hidden from the model — only the remaining data parameters appear in the tool's schema, and a client
object is bound by referencing its module-level `final` variable. `retryPolicy` behaves as it does
for `ctx->callActivity`, and `RetryBeforeReview` retries automatically first and raises a review
only once the attempts are spent.

#### `ToolDecl`

An AI tool capability, with optional gating config.

| Field | Type | Default |
|---|---|---|
| `tool` | `ai:BaseToolKit\|ai:ToolConfig\|ai:FunctionTool` | required |
| `approvalPolicy` | `ReviewTaskDefinition\|NoApproval` | `NoApproval` |

**A tool whose `@ai:AgentTool` declares `auth` is rejected** (`WORKFLOW_155`): a durable agent does
not run the `ai:Agent` loop, so the tool would run without token acquisition or scope validation.
Never offer an authenticated tool to a durable agent — wrap the call in an `@workflow:Activity`
function instead.

#### Gating a capability: `approvalPolicy`

On `ActivityDecl` and `ToolDecl`, an `approvalPolicy` gates every call with a `PRE_RUN` review and
names who may decide it — `{activity: <activityName>, approvalPolicy: {userRoles: "<role>"}}`.
`NoApproval`, the default, runs the call directly. A review definition must name an audience —
`userRoles`, `users`, or both — or the build fails with `WORKFLOW_164`.

**`requiresApproval` and `userRoles` are not fields of `ActivityDecl` or `ToolDecl`.** They were
removed in 0.10.0 in favour of `approvalPolicy`, and writing either is a build error
(`WORKFLOW_163`) rather than a silently ignored field, because ignoring `requiresApproval: true`
would drop a gate.

#### `HumanTaskDefinition`

The values of `humanTasks`, keyed by task name — `humanTasks: {signoff: {userRoles: ["manager"]}}`.

| Field | Type | Default |
|---|---|---|
| `userRoles` | `string\|[string, string...]?` | required — `()` when only `users` may decide |
| `users` | `string\|[string, string...]` | optional |
| `excludedUsers` | `string\|[string, string...]` | optional |
| `excludedRoles` | `string\|[string, string...]` | optional |
| `administratorRoles` | `string\|[string, string...]` | optional |
| `administratorUsers` | `string\|[string, string...]` | optional |
| `title` | `string?` | `()` |
| `description` | `string?` | `()` |
| `timeout` | `Duration?` | `()` |
| `taskInputType` | `typedesc<map<json>>` | `JsonObject` |
| `resultType` | `typedesc<anydata>` | `anydata` |

The first nine are included from `*ReviewTaskDefinition`, and the record is open. The audience
fields take a string or a **non-empty tuple** (`string|[string, string...]`), not a `string[]` — a
literal like `["manager", "finance"]` is fine, but a `string[]` variable is not assignable.
`userRoles` is a required field of nilable type: at least one of `userRoles` and `users` must name
someone, and a definition naming nobody fails with `WORKFLOW_164`. Input supplied to the task is
checked against `taskInputType` before the task is created. `resultType` is how an agent declares
the answer's shape; a workflow states that as `awaitHumanTask`'s `T` instead.

#### `PeerDecl`

A peer advertised to this agent's model as delegable tools. The framework runs the peer as a
Temporal child workflow.

| Field | Type | Default |
|---|---|---|
| `agent` | `DurableAgent\|function` | required — the peer agent, or a `@workflow:Workflow` function |
| `description` | `string` | optional — what the peer does, for the model |
| `allowedEvents` | `string[]` | optional — omit for every declared event, `[]` for the run entry only |

A peer's identity is its own module-level variable name: that name prefixes the tool names the
model sees, and it is what must be unique across this agent's capabilities — there is no `name`
field to set. The framework advertises one tool to start the peer plus one per peer event
`allowedEvents` admits. A one-way peer event returns an acknowledgement at once; a duplex event, or
the run entry, waits durably for the answer. A `@workflow:Workflow` function as `agent` is started
fire-and-forget, since a workflow has no events to answer on.

Gating belongs to the peer's own activities and tools, not to the delegation. `PeerDecl` has no
`name`, `'wait`, `callbackChannel`, `requiresApproval` or `userRoles` field — all five were removed
in 0.10.0, and each is a `WORKFLOW_163` build error. The reply address travels with each
delegation, so there is no callback channel to declare.

#### `EventConfig`

An event channel is one `EventConfig`, keyed in `events` by the channel name:

| Field | Type | Default |
|---|---|---|
| `request` | `typedesc<anydata>` | required |
| `response` | `typedesc<anydata>?` | `()` |
| `cardinality` | `EventCardinality` | `MULTI_EVENT` |

A `response` type declares a **duplex** channel, whose turn answers are read back with
`getDataResult` / `waitForDataResult`; a nil `response` declares a **one-way** channel — data flows
in and nothing is read back. `cardinality` is `workflow:MULTI_EVENT` (re-armed per turn, the
default) or `workflow:SINGLE_EVENT` (consumed once) — declare `SINGLE_EVENT` only when the channel
receives exactly one event per agent instance, since a later event on it is never consumed.

Declare `events` and `humanTasks` in the mapping form keyed by name, as above. The array form is
deprecated and warns (`WORKFLOW_159`): a mapping key is a compile-time constant by construction,
which the name must be.

### Driving the agent

Every one of these is a plain method, **not** a remote method — call them with `.`, never `->`.

```ballerina
string instanceId = check <agentName>.run(<query>, <input>);
string token = check <agentName>.sendData(instanceId, "<channelName>", <data>);
<Result> result = check <agentName>.waitForResult(instanceId);
<Response> reply = check <agentName>.waitForDataResult(instanceId, token);
```

- **`run(string query, json input = ())` returns the new instance ID — always the ID, never the
  result.** A durable agent may suspend for days on a human task, so no caller thread is blocked.
  `query` is the user turn appended to the agent's system prompt; `input` is an optional structured
  JSON payload that must match the agent's declared `inputType`. Outside a workflow this is a
  top-level start; inside a `@workflow:Workflow` the agent runs as a Temporal child workflow.
- **`sendData(instanceId, eventName, data)` returns a correlation token**, not the answer — hold it
  to read that turn's response. `eventName` must be a channel declared in the agent's `events`,
  `data` is validated against that channel's declared `request` type, and `instanceId` must be one
  this same agent's `run` returned.
- **Non-blocking reads: `getResult` / `getDataResult`.** They do not wait: while the instance — or
  that specific turn — is still in progress, they return a `workflow:AgentBusyError`. Use them only
  when the caller genuinely wants to poll and check back later.
- **Durable waits: `waitForResult` / `waitForDataResult`.** Inside a workflow these suspend the
  caller durably, holding no thread; from a service they block but are resumable — if the caller
  crashes, calling again after restart resumes the wait, because the result lives in history.

Prefer the waiting forms unless the user specifically asks to poll.
