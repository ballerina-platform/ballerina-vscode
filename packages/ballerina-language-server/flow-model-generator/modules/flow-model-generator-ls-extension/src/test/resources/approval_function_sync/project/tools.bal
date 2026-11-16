import ballerina/ai;

@ai:AgentTool {
    requiresApproval: sendEmailApproval
}
isolated function sendEmailTool(string to, string subject) returns string => to;

@ai:AgentTool {
    requiresApproval: sharedApproval
}
isolated function refundTool(string orderId) returns string => orderId;

@ai:AgentTool {
    requiresApproval: sharedApproval
}
isolated function cancelTool(string orderId) returns string => orderId;
