---
name: agent-library
description: Writes reusable artifacts in a Ballerina library package (one whose `lib.bal` imports `wso2/strict.library`): agent definitions (public classes that include `*ai:FixedTypedAgent`), public agent tools, types, data mappers and functions that other packages in the project import. Use whenever the target package is a library, together with the agent-builder skill for prompt and tool rules.
---

# Agent Library

A library package has no entry point. Other packages in the project import it and use what it
makes `public`. Follow the agent-builder skill for system prompts, model providers, tool signatures
and doc comments. This skill overrides it where the two differ.

## No entry points

The `wso2/strict.library` import in `lib.bal` rejects any entry point, so never write:

- `main`, a service, a listener or a trigger,
- a module-level function named `init`,
- a module-level `ai:Agent` variable. The `ai` compiler plugin generates a module `init` for it,
  and the build fails with `library projects must not contain entrypoints. Found: function init`.

Write an agent as an agent definition instead, see below.

## Make shared artifacts `public`

Another package can use only `public` declarations. Make every agent definition, agent tool, type,
data mapper, function and client that the request asks to share `public`. Keep helpers private.

## Agent definitions

An agent definition is a `public isolated class` that includes `*ai:FixedTypedAgent`. Name it
`<Purpose>Agent` in PascalCase. Its doc comment is the description the user sees. Use this shape
exactly, the agent definition designer parses it:

```ballerina
import ballerina/ai;

# <what the agent does, one line>
public isolated class <Purpose>Agent {
    *ai:FixedTypedAgent;

    private final ai:Agent agent;

    # Initializes the agent
    # + model - The AI model provider to use
    # + memory - The memory implementation to use
    public function init(ai:ModelProvider model, ai:Memory? memory = ()) returns error? {
        self.agent = check new (
            systemPrompt = {
                role: string `<short role name>`,
                instructions: string `<first line of instructions>
<continuation line, starting at column 0>`
            },
            model = model,
            memory = memory,
            tools = [self.<classTool>, <moduleTool>]
        );
    }

    public isolated function run(string|ai:Prompt query,
            string sessionId = "sessionId",
            ai:Context context = new) returns string|ai:Error {
        return self.agent.run(query, sessionId, context);
    }

    public isolated function trace(string|ai:Prompt query,
            string sessionId = "sessionId",
            ai:Context context = new) returns ai:Trace|ai:Error {
        return self.agent.run(query, sessionId, context);
    }
}
```

The class takes its model as an `init` parameter. Do not construct a model provider inside it, the
package that runs the agent chooses the model.

## Agent tools

A tool that only this agent uses is a method of the class: an `isolated function` with
`@ai:AgentTool`, listed as `self.<classTool>` in `tools`. It is not visible to other packages.

A tool that agents in other packages call is a module-level `public isolated function` with
`@ai:AgentTool`. All other agent-builder tool rules apply, a tool without `public` cannot be used
outside the library.

## Knowledge bases

Ingestion needs `main`, which a library cannot have. Declare the knowledge base as in the
agent-builder skill, add a `public` function that ingests a list of file paths, and tell the user
that the integration that runs the agent must call it from its own `main`.

## Configuration

A library can declare `configurable` variables, for example connection credentials. The package
that imports the library sets them in its `Config.toml` under `[<org>.<library package name>]`.
Tell the user which values to set there.

## Using the library

In a summary, show how another package uses what you wrote:

```ballerina
import <org>/<library package name>;

final <library package name>:<Purpose>Agent <purpose>Agent = check new (check ai:getDefaultModelProvider());
```

and `tools = [<library package name>:<moduleTool>]` for a shared tool. Do not suggest testing the
agent or adding a trigger in the library itself.
