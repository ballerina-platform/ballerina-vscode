import ballerina/ai;
import ballerina/workflow;

final ai:Wso2ModelProvider supportModel = check new ("http://localhost:9099", "test-token");

final workflow:DurableAgent supportAgent = check new ({
    systemPrompt: {role: "Support triage", instructions: "Help the customer."},
    model: supportModel
});

@workflow:Workflow
function orderWorkflow(workflow:Context ctx, OrderInput input) returns string|error {
    return input.orderId;
}
