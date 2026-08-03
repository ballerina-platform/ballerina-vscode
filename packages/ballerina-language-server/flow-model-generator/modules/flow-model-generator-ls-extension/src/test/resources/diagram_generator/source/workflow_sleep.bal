import ballerina/workflow;
import ballerina/io;

type OrderInput record {
    readonly string orderId;
    string customerName;
};

# Workflow that pauses for a fixed duration
@workflow:Workflow
function sleepWorkflow(workflow:Context ctx, OrderInput input) returns error? {
    // Sleep - should be SLEEP
    check ctx.sleep({seconds: 5});
    io:println("Resumed after sleep");
}

public function main() returns error? {
    string workflowId = check workflow:run(sleepWorkflow, {orderId: "123", customerName: "John"});
    io:println("Workflow started with ID: " + workflowId);
}
