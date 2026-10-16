import ballerina/log;
import ballerina/workflow;

@workflow:Activity
function reserveInventory(OrderInfo orderInfo) {
    log:printInfo("Inventory reserved");
}

@workflow:Activity
function sendConfirmationEmail(OrderInfo orderInfo) returns error? {
    log:printInfo(string `Confirmation sent to ${orderInfo.customerEmail}`);
}

@workflow:Activity
function notifyFailedEmail(OrderInfo orderInfo) {
    log:printInfo("Email failed");
}

@workflow:Activity
function startShipment(OrderInfo orderInfo) {
    log:printInfo("Shipment started");
}

@workflow:Activity
function validateEmailChange(EmailChange request) returns boolean {
    return request.newEmail.includes("@");
}

@workflow:Activity
function performEmailChange(EmailChange request) {
    log:printInfo("Email changed");
}
