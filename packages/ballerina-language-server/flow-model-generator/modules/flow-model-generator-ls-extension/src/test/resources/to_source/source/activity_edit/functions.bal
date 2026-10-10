import ballerina/workflow;

type OrderInput record {
    string orderId;
};

type NotificationInput record {
    string message;
    string recipient;
};

@workflow:Workflow
function simpleWorkflow() returns error? {
}

@workflow:Workflow
function inputWorkflow(OrderInput input) returns error? {
}

@workflow:Workflow
function contextWorkflow(workflow:Context ctx, OrderInput input) returns error? {
}

# Process an order workflow
# + input - order input data
# + return - error if processing fails
@workflow:Workflow
function documentedWorkflow(OrderInput input) returns error? {
}

@workflow:Activity
function simpleActivity() returns int|error {
    return 0;
}

# Send a notification
# + time - delay in seconds
# + input - notification input data
# + return - status code
@workflow:Activity
function paramActivity(int time, NotificationInput input) returns int|error {
    return 0;
}
