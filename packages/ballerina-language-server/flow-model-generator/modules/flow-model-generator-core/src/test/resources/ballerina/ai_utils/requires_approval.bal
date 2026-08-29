import ballerina/ai;

@ai:AgentTool
isolated function bareTool(string input) returns string {
    return input;
}

@ai:AgentTool {
    requiresApproval: false
}
isolated function notGatedTool(string input) returns string {
    return input;
}

@ai:AgentTool {
    requiresApproval: true
}
isolated function gatedTool(string input) returns string {
    return input;
}

isolated function alwaysApprove(json toolInput) returns boolean {
    return true;
}

@ai:AgentTool {
    requiresApproval: alwaysApprove
}
isolated function predicateGatedTool(string input) returns string {
    return input;
}
