// Test file for workflow artifacts

import ballerina/workflow;
import ballerina/ai;
import ballerina/io;

final ai:Wso2ModelProvider supportModel = check new ("http://localhost:9099", "test-token");

type OrderInput record {
    readonly string orderId;
    string customerName;
};

type ApprovalData record {
    boolean approved;
    string approverName;
};

type OrderWorkflowEvents record {|
    future<ApprovalData> approve;
|};

# Process an order workflow with events
@workflow:Workflow
function orderWorkflow(workflow:Context ctx, OrderInput input, OrderWorkflowEvents events) returns error? {
    io:println("Processing order: " + input.orderId);
    ApprovalData approval = check wait events.approve;
    io:println("Approved by: " + approval.approverName);
}

# Simple workflow without events
@workflow:Workflow
function simpleWorkflow(workflow:Context ctx, string taskId) returns string|error {
    io:println("Processing task: " + taskId);
    return "completed";
}

# Send notification activity
@workflow:Activity
function sendNotification(string message) returns boolean|error {
    io:println("Sending notification: " + message);
    return true;
}

# Calculate discount activity
@workflow:Activity
function calculateDiscount(decimal amount) returns decimal|error {
    return amount * 0.1d;
}

// Regular function (should not be categorized under Workflows)
function helperFunction() returns string {
    return "helper";
}

# Customer support durable agentic workflow
final workflow:DurableAgent supportAgent = check new ({
    systemPrompt: {role: "Support triage", instructions: "Help the customer."},
    model: supportModel,
    activities: [sendNotification]
});
