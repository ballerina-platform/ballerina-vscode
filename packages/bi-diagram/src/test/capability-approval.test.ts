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

// The shield on a capability is keyed on what the declaration says, and 0.10 says it with a policy
// where 0.9 carried a flag. The badge kept reading the flag, so a gated capability showed none.

import { isCapabilityApprovalGated } from "../components/nodes/DurableAgentRunNode/capabilityApproval";

describe("isCapabilityApprovalGated", () => {
    it("gates on a human approval policy", () => {
        expect(isCapabilityApprovalGated({ approvalPolicy: "HumanApproval" })).toBe(true);
    });

    it("does not gate on no approval, which is what an ungated capability carries", () => {
        expect(isCapabilityApprovalGated({ approvalPolicy: "NoApproval" })).toBe(false);
    });

    it("does not gate on the nil the constant actually is", () => {
        // `public const NoApproval = ();` in the module, so a declaration may hold either spelling.
        expect(isCapabilityApprovalGated({ approvalPolicy: "()" })).toBe(false);
    });

    it("does not gate on the constant written with its module prefix", () => {
        expect(isCapabilityApprovalGated({ approvalPolicy: "workflow:NoApproval" })).toBe(false);
    });

    it("gates on a record literal, whose own colons are not a module prefix", () => {
        expect(isCapabilityApprovalGated({ approvalPolicy: '{userRoles: ["finance"]}' })).toBe(true);
    });

    it("gates on a policy the form cannot edit, such as a reference", () => {
        expect(isCapabilityApprovalGated({ approvalPolicy: "sharedPolicy" })).toBe(true);
    });

    it("reads the 0.9 flag when no policy is present", () => {
        expect(isCapabilityApprovalGated({ requiresApproval: "true" })).toBe(true);
        expect(isCapabilityApprovalGated({ requiresApproval: "false" })).toBe(false);
    });

    it("prefers the policy over a flag left beside it", () => {
        expect(isCapabilityApprovalGated({ approvalPolicy: "NoApproval", requiresApproval: "true" })).toBe(false);
    });

    it("does not gate a capability that declares neither", () => {
        expect(isCapabilityApprovalGated({})).toBe(false);
        expect(isCapabilityApprovalGated(undefined)).toBe(false);
        expect(isCapabilityApprovalGated({ approvalPolicy: "   " })).toBe(false);
    });
});
