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
import {
    buildApprovalToolData,
    buildRequiresApprovalField,
    collectLocalFunctionNames,
    createRequiresApprovalField,
} from "./formUtils";

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

// L1 / U05: the rest of the approval control. buildApprovalToolData above turns the SUBMITTED
// form into generator data; these three build the control the user submits and the candidate
// list it offers, which is where "approval functions are represented correctly" is decided.

/** The approval-function picker lives in the field's first ("On") choice. */
const picker = (field: any) => field.choices?.[0]?.properties?.approvalFunction;

describe("createRequiresApprovalField", () => {
    it("starts unchecked with an empty picker when the tool has no gate", () => {
        const field = createRequiresApprovalField();

        expect(field.value).toBe(false);
        expect(picker(field).value).toBe("");
    });

    it("starts checked and prefilled when editing a tool that already has one", () => {
        const field = createRequiresApprovalField({ functionName: "isHighValue" });

        expect(field.value).toBe(true);
        expect(picker(field).value).toBe("isHighValue");
    });

    // Create flows may name a function that does not exist yet, because the generator scaffolds
    // it. Edit flows rewrite source directly and never reach the generator, so a new name there
    // would leave the annotation pointing at nothing.
    it.each([
        ["create flows accept a free-typed name", true],
        ["edit flows restrict the picker to existing functions", false],
    ])("%s", (_label, allowCreate) => {
        const field = createRequiresApprovalField(undefined, allowCreate);

        expect(picker(field).allowItemCreate).toBe(allowCreate);
    });

    // A free-typed name is emitted verbatim into both the annotation and the generated function
    // signature, so anything that is not a legal identifier would produce invalid source.
    it("validates the typed name as an identifier", () => {
        const rules = picker(createRequiresApprovalField()).types[0].validations;

        expect(rules.map((r: any) => r.rule)).toContain("common.validate.identifier");
    });
});

describe("buildRequiresApprovalField", () => {
    it("offers the fetched functions as picker options", () => {
        const field = buildRequiresApprovalField(createRequiresApprovalField(), ["isHighValue", "needsReview"]);

        expect(picker(field).items).toEqual(["isHighValue", "needsReview"]);
    });

    it("keeps the picker, with no options, for a project that simply has none", () => {
        const field = buildRequiresApprovalField(createRequiresApprovalField(), []);

        expect(picker(field).items).toEqual([]);
    });

    // The reason the failed case is null rather than []: buildApprovalToolData treats any name
    // absent from the list as new. Showing a picker over a list that is empty only because the
    // fetch failed would let someone re-pick their existing predicate, have it read as new, and
    // silently regenerate a duplicate. Dropping the picker leaves the plain checkbox instead.
    it("drops the picker entirely when the candidate fetch failed", () => {
        const field = buildRequiresApprovalField(createRequiresApprovalField(), null);

        expect(picker(field)).toBeUndefined();
        expect(field.choices?.[1]?.metadata?.label).toBe("Off");
    });

    it("leaves a field that has no picker alone", () => {
        const bare = { key: "requiresApproval", choices: [{ metadata: { label: "On" }, properties: {} }] } as any;

        expect(buildRequiresApprovalField(bare, ["isHighValue"])).toBe(bare);
    });
});

describe("collectLocalFunctionNames", () => {
    const node = (symbol: string, isAgentTool = false) => ({
        codedata: { symbol },
        metadata: { data: { isAgentTool } },
    });

    it("collects the project's own functions", () => {
        const acc = new Set<string>();

        collectLocalFunctionNames([node("isHighValue"), node("needsReview")] as any, acc);

        expect([...acc]).toEqual(["isHighValue", "needsReview"]);
    });

    // A tool cannot gate itself, and offering one would produce a circular reference.
    it("skips agent tools", () => {
        const acc = new Set<string>();

        collectLocalFunctionNames([node("isHighValue"), node("greet", true)] as any, acc);

        expect([...acc]).toEqual(["isHighValue"]);
    });

    it("descends into the project's own categories", () => {
        const acc = new Set<string>();

        collectLocalFunctionNames(
            [{ metadata: { label: "Project Functions" }, items: [node("isHighValue")] }] as any,
            acc
        );

        expect([...acc]).toEqual(["isHighValue"]);
    });

    // Library and imported functions are not the project's own, so they are not candidates.
    it.each([["Standard Library"], ["Extended Library"], ["Agent Tools"], ["Imported Functions"]])(
        "skips the %s category",
        (label) => {
            const acc = new Set<string>();

            collectLocalFunctionNames([{ metadata: { label }, items: [node("fromElsewhere")] }] as any, acc);

            expect([...acc]).toEqual([]);
        }
    );

    it("ignores entries with no symbol", () => {
        const acc = new Set<string>();

        collectLocalFunctionNames([{ codedata: {} }, null] as any, acc);

        expect([...acc]).toEqual([]);
    });
});
