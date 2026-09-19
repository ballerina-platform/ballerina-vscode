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

    it("refuses a declared task that names nobody, by node kind", () => {
        expect(validateWorkflowAudience({}, "DURABLE_AGENT_HUMAN_TASK")?.fieldKey).toBe("userRoles");
        expect(validateWorkflowAudience({ users: "alice" }, "DURABLE_AGENT_HUMAN_TASK")).toBeUndefined();
        // A node that declares no task is not subject to the rule.
        expect(validateWorkflowAudience({}, "ACTIVITY_CALL")).toBeUndefined();
    });

    it("treats the empty shapes a cleared field leaves behind as naming nobody", () => {
        const emptyValues: unknown[] = ["", "   ", "()", "[]", [], null, undefined];
        for (const empty of emptyValues) {
            expect(validateWorkflowAudience({ retryPolicy: "ManualRetry", retryUserRoles: empty })).toBeDefined();
        }
    });

    it("reports the retry review first when both policies name nobody", () => {
        const failure = validateWorkflowAudience({ retryPolicy: "ManualRetry", approvalPolicy: "HumanApproval" });
        expect(failure?.fieldKey).toBe("retryUserRoles");
    });
});
