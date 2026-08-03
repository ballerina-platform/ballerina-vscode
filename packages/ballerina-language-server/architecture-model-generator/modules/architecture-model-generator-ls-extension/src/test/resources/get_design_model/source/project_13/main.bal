import ballerina/workflow;

public function main() returns error? {
    string workflowId = check workflow:run(orderWorkflow, {orderId: "o-1", quantity: 1});
    check sendShipment(workflowId);
}

function sendShipment(string workflowId) returns error? {
    check workflow:sendData(orderWorkflow, workflowId, "shipmentReady", {trackingId: "t-1"});
}
