import ballerina/workflow;

type ClaimInput record {|
    string claimId;
|};

type ClaimEvents record {|
    future<boolean> reviewed;
|};

@workflow:Workflow
function auditClaim(workflow:Context ctx, ClaimInput input, ClaimEvents events) returns string|error {
    boolean reviewed = check wait events.reviewed;
    return input.claimId;
}

@workflow:Workflow
function settleClaim(workflow:Context ctx) returns int|error {
    return 1;
}

// Every child workflow operation, so the re-read forms can be compared with their templates.
@workflow:Workflow
function processClaim(workflow:Context ctx, ClaimInput input) returns error? {
    string auditId = check ctx->runChildWorkflow(auditClaim, input);
    check ctx->sendDataToChildWorkflow(auditId, "reviewed", true);
    string audited = check ctx->waitForChildWorkflow(auditId);
    int settled = check ctx->callWorkflow(settleClaim);
}

public function main() returns error? {
    string id = check workflow:run(auditClaim, {claimId: "42"});
    check workflow:sendData(auditClaim, id, "reviewed", true);
}
