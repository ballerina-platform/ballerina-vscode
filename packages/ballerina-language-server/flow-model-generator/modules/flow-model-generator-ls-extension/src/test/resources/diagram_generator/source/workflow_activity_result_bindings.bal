import ballerina/io;
import ballerina/workflow;

# Workflow with a checked no-result activity call and an unchecked one
#
# + ctx - Workflow context
# + message - Message to log
# + return - An error on failure
@workflow:Workflow
function eventWorkflow(workflow:Context ctx, string message) returns error? {
    // Activity with no return value: a wildcard binding, so no named result variable is declared
    () _ = check ctx->callActivity(logEvent, {message: message});

    // Unchecked call: the error is part of the result value
    int|error count = ctx->callActivity(countEvents, {});
    io:println(count);

    // Unchecked call to an activity with no return value: the error itself is the named result
    error? r = ctx->callActivity(logEvent, {message: message});
    io:println(r);
}

# Activity with no return value
#
# + message - Message to log
# + return - An error on failure
@workflow:Activity
function logEvent(string message) returns error? {
    io:println(message);
}

# Activity returning a count
#
# + return - The event count or an error
@workflow:Activity
function countEvents() returns int|error {
    return 1;
}
