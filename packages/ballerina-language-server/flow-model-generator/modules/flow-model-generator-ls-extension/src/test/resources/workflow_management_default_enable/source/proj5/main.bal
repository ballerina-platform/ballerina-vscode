import ballerina/workflow;
import ballerinax/wso2.controlplane as _;

type OrderInput record {
    readonly string orderId;
};

@workflow:Workflow
function orderWorkflow(workflow:Context ctx, OrderInput input) returns json|error {
    return {};
}

public function main() {
}
