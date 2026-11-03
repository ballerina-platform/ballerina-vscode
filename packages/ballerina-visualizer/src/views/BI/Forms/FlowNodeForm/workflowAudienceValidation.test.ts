// The workflow module refuses a task that names nobody, and so does source generation — but only
// after the form has submitted. These pin the rule that runs first, inside the panel.

import { validateWorkflowAudience } from "./workflowAudienceValidation";

describe("validateWorkflowAudience", () => {
    it("passes a form with no policy in play", () => {
        expect(validateWorkflowAudience({ retryPolicy: "NoRetry", approvalPolicy: "NoApproval" })).toBeUndefined();
    });

    it("passes Auto Retry, which raises no review", () => {
        expect(validateWorkflowAudience({ retryPolicy: "AutoRetry", maxRetries: "3" })).toBeUndefined();
    });

    it.each(["ManualRetry", "RetryBeforeReview"])("refuses %s with no reviewer", (retryPolicy) => {
        const failure = validateWorkflowAudience({ retryPolicy });
        expect(failure?.fieldKey).toBe("retryUserRoles");
        expect(failure?.message).toMatch(/roles, the users, or both/);
    });

    it("accepts a review scoped to users alone, which the module writes as nil roles", () => {
        expect(validateWorkflowAudience({ retryPolicy: "ManualRetry", retryUsers: "alice" })).toBeUndefined();
        expect(validateWorkflowAudience({ retryPolicy: "ManualRetry", retryUserRoles: "ops" })).toBeUndefined();
    });

    it("refuses a human approval with no reviewer, and reports it on the roles field", () => {
        expect(validateWorkflowAudience({ approvalPolicy: "HumanApproval" })?.fieldKey).toBe("approvalUserRoles");
        expect(validateWorkflowAudience({ approvalPolicy: "HumanApproval", approvalUsers: "bob" })).toBeUndefined();
    });

    // A form declaring a task gets the rule from the language server ("Who decides" section, WorkflowUtil.groupAudience), not here.
    it("leaves a task's own audience to the language server", () => {
        expect(validateWorkflowAudience({ userRoles: [], users: [] })).toBeUndefined();
    });

    it("treats the empty shapes a cleared field leaves behind as naming nobody", () => {
        const emptyValues: unknown[] = ["", "   ", "()", "( )", " ( ) ", "[]", [], null, undefined];
        for (const empty of emptyValues) {
            expect(validateWorkflowAudience({ retryPolicy: "ManualRetry", retryUserRoles: empty })).toBeDefined();
        }
    });

    it("reports the retry review first when both policies name nobody", () => {
        const failure = validateWorkflowAudience({ retryPolicy: "ManualRetry", approvalPolicy: "HumanApproval" });
        expect(failure?.fieldKey).toBe("retryUserRoles");
    });
});
