import ballerina/ai;
import ballerina/http;

final http:Client statusApi = check new ("http://localhost:9302");

// tool -> helper -> helper -> agent.run(...)
@ai:AgentTool
isolated function screenApplications() returns string|error {
    return runScreening();
}

// tool -> helper -> agent.run(...), with the agent call inside a retry loop and do/on fail
@ai:AgentTool
isolated function buildShortlist(string jobId) returns string|error {
    return runShortlistAgent(jobId);
}

// tool -> helper -> `start` helper -> agent.run(...)
@ai:AgentTool
isolated function scheduleInterviews() returns string|error {
    check runScheduling();
    return "scheduled";
}

// tool -> helper -> the owning agent: must not draw a self-edge
@ai:AgentTool
isolated function summarise(string text) returns string|error {
    return askOrchestrator(text);
}

// tool -> helper -> http:Client: a tool connection reached through a helper
@ai:AgentTool
isolated function fetchStatus() returns string|error {
    return readStatus();
}

// Screening agent tool: uses screeningStore directly
@ai:AgentTool
isolated function readApplication(string id) returns string|error {
    return screeningStore->get("/applications/" + id);
}
