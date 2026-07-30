import ballerina/ai;
import ballerina/workflow;

final ai:Wso2ModelProvider supportModel = check new ("http://localhost:9099", "test-token");

# Customer support durable agentic workflow
final workflow:DurableAgent supportAgent = check new ({
    systemPrompt: {role: "Support triage", instructions: "Help the customer."},
    model: supportModel,
    events: [
        {name: "customerMessage", request: string, response: string},
        {name: "billSubmitted", request: json}
    ]
});

function interactWithAgent() returns error? {

}
