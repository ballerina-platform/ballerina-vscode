import ballerina/workflow;

@workflow:Activity
function chargeCard(string id) returns int|error => 1;

// A literal that matches no member of `workflow:RetryPolicy`: `AutoRetry` is closed, and the
// review shapes require an audience. The compiler cannot name a member for it.
@workflow:Workflow
function invalidPolicyWorkflow(workflow:Context ctx, string id) returns error? {
    int a = check ctx->callActivity(chargeCard, {id}, retryPolicy = {budget: 5});
}
