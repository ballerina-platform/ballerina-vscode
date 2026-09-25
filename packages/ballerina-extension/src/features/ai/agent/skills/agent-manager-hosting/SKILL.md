---
name: agent-manager-hosting
description: Connects Ballerina AI agents and durable agents to WSO2 Agent Manager, as externally hosted agents (tracing setup) or platform-hosted agents (Chat Agent or Custom API entry point, build, tracing and configuration rules, runtime limits, reaching a workflow server). Use only when the user says the agent will be deployed on, hosted on or observed by WSO2 Agent Manager.
---

# Agent Manager Hosting

These rules describe WSO2 Agent Manager 1.0. If the user reports platform behaviour that differs
from a rule here, trust the platform and say which rule no longer holds.

An agent joins Agent Manager in one of two ways; ask which when the user has not said:

- **Externally hosted**: the user runs the agent wherever they like, and it only sends traces to
  Agent Manager.
- **Platform-hosted**: Agent Manager builds the project from Git with the Ballerina buildpack and
  runs it in a locked-down container.

## Externally hosted agents

The agent code stays as it is. Add tracing:

1. `import ballerinax/amp as _;`
2. In `Ballerina.toml`, `[build-options]` gets `observabilityIncluded = true`.
3. In `Config.toml`:

   ```toml
   [ballerina.observe]
   tracingEnabled = true
   tracingProvider = "amp"
   ```

   This replaces any other `tracingProvider`, such as `idetraceprovider`; tell the user the IDE
   trace view stops receiving this agent's traces.
4. The user registers the agent in Agent Manager, which issues an OTEL endpoint and an API key.
   They go in as `BAL_CONFIG_VAR_BALLERINAX_AMP_OTELENDPOINT` and
   `BAL_CONFIG_VAR_BALLERINAX_AMP_APIKEY` environment variables, never in committed files.

- Use the endpoint exactly as Agent Manager shows it (it ends at `/otel`); the module appends the
  traces path itself.
- Re-creating the agent issues a new API key; the old one stops working.
- None of the platform-hosted rules below apply. A durable agent can use any workflow server it
  reaches.

## Platform-hosted agents

### Entry point

A chat agent becomes a Chat Agent: replace the `ai:Listener` trigger with this exact contract
(`POST /chat` on port 8000). It shows in the diagram as an HTTP service.

```ballerina
type ChatRequest record {
    string session_id;
    string message;
};

type ChatResponse record {|
    string response;
|};

service / on new http:Listener(8000) {
    resource function post chat(@http:Payload ChatRequest request) returns ChatResponse|error {
        string reply = check <agent>Agent.run(request.message, request.session_id);
        return {response: reply};
    }
}
```

Keep `ChatRequest` open; the platform also sends `context`. Any other agent becomes a Custom API
Agent: keep its HTTP service, and the user registers the port, base path and an OpenAPI file.

### Rules

- Pin `distribution = "<version>"` in `Ballerina.toml` and commit `Dependencies.toml`.
- Add `import ballerinax/amp as _;`. The platform injects `BAL_CONFIG_VAR_BALLERINAX_AMP_*` for
  tracing, and a `BAL_CONFIG_VAR_*` variable that nothing reads stops the program at startup.
- Configuration arrives only as `BAL_CONFIG_VAR_<NAME>` environment variables (`openAiApiKey` →
  `BAL_CONFIG_VAR_OPENAIAPIKEY`), and only for simple-typed configurables. So
  `ai:getDefaultModelProvider()` cannot be hosted; use a named provider with a
  `configurable string` key.
- Repository files are not in the container. Load knowledge-base content from a URL, an external
  vector store, or a file mount the user adds.
- In-memory stores reset on every redeploy and differ between replicas; use persistent stores for
  anything that must survive.
- Outbound calls reach only public hosts on ports 80 and 443, and the platform gateway. Databases,
  private hosts and workflow servers are blocked by default; tell the user when the agent needs one.
- The gateway times out a request after 30 seconds.

### Durable agents

- Use workflow mode `SELF_HOSTED` or `CLOUD`; `IN_MEMORY` loses every run on each redeploy.
- Agent Manager runs no workflow server and blocks port 7233. Tell the user the server must answer
  on port 443 at a public address, or the platform admin must allow the egress.
- Set the connection through `BAL_CONFIG_VAR_BALLERINA_WORKFLOW_MODE`, `..._URL`, `..._NAMESPACE`,
  `..._TASKQUEUE`, and `..._AUTHAPIKEY` as a secret. Certificate files go in as file mounts.
- Serve task completion from the agent's own service; the management API's separate port is not
  routed.
- Behind the Chat Agent contract, persist each `session_id` → instance ID mapping.
