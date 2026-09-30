import ballerina/workflow;

final readonly & workflow:AutoRetry STANDARD_RETRY = {maxRetries: 4, retryDelay: 2.0};

@workflow:Activity
function chargeCard(string id) returns int|error => 1;

@workflow:Workflow
function policyWorkflow(workflow:Context ctx, string id) returns error? {
    int a = check ctx->callActivity(chargeCard, {id}, retryPolicy = {maxRetries: 3});
    int b = check ctx->callActivity(chargeCard, {id}, retryPolicy = {userRoles: "ops"});
    int c = check ctx->callActivity(chargeCard, {id}, retryPolicy = {maxRetries: 2, userRoles: "ops"});
    int d = check ctx->callActivity(chargeCard, {id}, retryPolicy = STANDARD_RETRY);
    int e = check ctx->callActivity(chargeCard, {id}, retryPolicy = {});
}
