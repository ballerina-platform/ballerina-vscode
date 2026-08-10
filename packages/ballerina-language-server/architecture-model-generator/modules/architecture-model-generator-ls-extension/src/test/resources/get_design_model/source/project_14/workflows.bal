import ballerina/workflow;

@workflow:Workflow
function orderWorkflow(workflow:Context ctx, OrderInput input, OrderEvents events) returns string|error {
    PaymentData payment = check wait events.paymentReceived;
    string shipment = check wait events.shipmentReady;
    return input.orderId + payment.method + shipment;
}
