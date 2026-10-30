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
    createRequiresApprovalField,
    defaultApprovalFunctionName,
    existingApprovalConfig,
    readToolParameters,
} from "./formUtils";

describe("buildApprovalToolData", () => {
    it("returns nothing when the gate is unchecked", () => {
        // A function added before the box was unchecked must not leak into the tool.
        const data: FormValues = { requiresApproval: false, approvalFunction: "isHighValue", generateApprovalFunction: true };
        expect(buildApprovalToolData(data)).toEqual({});
    });

    it("emits unconditional approval when checked with no function", () => {
        const data: FormValues = { requiresApproval: true, approvalFunction: "" };
        expect(buildApprovalToolData(data)).toEqual({ requiresApproval: "true" });
    });

    it("references an attached function without requesting generation", () => {
        const data: FormValues = { requiresApproval: true, approvalFunction: "isHighValue", generateApprovalFunction: false };
        expect(buildApprovalToolData(data)).toEqual({ requiresApproval: "isHighValue" });
    });

    it("requests generation for a function added in the form", () => {
        const data: FormValues = { requiresApproval: true, approvalFunction: "sendEmailApproval", generateApprovalFunction: true };
        expect(buildApprovalToolData(data)).toEqual({
            requiresApproval: "sendEmailApproval",
            generateApprovalFunction: "true",
        });
    });

    it("treats string 'true' checkbox values the same as boolean true", () => {
        const data: FormValues = { requiresApproval: "true", approvalFunction: "f", generateApprovalFunction: "true" };
        expect(buildApprovalToolData(data)).toEqual({ requiresApproval: "f", generateApprovalFunction: "true" });
    });

    it("trims the function name", () => {
        const data: FormValues = { requiresApproval: true, approvalFunction: "  isHighValue  " };
        expect(buildApprovalToolData(data)).toEqual({ requiresApproval: "isHighValue" });
    });

    it("falls back to unconditional when the function value is not a string", () => {
        const data: FormValues = { requiresApproval: true, approvalFunction: undefined };
        expect(buildApprovalToolData(data)).toEqual({ requiresApproval: "true" });
    });
});

describe("readToolParameters", () => {
    const item = (type: string, variable: string) => ({ formValues: { type, variable } });

    // Every tool form stores parameters as items with formValues.type / formValues.variable, either
    // as an array (side panel, PARAM_MANAGER) or keyed by id (REPEATABLE_PROPERTY).
    it.each([
        ["an array", [item("string", "to"), item("int", "count")]],
        ["a keyed object", { a: item("string", "to"), b: item("int", "count") }],
    ])("reads parameters stored as %s, in order", (_label, value) => {
        expect(readToolParameters({ parameters: value })).toEqual([
            { type: "string", name: "to" },
            { type: "int", name: "count" },
        ]);
    });

    it("drops a leading ai:Context, which approval functions can't take", () => {
        const value = [item("ai:Context", "ctx"), item("string", "to")];
        expect(readToolParameters({ parameters: value })).toEqual([{ type: "string", name: "to" }]);
    });

    it("ignores incomplete rows and missing values", () => {
        expect(readToolParameters({ parameters: [item("", "x"), item("string", "")] })).toEqual([]);
        expect(readToolParameters({})).toEqual([]);
    });
});

describe("defaultApprovalFunctionName", () => {
    it.each([
        ["sendEmail", "sendEmailApproval"],
        ["sendEmailTool", "sendEmailApproval"],
        ["SendEmail", "sendEmailApproval"],
        ["'type", "typeApproval"],
        ["Tool", "toolApproval"],
        ["", "toolApproval"],
        [undefined, "toolApproval"],
    ])("derives a name from %p", (base, expected) => {
        expect(defaultApprovalFunctionName(base as string | undefined)).toBe(expected);
    });
});

describe("createRequiresApprovalField", () => {
    it("prefills the attached function and derives the default name from the form values", () => {
        const field = createRequiresApprovalField({ functionName: "isHighValue" }, {
            presentation: "inline",
            toolName: (values) => String(values.functionName ?? ""),
        });
        expect(field.value).toBe(true);
        expect(field.approvalConfig?.initialFunction).toBe("isHighValue");
        expect(field.approvalConfig?.presentation).toBe("inline");
        const defaultName = field.approvalConfig?.defaultFunctionName as (values: FormValues) => string;
        expect(defaultName({ functionName: "refundTool" })).toBe("refundApproval");
    });

    it("is unchecked with no function when the tool has no gate", () => {
        const field = createRequiresApprovalField();
        expect(field.value).toBe(false);
        expect(field.approvalConfig?.initialFunction).toBe("");
        expect(field.approvalConfig?.presentation).toBe("view");
    });
});

describe("existingApprovalConfig", () => {
    it("prefills from what the language server reports about the tool's annotation", () => {
        expect(existingApprovalConfig(true, "isHighValue")).toEqual({ functionName: "isHighValue" });
        // Unconditional, or a qualified or inline function the language server doesn't report.
        expect(existingApprovalConfig(true, undefined)).toEqual({});
        expect(existingApprovalConfig(false, undefined)).toBeUndefined();
        expect(existingApprovalConfig(undefined, undefined)).toBeUndefined();
    });
});
