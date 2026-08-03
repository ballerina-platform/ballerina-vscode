import ballerina/workflow;

@workflow:Workflow
function orderWorkflow(workflow:Context ctx, OrderInput input, OrderEvents events) returns string|error {
    string reservation = check ctx->callActivity(reserveInventory, {"input": input});
    PaymentData payment = check wait events.paymentReceived;
    boolean approved = check ctx->awaitHumanTask("approveOrder", "MANAGER", payload = {"orderId": input.orderId});
    ShipmentData shipment = check wait events.shipmentReady;
    string note = check ctx->callActivity(notifyCustomer, {"orderId": input.orderId});
    string status = check ctx->callActivity(fetchStatus, {"apiClient": inventoryClient, "orderId": input.orderId});
    return input.orderId + reservation + payment.method + approved.toString() + shipment.trackingId + note + status;
}

@workflow:Workflow
function simpleWorkflow(workflow:Context ctx, OrderInput input) returns string|error {
    return input.orderId;
}
