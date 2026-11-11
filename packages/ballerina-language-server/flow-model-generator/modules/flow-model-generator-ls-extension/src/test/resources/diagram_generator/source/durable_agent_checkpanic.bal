import ballerina/ai;
import ballerina/workflow;

final ai:Wso2ModelProvider inboxModel = check new ("http://localhost:9099", "test-token");

final workflow:DurableAgent inboxAgent = check new ({
    systemPrompt: {role: "Inbox", instructions: "Route mail."},
    model: inboxModel,
    events: {
        mail: {request: json}
    }
});

function notifyInbox(string instanceId) {
    _ = checkpanic inboxAgent.sendData(instanceId, "mail", {subject: "hello"});
    string runId = checkpanic inboxAgent.run("Route the inbox");
}
