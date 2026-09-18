import ballerina/workflow;

@workflow:Activity
function notifyOptionsEmployee(string claimId, string message) returns string|error {
    return claimId + message;
}

@workflow:Workflow
function optionsFlow(workflow:Context ctx, string claimId) returns error? {
    string _ = check ctx->callActivity(notifyOptionsEmployee,
            {"claimId": claimId, "message": "Please submit the supporting bills."},
            stepId = "notify#1",
            approvalPolicy = {userRoles: "finance", users: "alice", title: "Approve the notice", timeout: {hours: 4}},
            retryPolicy = {maxRetries: 3, retryDelay: 2});
}
