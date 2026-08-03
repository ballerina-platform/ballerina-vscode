import ballerina/workflow;
import ballerina/workflow.management as _;
import ballerinax/wso2.controlplane as _;

type OrderInput record {
    readonly string orderId;
};

@workflow:Workflow
function orderWorkflow(workflow:Context ctx, OrderInput input) returns error? {
}

public function main() {
}
