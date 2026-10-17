import ballerina/ai;
import ballerina/workflow;

final ai:Wso2ModelProvider keyedModel = check new ("http://localhost:9099", "test-token");

# Agent declared in the 1.0 keyed form: `chat` declares a response, `bill` does not.
final workflow:DurableAgent keyedAgent = check new ({
    systemPrompt: {role: "Support", instructions: "Help."},
    model: keyedModel,
    events: {
        chat: {request: string, response: string},
        bill: {request: json}
    },
    humanTasks: {
        approve: {userRoles: "MANAGER"}
    }
});

function sendToKeyedAgent(string instanceId) returns error? {

}
