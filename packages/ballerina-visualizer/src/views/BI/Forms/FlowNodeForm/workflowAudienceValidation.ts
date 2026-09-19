/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * A task that names nobody can be decided by nobody, so the workflow module refuses it and the
 * compiler reports it. The language server refuses it too, but only once the form has been
 * submitted, which is too late: the save is already on its way. These rules run before the submit,
 * so the panel stays open with what the person typed.
 */

/** The audience a review or task names, by the keys the form holds them under. */
interface AudiencePair {
    /** Key of the roles field, where the message is shown. */
    roles: string;
    /** Key of the users field, which satisfies the rule on its own. */
    users: string;
}

const RETRY_REVIEW: AudiencePair = { roles: "retryUserRoles", users: "retryUsers" };
const APPROVAL_REVIEW: AudiencePair = { roles: "approvalUserRoles", users: "approvalUsers" };
const TASK_AUDIENCE: AudiencePair = { roles: "userRoles", users: "users" };

/** Retry policy values that raise a review. */
const REVIEWING_RETRY_POLICIES = ["ManualRetry", "RetryBeforeReview"];
const HUMAN_APPROVAL = "HumanApproval";

/** Node kinds whose own form declares a task, rather than a policy that raises one. */
const TASK_NODES = ["DURABLE_AGENT_HUMAN_TASK", "HUMAN_TASK"];

// Mirrors WorkflowUtil.AUDIENCE_REQUIRED_MESSAGE, so the wording does not change with how far the
// save got before the rule caught it.
const MESSAGE = "Name who may decide this: fill in the roles, the users, or both";

/** A rule failure: the field to show it on, and what to say. */
export interface AudienceValidationError {
    fieldKey: string;
    message: string;
}

function isBlank(value: unknown): boolean {
    if (value === undefined || value === null) {
        return true;
    }
    if (Array.isArray(value)) {
        return value.length === 0;
    }
    const text = String(value).trim();
    return text === "" || text === "()" || text === "[]";
}

function namesNobody(values: Record<string, any>, audience: AudiencePair): boolean {
    return isBlank(values[audience.roles]) && isBlank(values[audience.users]);
}

/**
 * Checks the audiences a form declares, and returns the first one that names nobody.
 *
 * @param values   the form's current values
 * @param nodeKind the node being edited, which decides whether its own fields declare a task
 * @returns the failure, or undefined when every audience in play names someone
 */
export function validateWorkflowAudience(
    values: Record<string, any>,
    nodeKind?: string
): AudienceValidationError | undefined {
    if (REVIEWING_RETRY_POLICIES.includes(String(values.retryPolicy ?? "")) && namesNobody(values, RETRY_REVIEW)) {
        return { fieldKey: RETRY_REVIEW.roles, message: MESSAGE };
    }
    if (String(values.approvalPolicy ?? "") === HUMAN_APPROVAL && namesNobody(values, APPROVAL_REVIEW)) {
        return { fieldKey: APPROVAL_REVIEW.roles, message: MESSAGE };
    }
    if (nodeKind && TASK_NODES.includes(nodeKind) && namesNobody(values, TASK_AUDIENCE)) {
        return { fieldKey: TASK_AUDIENCE.roles, message: MESSAGE };
    }
    return undefined;
}
