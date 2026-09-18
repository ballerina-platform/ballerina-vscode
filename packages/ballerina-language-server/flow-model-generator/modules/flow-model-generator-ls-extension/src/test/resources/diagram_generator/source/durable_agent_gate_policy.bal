import ballerina/ai;
import ballerina/http;
import ballerina/workflow;

final ai:Wso2ModelProvider payModel = check new ("http://localhost:9099", "test-token");

final http:Client payApi = check new ("http://localhost:9090");

# The refund review's inbox summary, named rather than written inline
final string refundTitle = "Approve the refund";

# Charge the card activity
@workflow:Activity
function chargeCard(http:Client api, string orderId) returns json|error {
    return api->post("/charges/" + orderId, {});
}

# Refund an order
@ai:AgentTool
isolated function refund(string orderId) returns string {
    return "refunded " + orderId;
}

final workflow:DurableAgent paymentAgent = check new ({
    systemPrompt: {role: "Payments", instructions: "Charge and refund orders."},
    model: payModel,
    activities: [
        {activity: chargeCard, description: "Charges the card", approvalPolicy: {userRoles: ["manager"], users: "alice", title: "Approve the charge", timeout: {hours: 4}}, bindings: {api: payApi}}
    ],
    tools: [
        {tool: refund, approvalPolicy: {userRoles: "finance", excludedUsers: ["bob"], title: refundTitle, description: "Approve the refund"}}
    ]
});

function drivePaymentAgent() returns error? {
    string instanceId = check paymentAgent.run(query = "Charge order 42");
}
