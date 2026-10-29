import ballerina/ai;
import ballerina/workflow;

final ai:Wso2ModelProvider wso2ModelProvider = check new ("http://localhost:9099", "test-token");

type BillDetails record {|
    string id;
    decimal amount;
|};

# Reads a bill: its return type includes error (wso2/product-integrator#2810)
@workflow:Activity
function readBill(string fileUrl) returns BillDetails|error {
    return {id: fileUrl, amount: 0};
}

# Looks up a receipt's id
function fetchReceiptId(string fileUrl) returns string|error {
    return fileUrl.trim();
}

# Reads a receipt: the test adds a call, then Generate right after it (wso2/product-integrator#2810)
@workflow:Activity
function readReceipt(string fileUrl) returns BillDetails|error {
    return {id: fileUrl, amount: 0};
}

# Billing durable agentic workflow, declared without capabilities
final workflow:DurableAgent billingAgent = check new ({
    systemPrompt: {role: "Billing assistant", instructions: "Handle customer bills."},
    model: wso2ModelProvider
});

# Support durable agentic workflow with the 1.0 keyed channels: `chat` answers, `bill` does not
final workflow:DurableAgent supportAgent = check new ({
    systemPrompt: {role: "Support assistant", instructions: "Help the customer."},
    model: wso2ModelProvider,
    events: {
        chat: {request: string, response: string},
        bill: {request: json}
    }
});

# Sends a customer's bill to the support agent
function notifySupport(string workflowId, json payload) returns error? {

}
