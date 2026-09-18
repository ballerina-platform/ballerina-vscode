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

/** The value the form and the diagram both use for a capability that is not gated. */
const NO_APPROVAL = "NoApproval";

/** What `NoApproval` is in the module, so a declaration may hold either spelling. */
const NIL = "()";

/** The flag the 0.9 declaration carried, before a policy replaced it. */
const LEGACY_FLAG = "requiresApproval";

/** The field the 0.10 declaration carries: a policy, or the absence of one. */
const POLICY = "approvalPolicy";

/**
 * Whether a declared capability is gated by a review before the agent may run it, from the values
 * the analysis hydrated. The policy is the source the declaration holds, so anything that is not
 * absent and not `NoApproval` gates it — including a reference the form cannot edit.
 *
 * @param values the capability's hydrated values
 * @return true when a review stands in front of it
 */
export function isCapabilityApprovalGated(values: Record<string, unknown> | undefined): boolean {
    if (!values) {
        return false;
    }
    const policy = stripModulePrefix(asText(values[POLICY]));
    if (policy !== "") {
        return policy !== NO_APPROVAL && policy !== NIL;
    }
    // A declaration read by an older analysis, or one not yet migrated: the flag gated it unless it
    // said so itself.
    const legacy = asText(values[LEGACY_FLAG]);
    return legacy !== "" && legacy !== "false";
}

function asText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

// `workflow:NoApproval` names the same constant as `NoApproval`, and the declaration may hold
// either, so the prefix comes off before the comparison, as it does in the analysis. Only a
// qualified name is touched: a record literal carries colons of its own.
const QUALIFIED_NAME = /^[A-Za-z_][\w']*\s*:\s*([A-Za-z_][\w']*)$/;

function stripModulePrefix(value: string): string {
    return QUALIFIED_NAME.exec(value)?.[1] ?? value;
}
