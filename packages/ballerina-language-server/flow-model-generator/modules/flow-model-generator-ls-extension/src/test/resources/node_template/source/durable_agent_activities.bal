import ballerina/ai;
import ballerina/http;
import ballerina/workflow;

final ai:Wso2ModelProvider triageModel = check new ("http://localhost:9099", "test-token");

final http:Client billingApi = check new ("http://localhost:9090");

# Look up a bill activity
@workflow:Activity
function lookupBill(http:Client api, string billId) returns json|error {
    return api->get("/bills/" + billId);
}

# Record a payment activity
@workflow:Activity
function recordPayment(string billId, decimal amount) returns string|error {
    return "paid: " + billId + " " + amount.toString();
}

# Billing durable agentic workflow
final workflow:DurableAgent billingAgent = check new ({
    systemPrompt: {role: "Billing assistant", instructions: "Handle customer bills."},
    model: triageModel
});

function interactWithBillingAgent() returns error? {

}

# Search the billing knowledge base
@ai:AgentTool
isolated function searchBillingDocs(string query) returns string|error {
    return "results for " + query;
}
