import ballerina/workflow;

type OrderInput record {
    string orderId;
};

@workflow:Workflow
function orderWorkflow(workflow:Context ctx, OrderInput input) returns error? {
}

public function main() {
    string|error id = workflow:runWithId(orderWorkflow, "order-1", {orderId: "1"});
}
