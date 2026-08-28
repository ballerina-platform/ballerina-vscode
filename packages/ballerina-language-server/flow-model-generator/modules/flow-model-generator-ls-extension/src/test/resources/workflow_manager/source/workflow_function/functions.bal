import ballerina/workflow;
import ballerina/io;

type OrderInput record {
    readonly string orderId;
    string customerName;
};

type NotificationInput record {
    string message;
    string recipient;
};

# Process an order workflow
@workflow:Workflow
function orderWorkflow(workflow:Context ctx, OrderInput input) returns error? {
    io:println("Processing order: " + input.orderId);
}

# Send notification activity
@workflow:Activity
function sendNotification(int time, NotificationInput input) returns int|error {
    io:println("Sending notification: " + input.message);
    return 1;
}

# Simple activity with no parameters
@workflow:Activity
function myActivity() returns int {
    io:println("hello from activity");
    return 5;
}

public function main() {
    io:println("Workflow function project");
}

# Activity with no return value
@workflow:Activity
function logEvent(string message) returns error? {
    io:println(message);
}
