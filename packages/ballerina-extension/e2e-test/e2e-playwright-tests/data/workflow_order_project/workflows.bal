import ballerina/log;
import ballerina/workflow;

@workflow:Workflow
function orderWorkflow(workflow:Context ctx, OrderInfo input, OrderWorkflowData data) returns json|error {
    () _ = check ctx->callActivity(reserveInventory, {orderInfo: input});
    log:printInfo("Waiting for payment");
    boolean payment = check wait data.payment;
}

@workflow:Workflow
function shipmentWorkflow(workflow:Context ctx, OrderInfo input) returns json|error {
    () _ = check ctx->callActivity(reserveInventory, {orderInfo: input});
}

@workflow:Workflow
function fulfilmentWorkflow(workflow:Context ctx, OrderInfo input) returns json|error {
    () _ = check ctx->callActivity(sendConfirmationEmail, {orderInfo: input});
    () _ = check ctx->callActivity(startShipment, {orderInfo: input});
}

@workflow:Workflow
function emailChangeRequest(workflow:Context ctx, EmailChange input) returns json|error {
    boolean valid = check ctx->callActivity(validateEmailChange, {request: input});
    () _ = check ctx->callActivity(performEmailChange, {request: input});
}

@workflow:Workflow
function onboardingWorkflow(workflow:Context ctx, EmployeeDetails input) returns json|error {
}
