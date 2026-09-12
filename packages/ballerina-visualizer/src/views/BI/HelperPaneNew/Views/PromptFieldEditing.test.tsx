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

// L2: the ai:Prompt field wiring through PromptFieldEditorContext, as composed by
// RecordConfigView (a thin pass-through with no logic of its own, rendered here via
// MemoizedParameterBranch directly). The RPC-backed source regeneration lives one level up
// in ConfigureRecordPage (RecordConfigModal.tsx) and isn't exercised here; this covers the
// model-side handoff up to onModelChange, which is what feeds that regeneration.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

import { TypeField } from "@wso2/ballerina-core";

jest.mock("@wso2/ballerina-core", () => ({
    __esModule: true,
    keywords: [] as string[],
    ...jest.requireActual("@wso2/ballerina-core/lib/utils/optionality-utils"),
}));

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
    LinkButton: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
    Codicon: (): null => null,
    Dropdown: (): null => null,
    Tooltip: ({ children }: any) => <>{children}</>,
    Typography: ({ children, className }: any) => <span className={className}>{children}</span>,
    ThemeColors: new Proxy({}, { get: () => "#000" }),
}));

jest.mock("@vscode/webview-ui-toolkit/react", () => ({
    __esModule: true,
    VSCodeCheckbox: ({ checked, onClick }: any) => <input type="checkbox" readOnly checked={!!checked} onClick={onClick} />,
}));

import { MemoizedParameterBranch } from "../Components/RecordConstructView/ParameterBranch";
import { PromptFieldEditorContext } from "../Components/RecordConstructView/PromptFieldEditorContext";

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function promptField(overrides: Partial<TypeField> = {}): TypeField {
    return {
        typeName: "string",
        name: "instructions",
        typeInfo: { orgName: "ballerina", moduleName: "ai", name: "Prompt" } as any,
        optional: false,
        defaultable: false,
        selected: false,
        value: undefined,
        ...overrides,
    };
}

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(text));
}

describe("an ai:Prompt field wired through PromptFieldEditorContext", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    // Mirrors RecordConfigView: parameters is the record's field list, and onChange calls
    // onModelChange with that same list (the model is mutated in place, not rebuilt).
    const renderWithPromptEditor = (recordModel: TypeField[], openPromptEditor: jest.Mock, onModelChange: jest.Mock) => {
        act(() => {
            root.render(
                <PromptFieldEditorContext.Provider value={{ openPromptEditor }}>
                    <MemoizedParameterBranch
                        parameters={recordModel}
                        depth={1}
                        onChange={() => onModelChange(recordModel)}
                    />
                </PromptFieldEditorContext.Provider>
            );
        });
    };

    it("opens the prompt editor with the field and a live onChange when its link is clicked", () => {
        const field = promptField();
        const recordModel: TypeField[] = [field];
        const openPromptEditor = jest.fn();
        const onModelChange = jest.fn();

        renderWithPromptEditor(recordModel, openPromptEditor, onModelChange);

        const openLink = findButtonByText(container, "Open in Prompt Editor");
        expect(openLink).toBeDefined();
        act(() => openLink!.click());

        expect(openPromptEditor).toHaveBeenCalledTimes(1);
        expect(openPromptEditor.mock.calls[0][0]).toBe(field);
        expect(typeof openPromptEditor.mock.calls[0][1]).toBe("function");
    });

    it("regenerates the record value once the prompt edit's onChange fires", () => {
        const field = promptField();
        const recordModel: TypeField[] = [field];
        const openPromptEditor = jest.fn();
        const onModelChange = jest.fn();

        renderWithPromptEditor(recordModel, openPromptEditor, onModelChange);

        act(() => findButtonByText(container, "Open in Prompt Editor")!.click());
        const editorOnChange = openPromptEditor.mock.calls[0][1] as () => void;

        // Mirrors ConfigureRecordPage.handlePromptChange: it mutates the field in place, then
        // calls this onChange, which is what triggers the RPC-backed source regeneration.
        field.value = "`Updated instructions`";
        field.selected = true;
        act(() => editorOnChange());

        expect(onModelChange).toHaveBeenCalledTimes(1);
        expect(onModelChange.mock.calls[0][0]).toBe(recordModel);
        expect(onModelChange.mock.calls[0][0][0].value).toBe("`Updated instructions`");
    });

    it("only shows the prompt editor link once an optional prompt field is selected", () => {
        const field = promptField({ optional: true });
        const recordModel: TypeField[] = [field];
        const openPromptEditor = jest.fn();
        const onModelChange = jest.fn();

        renderWithPromptEditor(recordModel, openPromptEditor, onModelChange);
        expect(findButtonByText(container, "Open in Prompt Editor")).toBeUndefined();

        const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
        act(() => checkbox.click());

        expect(findButtonByText(container, "Open in Prompt Editor")).toBeDefined();
    });
});
