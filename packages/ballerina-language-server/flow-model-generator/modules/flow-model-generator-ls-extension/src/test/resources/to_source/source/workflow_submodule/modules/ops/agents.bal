import ballerina/ai;
import ballerina/workflow;

final ai:Wso2ModelProvider opsModel = check new ("http://localhost:9099", "test-token");

// The agent is declared in a NON-default module, and so is every send node generated beside it.
// `opsMessage` declares a response; `opsNotice` does not.
final workflow:DurableAgent opsAgent = check new ({
    systemPrompt: {role: "Ops assistant", instructions: "Handle ops requests."},
    model: opsModel,
    events: [
        {name: "opsMessage", request: string, response: string},
        {name: "opsNotice", request: json}
    ]
});
