import ballerina/workflow;

type OrderInput record {
    string orderId;
};

@workflow:Workflow
function orderWorkflow(workflow:Context ctx, OrderInput input) returns error? {
}

public function main() returns error? {
    string id = check workflow:runWithId(orderWorkflow, "order-1", {orderId: "1"});
}
