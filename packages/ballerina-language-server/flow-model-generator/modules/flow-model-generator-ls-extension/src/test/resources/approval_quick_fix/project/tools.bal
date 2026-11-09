import ballerina/ai;

@ai:AgentTool {
    requiresApproval: searchApproval
}
isolated function search(string query, int 'limit = 10) returns string => query;

@ai:AgentTool {
    requiresApproval: sharedApproval
}
isolated function refundTool(string orderId, string reason) returns string => orderId;

@ai:AgentTool {
    requiresApproval: sharedApproval
}
isolated function cancelTool(string orderId) returns string => orderId;
