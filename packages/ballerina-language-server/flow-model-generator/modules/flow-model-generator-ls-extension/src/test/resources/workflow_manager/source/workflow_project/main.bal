import ballerina/io;
import ballerina/workflow;

type OrderInput record {
    readonly string orderId;
    string customerName;
};

type ApprovalData record {
    boolean approved;
    string approverName;
};

type PaymentData record {
    decimal amount;
    string currency;
};

// Events type for orderWorkflow
type OrderWorkflowEvents record {|
    future<ApprovalData> approve;
    future<PaymentData> paymentReceived;
|};

# Process an order workflow with events
@workflow:Workflow
function orderWorkflow(workflow:Context ctx, OrderInput input, OrderWorkflowEvents events) returns error? {
    io:println("Processing order: " + input.orderId);
    ApprovalData approval = check wait events.approve;
    io:println("Approved by: " + approval.approverName);
}

type SimpleInput record {
    readonly int id;
};

# Simple workflow without events
@workflow:Workflow
function simpleWorkflow(workflow:Context ctx, SimpleInput input) returns error? {
    io:println("Simple workflow: " + input.id.toString());
}

type ShipmentEvents record {|
    future<boolean> dispatched;
|};

# Workflow without an input: the data record is the second parameter
@workflow:Workflow
function shipmentWorkflow(workflow:Context ctx, ShipmentEvents events) returns error? {
    boolean dispatched = check wait events.dispatched;
    io:println("Dispatched: " + dispatched.toString());
}

type PollEvents record {|
    future<PaymentData> answer;
|};

# Workflow with the data record as its only parameter
@workflow:Workflow
function pollWorkflow(PollEvents events) returns error? {
    PaymentData answer = check wait events.answer;
    io:println("Answer: " + answer.currency);
}
