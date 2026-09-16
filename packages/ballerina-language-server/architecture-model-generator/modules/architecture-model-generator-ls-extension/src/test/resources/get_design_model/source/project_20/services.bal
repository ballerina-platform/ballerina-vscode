import ballerina/http;

public type ChatMessage record {|
    string message;
|};

service /agent on new http:Listener(8080) {
    resource function post conversations(@http:Payload string username) returns string|error {
        return claimAgent.run(string `user=${username}`);
    }

    resource function post conversations/[string id]/messages(ChatMessage m) returns string|error {
        string token = check claimAgent.sendData(id, "chat", m.message);
        return claimAgent.waitForDataResult(id, token);
    }

    resource function post cases/[string caseId]/submit(@http:Payload string conversationId) returns string|error {
        return claimAgent.sendData(conversationId, "chat", string `[case-submitted] ${caseId}`);
    }

    resource function get conversations/[string id]/state() returns string|error {
        return claimAgent.getResult(id);
    }
}
