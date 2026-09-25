---
name: agent-evals
description: Writes, fixes and debugs evaluations (evals) of Ballerina AI agents in the form the Agent Builder can list and edit - `@test:Config` functions in the `evaluations` group, `ballerina/ai.eval` template calls, custom evals and evalset files. Use when the user asks to evaluate, benchmark or regression-test an `ai:Agent`, to create an evalset, or to fix a failing eval. Not for ordinary unit tests.
---

# Agent evaluations

The Agent Builder's Evaluations list and AI Evaluation form parse evals from `tests/tests.bal`. An eval
that compiles but breaks a rule here is missing from the list, opens as a plain test, or loses its
settings when saved from the form. `<...>` marks a placeholder; never emit it literally.

## Eval function

Write evals in `tests/tests.bal`, creating it if missing. Import `ballerina/ai`, `ballerina/ai.eval` and
`ballerina/test` without aliases. Name the agent by its module-level variable, `<agent>Agent`: an eval
is listed under the agent it names.

```ballerina
@test:Config {
    groups: ["evaluations"],
    minPassRate: 0.8,
    runs: 3,
    dataProvider: <loadFunction>
}
function evaluate<Agent><Aspect>(<parameter>) returns error? {
```

- `minPassRate`: always set, 0 to 1, `0.8` unless the user gives one. Without it the report has no pass
  rate and shows each row as a separate test.
- `runs`: 3 to 5 when an LLM judges the answer, otherwise leave it out.
- No other fields or annotations: the form rewrites the annotation on save.
- One aspect per eval.

## Data providers

Give each eval its own provider in the same file, even when two load the same data: the form rewrites
a provider when its eval's data changes. Use one of these bodies exactly:

```ballerina
isolated function <loadFunction>() returns map<[ai:ConversationThread]>|error {
    return ai:loadConversationThreads("tests/resources/evalsets/<evalset-name>.evalset.json");
}

isolated function <loadFunction>() returns map<[string]>|error {
    string[] queries = [string `<query>`, string `<query>`];
    return map from string query in queries select [re `["\\]`.replaceAll(query, "'"), [query]];
}
```

- Evalset: the path is a string literal, not a constant or variable. Copy it from the `<evalsets>`
  listing and `file_read` the file for its turns and tool calls. If the user means an evalset that is
  not listed, ask. The eval takes `ai:ConversationThread thread`; each thread is one row.
- Queries: keep the `return` line as shown, it names each row after its query. The eval takes
  `string query`.
- No provider: a custom eval with one hard-coded query.

## Template evals

Prefer an `ai.eval` template when one measures what the user asked for. Ask the Librarian about
`ballerina/ai.eval` for its templates, which ones need an evalset, and their options and defaults. Use
only templates the report names.

The body is exactly one statement with named arguments, `targetAgent` first and the data argument
last. Any other statement makes the form treat it as a custom eval.

```ballerina
check eval:<template>(targetAgent = <agent>Agent, judgeModel = check ai:getDefaultModelProvider(), <option> = <value>, <dataParam> = <thread-or-query>);
```

Pass `judgeModel` only to LLM-judge templates, and leave out options at their default. `<dataParam>` is
the template's own parameter name for its thread or query.

## Custom evals

When no template fits, replay each thread and assert with `ballerina/test`:

```ballerina
function evaluate<Agent><Aspect>(ai:ConversationThread thread) returns error? {
    foreach ai:Trace trace in thread.traces {
        ai:Trace actual = check <agent>Agent.run(ai:getUserQuery(trace), thread.id);
        test:assert<...>(<check on actual against trace>, string `<what went wrong> for "${ai:getUserQuery(trace)}"`);
    }
}
```

- `thread.id` is the session id, so later turns see earlier ones.
- `run` returns the type you assign: `ai:Trace` for tool calls and iterations, `string` for the answer.
- `actual.output` is `ai:ChatAssistantMessage|ai:Error`: `check` it and read `content ?: ""`. Default
  `toolCalls` with `?: []`.
- Compare tool calls by name, or use the tool-trajectory template. Never `test:assertEquals` whole
  calls: live calls carry ids that recorded ones lack.

## Evalset files

Evalsets live at `tests/resources/evalsets/<evalset-name>.evalset.json`. If the user has real
sessions, suggest exporting them from the trace view. `ai:loadConversationThreads` rejects the whole
file if a field is missing or a trace has an extra one:

```json
{
  "id": "<uuid>",
  "name": "<evalset-name>",
  "description": "",
  "threads": [{
    "id": "<thread-id>",
    "description": "<scenario>",
    "traces": [{
      "id": "<thread-id>-1",
      "userMessage": {"role": "user", "content": "<user message>"},
      "iterations": [],
      "output": {"role": "assistant", "content": "<expected value>"},
      "tools": [],
      "toolCalls": [{"name": "<toolName>", "arguments": {"<param>": "<value>"}}],
      "startTime": "2026-01-01T00:00:00Z",
      "endTime": "2026-01-01T00:00:01Z"
    }]
  }]
}
```

One trace per user turn, in order. Omit `toolCalls` when no tool should run. `iterations` and `tools`
stay `[]`.

### Expected values

Find out how the eval compares them, from the template's docs or your own assertion. Then write each
value so that every reply that follows the agent's instructions and data passes, and a wrong reply
fails:

- Expect only what the instructions require. Unless they demand exact wording, expect the key fact (a
  number, a name, a term), not a sentence copied from a source file.
- Give each query one correct answer. "Show me an example" has many: name the example.

## Checking your work

Fix every error `getCompilationErrors` reports. Evals call the model for every row and run, so run
them only when the user asks, with `runTests` and their function names in `tests`.

## Debugging a failing evaluation

The report gives each failed row's message, and for an LLM judge its score and reasoning. It does not
record the agent's answer, tool calls or tool results, so diagnose from a replay, not from the message:

1. **Replay.** Add this test to `tests/tests.bal` with `import ballerina/io;`, one loop per failing
   thread. Tell the user it calls the model once per turn, run only `probeFailingRows` with `runTests`,
   then remove the test and the import. This is not a rerun of the eval.

   ```ballerina
   @test:Config {}
   function probeFailingRows() returns error? {
       foreach string query in [string `<user message>`, string `<next user message>`] {
           ai:Trace actual = check <agent>Agent.run(query, "<thread-id>");
           foreach ai:Iteration iteration in actual.iterations {
               iteration.output.forEach(step => io:println(step));
           }
           io:println(query, " => ", (check actual.output).content);
       }
   }
   ```

2. **Classify.** Compare the replay with the expected value and the agent's instructions:
   - Test environment: a tool returned nothing or an error. `bal test` starts no `main`, service or
     automation, and reads `tests/Config.toml`. Move setup such as knowledge-base ingestion into a
     `@test:BeforeSuite` function, and check configuration with `ConfigCollector` in check mode.
   - Agent: it broke its instructions or data (skipped or misused a tool, a tool returned wrong data),
     or its instructions do not cover the case.
   - Eval: the agent followed its instructions and data and still failed. The expected value asks for
     more than the instructions require, the query has more than one correct answer, or a judge marks
     down something outside its criterion.
3. **Report and fix.** Give the user the cause and the replay evidence in one or two sentences. Make a
   small, clear fix; describe anything larger and ask first. Never lower `minPassRate` or a judge
   threshold, remove rows, or loosen an expected value to hide an agent mistake unless the user agrees.
   Ask before rerunning the eval.
