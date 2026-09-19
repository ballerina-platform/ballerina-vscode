import ballerina/ai;
import ballerina/workflow;

final ai:Wso2ModelProvider claimModel = check new ("http://localhost:9099", "test-token");

# What the agent hands a reviewer
type ClaimReview record {|
    string claimId;
    decimal amount;
|};

# What a reviewer submits back
type ApprovalResult record {|
    boolean approved;
    string comment?;
|};

# What a run of the agent produces
type ClaimDecision record {|
    string claimId;
    string status;
|};

final workflow:DurableAgent claimAgent = check new ({
    systemPrompt: {role: "Claims desk", instructions: "Decide expense claims."},
    model: claimModel,
    inputType: json,
    resultType: ClaimDecision,
    humanTasks: {
        approveClaim: {
            userRoles: "finance",
            taskInputType: ClaimReview,
            resultType: ApprovalResult,
            title: "Approve the claim"
        }
    }
});

function driveClaimAgent() returns error? {
    string instanceId = check claimAgent.run("Decide claim 42");
}

@workflow:Workflow
function auditClaim(workflow:Context ctx, string claimId) returns error? {
}

@workflow:Workflow
function reconcileClaims(workflow:Context ctx, string claimId) returns error? {
    check ctx.sleep({seconds: 5}, stepId = "cool-off#1");
    string auditId = check ctx->runChildWorkflow(auditClaim, claimId, stepId = "audit#1");
}
