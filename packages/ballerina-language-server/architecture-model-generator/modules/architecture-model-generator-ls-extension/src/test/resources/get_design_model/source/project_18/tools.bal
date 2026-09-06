import ballerina/ai;
import ballerina/http;

final http:Client billingClient = check new ("http://localhost:9090");

// Agent-as-tool: delegates to specialistAgent -- exercises Connection.delegatesTo.
@ai:AgentTool
isolated function delegateToSpecialist(string query) returns string {
    string|error result = specialistAgent.run(query);
    if result is error {
        return result.message();
    }
    return result;
}

// Uses an http:Client -- exercises Connection.toolConnections.
@ai:AgentTool
isolated function callHttpTool(string path) returns string {
    string|error result = billingClient->get(path);
    if result is error {
        return result.message();
    }
    return result;
}
