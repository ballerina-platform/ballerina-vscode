import ballerina/ai;

isolated class MailTools {
    @ai:AgentTool {
        requiresApproval: sendApproval
    }
    isolated function send(string to) returns string {
        return to;
    }
}
