---
name: agent-builder
description: Use this skill whenever you are writing or modifying Ballerina AI agent code — declaring an `ai:Agent`, its system prompt or model provider, adding agent tools, wiring subagents, or attaching a chat trigger. Applies to every `.bal` file that declares or edits an agent, including `agents.bal`.
---

# Agent Builder

The agent diagram is not generated from a model — it is parsed directly out of the source you
write. Code that compiles but does not match the shapes below still renders as an incomplete or
empty agent, and the user cannot then edit it from the low-code side. Follow every rule.

`<...>` marks a placeholder to substitute from the user's request. Never emit it literally.

Derive identifiers from the agent's purpose in camelCase, and keep the family consistent:
`<agent>Agent`, `<agent>Model`, `<agent>Listener`. Service paths are the exception — they are
kebab-case, written `<agent-name>`.

## System prompt — always inline

The system prompt MUST be an inline mapping constructor in the `ai:Agent` construction. A prompt
assigned to a separate variable and referenced by name is not read at all — the agent card renders
with no role and no instructions.

Both `role` and `instructions` MUST use the `string` backtick template so multi-line text survives
a round trip.

Correct:

```ballerina
final ai:Agent <agent>Agent = check new (
    systemPrompt = {
        role: string `<short role name>`,
        instructions: string `<first line of instructions>
<continuation line, starting at column 0>
<continuation line, starting at column 0>`
    }, model = <agent>Model, tools = [<toolName>, <toolName>]
);
```

Wrong — the prompt is hoisted into a variable, so the diagram loses it:

```ballerina
final ai:SystemPrompt <agent>SystemPrompt = {
    role: "<short role name>",
    instructions: string `<instructions>`
};

final ai:Agent <agent>Agent = check new (systemPrompt = <agent>SystemPrompt, ...);
```

Do not indent the continuation lines of `instructions` to match the surrounding code — the leading
whitespace is part of the string and is shown to the user in the prompt editor. Start every
continuation line at column 0, as above.

## Model provider — declare the concrete type

Use `ai:Wso2ModelProvider` unless the user asks for a specific provider (OpenAI, Azure, Anthropic,
Ollama, …). Declare the variable with the **concrete class**, never the `ai:ModelProvider`
abstract type — the model node is identified by the declared type name, so the abstract type
renders as an unresolved model.

```ballerina
final ai:Wso2ModelProvider <agent>Model = check ai:getDefaultModelProvider();
```

Not `final ai:ModelProvider <agent>Model = check ai:getDefaultModelProvider();`.

When the user does name a provider, the same rule holds — declare the provider's own class, not
`ai:ModelProvider`.

## Agent tools

Every tool is a module-level `isolated function` annotated with `@ai:AgentTool`, listed by name in
the agent's `tools` array. The function MUST be `isolated`, every parameter MUST be a subtype of
`anydata`, and the return type MUST be a subtype of `anydata`, `stream<anydata>` or
`http:Response`. A non-isolated function is rejected as a tool.

The doc comment is the tool description the model sees at runtime, so always write it — a `#`
description line, a `# + <param> - ...` line per parameter, and `# + return - ...`.

```ballerina
# <what the tool does, one line>
# + <param> - <what the parameter is>
# + return - <what is returned>
@ai:AgentTool
isolated function <toolName>(<params>) returns <Type>|error {
    <Type> result = check <call>;
    return result;
}
```

### Tools backed by a connection

When a tool calls into a Ballerina connector client, add a `@display` annotation so the tool node
renders with the connector's icon:

```ballerina
# <what the tool does, one line>
# + <param> - <what the parameter is>
# + return - <what is returned>
@ai:AgentTool
@display {label: "", iconPath: "https://bcentral-packageicons.azureedge.net/images/<org>_<package>_<version>.png"}
isolated function <toolName>(<params>) returns <Type>|error {
    <Type> result = check <clientVar>-><action>(<args>);
    return result;
}
```

Build `iconPath` from the connector's organization, package name and resolved version, joined by
underscores with `.png` appended. The version keeps its dots — only the three segments are
underscore-joined. Use the version actually resolved for the dependency, not a guess. Leave
`label` as the empty string.

Only add `@display` to tools that call a connector. Plain computation tools take no `@display`.

### Subagents

An agent cannot be passed to another agent directly. Wrap the subagent call in an agent tool and
list that tool in the parent's `tools` array:

```ballerina
# <what delegating to this subagent accomplishes, one line>
# + context - Context injected by the runtime; forwarded so the subagent shares the caller's context
# + <param> - <the request or payload to send to the subagent>
# + sessionId - Conversation handle. Generate a unique id to start a new conversation with the agent and reuse the same id to continue it across turns. Omit for a one-off, stateless request.
# + return - <what the subagent returns>
@ai:AgentTool
isolated function <subAgent>AgentTool(ai:Context context, string <param>, string sessionId = "") returns string|error {
    string response = check <subAgent>Agent.run(<param>, sessionId, context);
    return response;
}
```

Keep both extra parameters: `ai:Context` carries the parent's context down to the subagent, and
`sessionId` is what lets the subagent hold a multi-turn conversation. Reuse the `sessionId` doc
line above verbatim — the model reads it to decide when to generate a fresh id and when to reuse
one.

## No expression-bodied functions

Write agent tools and helper functions with a block body and an explicit `return`. An
expression-bodied function is classified as a data mapper, not a function, so it lands in the wrong
place in the diagram.

```ballerina
isolated function <toolName>(decimal a, decimal b) returns decimal {
    return a + b;
}
```

Not `isolated function <toolName>(decimal a, decimal b) returns decimal => a + b;`.

The one exception is a genuine data-mapper transform function, where `=>` is required — see the
`data-map` skill.

## Chat trigger

Attach a chat trigger by default. An agent with no entry point cannot be run or tested, so generate
one alongside the agent without being asked — unless an exception below applies.

Do NOT attach a chat trigger when:

- **The user describes another trigger.** An event-driven or scheduled flow, an HTTP or GraphQL
  service, a webhook, a queue or topic listener, a messaging channel, an automation. Generate that
  trigger instead — an agent gets one entry point, not two.
- **The agent is a subagent.** An agent invoked through an agent tool is reached in-process by its
  parent and must never get its own HTTP endpoint.
- **The agent already has a trigger** wired to it in the existing code.

The trigger is an `ai:Listener` and a service with a single `post chat` resource, exactly in this
shape:

```ballerina
import ballerina/ai;
import ballerina/http;

listener ai:Listener <agent>Listener = new (listenOn = check http:getDefaultListener());

service /<agent\-name> on <agent>Listener {
    resource function post chat(@http:Payload ai:ChatReqMessage request) returns ai:ChatRespMessage|error {
        string stringResult = check <agent>Agent.run(request.message, request.sessionId);
        return {message: stringResult};
    }
}
```

Name the listener and the service base path after the agent. The base path is kebab-case, and
because a Ballerina identifier cannot contain a bare hyphen, **every hyphen in the path MUST be
escaped with a backslash** (`\-`). The escape is syntax only — it does not appear in the URL the
client calls.

Do not add extra resources to this service, and do not change the `chat` resource signature — the
trigger node is matched on it.

This trigger is a normal, deployable service. It is not the same as `_agent_chat.bal`, which the
low-code side generates on its own for try-it testing and marks as not for production. Never
create, edit or imitate that file.
