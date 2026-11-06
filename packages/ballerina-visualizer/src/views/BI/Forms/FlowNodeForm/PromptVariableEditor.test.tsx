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

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

const mockApplyModifications = jest.fn(async (..._args: any[]) => true);

jest.mock("../../../../utils/utils", () => ({
    __esModule: true,
    applyModifications: (...args: any[]) => mockApplyModifications(...args),
    textToModifications: (text: string, position: any) => [{ text, position }],
}));

jest.mock("@wso2/ballerina-core", () => ({
    __esModule: true,
    getPrimaryInputType: (types: any[]) => types?.[0],
}));

jest.mock("@wso2/ballerina-rpc-client", () => ({
    __esModule: true,
    useRpcContext: () => ({
        rpcClient: {
            getVisualizerRpcClient: () => ({
                joinProjectPath: async ({ segments }: any) => ({ filePath: `/project/${segments[0]}` }),
            }),
        },
    }),
}));

jest.mock("@wso2/ballerina-side-panel", () => ({
    __esModule: true,
    InputMode: { PROMPT: "Prompt" },
    ExpandedEditor: ({ field, value, onChange, footer }: any) => (
        <div data-testid="prompt-editor">
            <h3>{field.label}</h3>
            <span data-testid="prompt-value">{value}</span>
            <button onClick={() => onChange("string `Line one\nLine `two``")}>Type</button>
            <button onClick={() => onChange("")}>Clear</button>
            {footer}
        </div>
    ),
}));

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Button: ({ children, onClick, disabled }: any) => <button onClick={onClick} disabled={disabled}>{children}</button>,
    Codicon: (): null => null,
    Typography: ({ children }: any) => <span>{children}</span>,
    ThemeColors: new Proxy({}, { get: () => "#000" }),
}));

import { escapeTemplateBackticks, shiftLineRange, usePromptVariableEditor } from "./PromptVariableEditor";

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const range = (fileName: string, start: number, end: number, endOffset = 10) => ({
    fileName,
    startLine: { line: start, offset: 27 },
    endLine: { line: end, offset: endOffset },
});

const instructionsField: any = {
    key: "instructions",
    label: "Instructions",
    types: [{ fieldType: "PROMPT", ballerinaType: "string" }],
    value: "tutorInstructions",
    metadata: {
        label: "Instructions",
        description: "",
        data: {
            promptVariable: {
                name: "tutorInstructions",
                value: "Explain step by step.",
                lineRange: range("agents.bal", 6, 6, 59),
                references: 2,
            },
        },
    },
};
const roleField: any = { key: "role", label: "Role", value: "Tutor", metadata: { label: "Role", description: "" } };
const agentRange = range("agents.bal", 8, 8);

let latest: ReturnType<typeof usePromptVariableEditor>;
const fields = [roleField, instructionsField];

function Harness({ input = fields }: { input?: any[] }) {
    latest = usePromptVariableEditor(input, agentRange, "agents.bal");
    return (
        <>
            {latest.fields.map((field) => field.actionCallback && (
                <button key={field.key} onClick={field.actionCallback}>{field.actionLabel}</button>
            ))}
            {latest.promptVariableEditor}
        </>
    );
}

const button = (container: HTMLElement, text: string) =>
    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(text));

describe("usePromptVariableEditor", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        mockApplyModifications.mockClear();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => root.render(<Harness />));
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it("links only fields that reference a prompt variable", () => {
        expect(latest.fields[0].actionCallback).toBeUndefined();
        expect(button(container, "Open in Prompt Editor")).toBeDefined();
    });

    it("opens the variable's text and saves it to the initializer", async () => {
        await act(async () => button(container, "Open in Prompt Editor").click());

        expect(container.querySelector("h3").textContent).toBe("tutorInstructions");
        expect(container.querySelector("[data-testid=prompt-value]").textContent).toBe("Explain step by step.");
        expect(container.textContent).toContain("Used in 2 places");
        expect(button(container, "Save").disabled).toBe(true);

        act(() => button(container, "Type").click());
        await act(async () => button(container, "Save").click());

        const [, modifications, filePath] = mockApplyModifications.mock.calls[0];
        expect(filePath).toBe("/project/agents.bal");
        expect(modifications[0]).toEqual({
            text: 'string `Line one\nLine ${"`"}two${"`"}`',
            position: { startLine: 6, startColumn: 27, endLine: 6, endColumn: 59 },
        });
        expect(container.querySelector("[data-testid=prompt-editor]")).toBeNull();
        expect(latest.targetLineRange.startLine.line).toBe(9);
    });

    it("drops the link while the field no longer refers to the variable", () => {
        act(() => latest.onFieldChange("instructions", "string `${tutorInstructions}`"));
        expect(button(container, "Open in Prompt Editor")).toBeUndefined();

        act(() => latest.onFieldChange("instructions", "tutorInstructions"));
        expect(button(container, "Open in Prompt Editor")).toBeDefined();
    });

    it("removes its own link from fields the form feeds back", () => {
        const fedBack = latest.fields;
        act(() => latest.onFieldChange("instructions", "string `${tutorInstructions}`"));
        act(() => root.render(<Harness input={fedBack} />));
        expect(button(container, "Open in Prompt Editor")).toBeUndefined();
    });

    it("writes an empty template when the prompt is cleared", async () => {
        await act(async () => button(container, "Open in Prompt Editor").click());
        act(() => button(container, "Clear").click());
        await act(async () => button(container, "Save").click());

        expect(mockApplyModifications.mock.calls[0][1][0].text).toBe("string ``");
    });

    it("keeps the editor open when the write fails", async () => {
        mockApplyModifications.mockResolvedValueOnce(false);
        await act(async () => button(container, "Open in Prompt Editor").click());
        act(() => button(container, "Type").click());
        await act(async () => button(container, "Save").click());

        expect(container.textContent).toContain("could not be saved");
        expect(latest.targetLineRange).toBe(agentRange);
    });
});

describe("prompt variable source helpers", () => {
    it("escapes backticks inside the template only", () => {
        expect(escapeTemplateBackticks("`a`b`")).toBe('`a${"`"}b`');
        expect(escapeTemplateBackticks("plain")).toBe("plain");
    });

    it("shifts only ranges below the edit in the same file", () => {
        const edited = range("agents.bal", 2, 2);
        const replaced = range("agents.bal", 2, 4);
        expect(shiftLineRange(range("agents.bal", 5, 6), "agents.bal", edited, replaced).startLine.line).toBe(7);
        expect(shiftLineRange(range("agents.bal", 1, 1), "agents.bal", edited, replaced).startLine.line).toBe(1);
        expect(shiftLineRange(range("main.bal", 5, 6), "main.bal", edited, replaced).startLine.line).toBe(5);
    });
});
