import ballerina/log;
import ballerina/workflow;

type OrderWorkflowData record {|
    future<boolean> payment;
|};

@workflow:Workflow
function orderWorkflow(workflow:Context ctx, OrderWorkflowData data) returns json|error {
    boolean payment = check data.payment;
    return payment;
}

public function main() returns error? {
    do {
        check workflow:sendData(orderWorkflow, "wf-1", "payment", true);
        string workflowId = check workflow:run(orderWorkflow);
        string orderRunId = check workflow:runWithId(orderWorkflow, "order-1");
    } on fail error e {
        log:printError("Error: ", 'error = e);
        return e;
    }
}
