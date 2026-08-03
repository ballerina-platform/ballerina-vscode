import ballerina/workflow;

type OrderInput record {
    readonly string orderId;
};

@workflow:Workflow
function orderWorkflow(workflow:Context ctx, OrderInput input) returns error? {
}

public function main() {
}
