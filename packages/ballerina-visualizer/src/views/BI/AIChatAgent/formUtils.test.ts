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

// @wso2/ballerina-core's barrel re-exports WSConnection, which requires vscode-ws-jsonrpc — an
// ESM-only package jest can't load without extra transform config. formUtils only uses the pure
// getPrimaryInputType from it at runtime, so we stub that (matching src/utils/bi.test.ts).
jest.mock("@wso2/ballerina-core", () => ({
    getPrimaryInputType: (types: any[]) => types?.[0],
}));

import { FormValues } from "@wso2/ballerina-side-panel";
import { buildApprovalToolData } from "./formUtils";

// The picker's existing-function candidate list. A typed approval-function name present here is an
// existing predicate (referenced as-is); one absent from it is new (drives generateApprovalFunction).
const EXISTING_FUNCTIONS = ["isHighValue", "needsReview"];

describe("buildApprovalToolData", () => {
    it("returns nothing when the gate is unchecked", () => {
        // Even a stale function name left in the sub-field must be ignored while the box is off,
        // since the checkbox is the gate (CheckBoxConditionalEditor keeps the sub-field on uncheck).
        const data: FormValues = { requiresApproval: false, approvalFunction: "isHighValue" };
        expect(buildApprovalToolData(data, EXISTING_FUNCTIONS)).toEqual({});
    });

    it("emits unconditional approval when checked with no function picked", () => {
        const data: FormValues = { requiresApproval: true, approvalFunction: "" };
        expect(buildApprovalToolData(data, EXISTING_FUNCTIONS)).toEqual({ requiresApproval: "true" });
    });

    it("references an existing function without requesting generation", () => {
        const data: FormValues = { requiresApproval: true, approvalFunction: "isHighValue" };
        expect(buildApprovalToolData(data, EXISTING_FUNCTIONS)).toEqual({ requiresApproval: "isHighValue" });
    });

    it("requests scaffolding for a new (free-typed) function name", () => {
        const data: FormValues = { requiresApproval: true, approvalFunction: "brandNewPredicate" };
        expect(buildApprovalToolData(data, EXISTING_FUNCTIONS)).toEqual({
            requiresApproval: "brandNewPredicate",
            generateApprovalFunction: "true",
        });
    });

    it("treats the string 'true' checkbox value the same as boolean true", () => {
        // Form state can carry the checkbox as the string "true" depending on the field's origin.
        const data: FormValues = { requiresApproval: "true", approvalFunction: "" };
        expect(buildApprovalToolData(data, EXISTING_FUNCTIONS)).toEqual({ requiresApproval: "true" });
    });

    it("trims surrounding whitespace and matches candidates on the trimmed name", () => {
        const data: FormValues = { requiresApproval: true, approvalFunction: "  isHighValue  " };
        expect(buildApprovalToolData(data, EXISTING_FUNCTIONS)).toEqual({ requiresApproval: "isHighValue" });
    });

    it("falls back to unconditional when the picked value is not a string", () => {
        const data: FormValues = { requiresApproval: true, approvalFunction: undefined };
        expect(buildApprovalToolData(data, EXISTING_FUNCTIONS)).toEqual({ requiresApproval: "true" });
    });

    it("treats every name as new when the candidate list is empty", () => {
        const data: FormValues = { requiresApproval: true, approvalFunction: "isHighValue" };
        expect(buildApprovalToolData(data, [])).toEqual({
            requiresApproval: "isHighValue",
            generateApprovalFunction: "true",
        });
    });
});
