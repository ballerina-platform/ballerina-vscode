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

The same applies to every `ai` component the diagram identifies by declared type. An embedding
provider is `ai:Wso2EmbeddingProvider`, never `ai:EmbeddingProvider`; a vector store is
`ai:InMemoryVectorStore`, never `ai:VectorStore`. The abstract type renders as an unresolved node in
each case.

## Agent tools

Every tool is a module-level `isolated function` annotated with `@ai:AgentTool`, listed by name in
the agent's `tools` array. The function MUST be `isolated`, every parameter MUST be a subtype of
`anydata`, and the return type MUST be a subtype of `anydata`, `stream<anydata>` or
`http:Response`. A non-isolated function is rejected as a tool.

The doc comment is the tool description the model sees at runtime, so always write it — a `#`
description line, a `# + <param> - ...` line per parameter, and `# + return - ...`.

Declare each parameter with the type the tool actually needs — `int`, `decimal`, `boolean`, an enum,
a record — not `string`. The runtime converts the model's arguments to the declared types, so a
parameter typed `string` and then parsed inside the body moves that conversion from the framework
into the tool, where a value the model formats slightly differently (`"#42"`, `"42 "`, `"forty-two"`)
becomes a runtime error instead of being coerced or rejected up front.

```ballerina
# + issueNumber - the number of the issue to label
isolated function <toolName>(int issueNumber) returns string|error {
```

Not `string issueNumber` followed by `int issueNumberValue = check int:fromString(issueNumber);`.

A narrow type is also a better description than prose: prefer an enum of the accepted values over a
`string` parameter whose doc comment lists them.

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
# + sessionId - Conversation handle. Generate a unique id to start a new conversation with the agent, and reuse the same id to continue it across turns.
# + return - <what the subagent returns>
@ai:AgentTool
isolated function <subAgent>AgentTool(ai:Context context, string <param>, string sessionId) returns string|error {
    string response = check <subAgent>Agent.run(<param>, sessionId, context);
    return response;
}
```

Keep both extra parameters: `ai:Context` carries the parent's context down to the subagent, and
`sessionId` is what lets the subagent hold a multi-turn conversation. Reuse the `sessionId` doc
line above verbatim — the model reads it to decide when to generate a fresh id and when to reuse
one.

Give `sessionId` **no default**. A default makes every call that leaves it out share one memory
bucket, so unrelated requests from different callers see each other's history. Required, the model
supplies a fresh id per conversation, which is the behaviour the doc line describes.

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

## Never write an `init` function

A module-level function named `init` does not compile in a package that declares an `ai:Agent`. It
fails with `uninitialized variable '<agent>Agent'` on the agent declaration itself, even when the
`init` body is empty, and the error does not mention `init` — so it reads as a problem with the
agent.

Put one-time startup work — ingesting documents into a knowledge base, seeding a cache, warming a
connection — in `main`:

```ballerina
public function main() returns error? {
    check <setupFunction>();
}
```

`main` runs after every module-level variable is initialised and before any request is served, so
the agent and its knowledge base are ready by the time the first message arrives. A service package
keeps running after `main` returns.

Never call the setup function from a module-level variable declaration just to get it to run.

## Data loaders take file paths, never a folder

`ai:TextDataLoader` is constructed with one or more **file** paths — `init(string... paths)`. Passing a
directory compiles, and its constructor accepts it, because construction only checks that each path
exists. It fails later, at `load()`, with `Unsupported file type: <name>` — so a folder path surfaces as
a runtime error that names a file type rather than the real problem.

To ingest a folder, enumerate it and spread the result:

```ballerina
function <ingestFunction>() returns error? {
    file:MetaData[] entries = check file:readDir(<docsPath>);
    string[] paths = from file:MetaData entry in entries
        where !entry.dir
        select entry.absPath;
    ai:DataLoader loader = check new ai:TextDataLoader(...paths);
    ai:Document|ai:Document[] documents = check loader.load();
    check <knowledgeBase>.ingest(documents);
}
```

That needs `import ballerina/file;`. Enumerating the folder is correct whether or not the loader later
accepts one directly, so prefer it over passing a path you have not verified.

Only these extensions load as of `ballerina/ai` 1.13.0: `md`, `html`, `htm`, `pdf`, `docx`, `pptx`.
**`.txt` is not supported** — despite the type's name, a plain text file fails with
`Unsupported file type: txt`. Ask for, and claim, only these formats: a prompt or a doc comment
promising `.txt` or `.csv` ingestion describes something the loader cannot do.

## Knowledge bases

A retrieval-augmented agent needs three declarations, each with its concrete type, plus a tool that
queries it:

```ballerina
final ai:Wso2EmbeddingProvider <agent>EmbeddingProvider = check ai:getDefaultEmbeddingProvider();
final ai:InMemoryVectorStore <agent>VectorStore = check new ai:InMemoryVectorStore();
final ai:KnowledgeBase <agent>KnowledgeBase =
        new ai:VectorKnowledgeBase(<agent>VectorStore, <agent>EmbeddingProvider);
```

`ingest` accepts `Document`, `Document[]` or `Chunk[]` — pass the loader's result straight through
without unwrapping it. `retrieve` takes the query and a result limit and returns `QueryMatch[]`,
where each match carries its text at `chunk.content`:

```ballerina
# <what this searches, one line>
# + query - <what to search for>
# + return - the matched excerpts, or an error if the search fails
@ai:AgentTool
isolated function <toolName>(string query) returns string|error {
    ai:QueryMatch[] matches = check <agent>KnowledgeBase.retrieve(query, 5);
    if matches.length() == 0 {
        return "<no relevant information was found>";
    }
    string[] excerpts = from ai:QueryMatch match in matches
        select match.chunk.content.toString();
    return string:'join("\n", ...excerpts);
}
```

Return the excerpts as text and let the agent read them. Do not have the tool answer the question
itself — the agent's own instructions decide how the excerpts are used.

Ingestion is startup work, so it belongs in `main`, never in `init` — see above. A knowledge base
that is never ingested retrieves nothing and the agent answers from the model alone, with no error
to show why.

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
