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
// getPrimaryInputType from it at runtime, so we stub that (matching src/test/utils/bi.test.ts).
jest.mock("@wso2/ballerina-core", () => ({
    getPrimaryInputType: (types: any[]) => types?.[0],
}));

import { FormValues } from "@wso2/ballerina-side-panel";
import {
    approvalSourceForSave,
    buildApprovalToolData,
    createRequiresApprovalField,
    defaultApprovalFunctionName,
    existingApprovalConfig,
    initialApproval,
    readToolParameters,
    stripCodeFencesInline,
    upsertApprovalField,
} from "../../../../views/BI/AIChatAgent/formUtils";

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

describe("edit save of requiresApproval", () => {
    const INLINE = "isolated function (string a, string b) returns boolean => a == b";
    const annotation = (value: string) => `@ai:AgentTool {\n    requiresApproval: ${value},\n    auth: {}\n}`;
    // What the form opens with, from what the language server reports for each value as written.
    const opened = (value: string) => {
        const local = /^[A-Za-z_']\w*$/.test(value) && value !== "true" && value !== "false";
        return initialApproval(existingApprovalConfig(value !== "false", local ? value : undefined), value);
    };
    const asOpened = (value: string): FormValues => {
        const initial = opened(value);
        return { requiresApproval: initial.checked, approvalFunction: initial.functionName };
    };

    // Whatever the value, a save that leaves the control as it opened writes the value back as it was.
    it.each(["true", "false", "sendEmailApproval", "utils:check", INLINE])("keeps %s when the control is unchanged",
        (value) => {
            expect(upsertApprovalField(annotation(value), asOpened(value), opened(value))).toBe(annotation(value));
            expect(approvalSourceForSave(asOpened(value), opened(value))).toBe(value);
        });

    it("keeps a value the control can't show when the checkbox comes back as the string \"true\"", () => {
        const data: FormValues = { requiresApproval: "true", approvalFunction: "" };
        expect(upsertApprovalField(annotation("utils:check"), data, opened("utils:check")))
            .toBe(annotation("utils:check"));
    });

    it.each(["utils:check", INLINE])("replaces %s whole when a function is attached", (value) => {
        const data: FormValues = { requiresApproval: true, approvalFunction: "sendEmailApproval" };
        expect(upsertApprovalField(annotation(value), data, opened(value)))
            .toBe(annotation("sendEmailApproval"));
        expect(approvalSourceForSave(data, opened(value))).toBe("sendEmailApproval");
    });

    it.each(["sendEmailApproval", "utils:check", INLINE])("removes %s whole when approval is turned off",
        (value) => {
            const data: FormValues = { requiresApproval: false, approvalFunction: "" };
            expect(upsertApprovalField(annotation(value), data, opened(value)))
                .toBe("@ai:AgentTool {\n    auth: {}\n}");
            expect(approvalSourceForSave(data, opened(value))).toBeUndefined();
        });

    it("switches a local function", () => {
        const data: FormValues = { requiresApproval: true, approvalFunction: "otherApproval" };
        expect(upsertApprovalField(annotation("sendEmailApproval"), data, opened("sendEmailApproval")))
            .toBe(annotation("otherApproval"));
    });

    it("writes the control's state when the form opened without a requiresApproval field", () => {
        const initial = initialApproval(undefined, undefined);
        const data: FormValues = { requiresApproval: true, approvalFunction: "" };
        expect(upsertApprovalField("@ai:AgentTool", data, initial))
            .toBe("@ai:AgentTool {\n    requiresApproval: true\n}");
        expect(approvalSourceForSave({ requiresApproval: false }, initial)).toBeUndefined();
    });
});

describe("stripCodeFencesInline", () => {
    it.each([["LF", "\n"], ["CRLF", "\r\n"]])("joins %s lines into one line", (_, eol) => {
        const text = `Sends a message.${eol}Returns the reply.${eol}\`\`\`ballerina${eol}check send();${eol}\`\`\``;
        expect(stripCodeFencesInline(text)).toBe("Sends a message. Returns the reply.");
    });
});
