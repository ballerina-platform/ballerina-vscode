import ballerina/workflow;

public function main() returns error? {
    string workflowId = check workflow:run(orderWorkflow, {orderId: "ORD-1"});
    check sendWrongShipmentEvent(workflowId);
}

// Invalid send through a helper function: the edge must propagate to the automation
function sendWrongShipmentEvent(string workflowId) returns error? {
    check workflow:sendData(orderWorkflow, workflowId, "shipmentDone", "TRK-1");
}
