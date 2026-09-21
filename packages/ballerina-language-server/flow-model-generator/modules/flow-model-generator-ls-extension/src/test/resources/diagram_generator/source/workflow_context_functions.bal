import ballerina/time;
import ballerina/workflow;

const REVIEW_TASK = "approveClaim";

# Workflow that reads every context utility function
@workflow:Workflow
function claimWorkflow(workflow:Context ctx) returns error? {
    time:Utc now = ctx.currentTime();
    boolean replaying = ctx.isReplaying();
    string workflowId = check ctx.getWorkflowId();
    string workflowType = check ctx.getWorkflowType();
    workflow:HumanTaskCompletion? completion = ctx.lastHumanTaskCompletion();
    workflow:ReviewDecisionRecord? decision = ctx.lastReviewDecision("review\ttwo");
    workflow:ReviewDecisionRecord? secondLook = ();
    secondLook = ctx.lastReviewDecision(REVIEW_TASK);
    _ = ctx.isReplaying();
}
