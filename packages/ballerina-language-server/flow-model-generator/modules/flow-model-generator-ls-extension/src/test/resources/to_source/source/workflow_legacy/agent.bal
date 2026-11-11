import ballerina/ai;
import ballerina/workflow;

final ai:Wso2ModelProvider legacyModel = check new ("http://localhost:9099", "test-token");

# An agent on a workflow release before 0.9: its capabilities are lists of named records.
final workflow:DurableAgent legacyAgent = check new ({
    systemPrompt: {role: "Support", instructions: "Help."},
    model: legacyModel,
    events: [
        {name: "chat", request: string, response: string}
    ]
});
