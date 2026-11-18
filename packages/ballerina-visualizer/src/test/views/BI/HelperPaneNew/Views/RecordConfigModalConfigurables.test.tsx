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

// L2: renaming a configurable an existing connection's record field already uses, in the Record Configuration modal
// (a Salesforce client's `config`). The modal opens on the configurables' values, and renaming one asks first, then
// renames it across the project at once; the modal and the connection form then use the new name.
//
// The modal runs as it does in the connection form, with its RPCs answered by a small stand-in for the language
// server: the record model and source follow the record's text, and the configurables preview reports, as the
// language server does, a reference to a declared configurable as one the connection already uses.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import type {
    ConnectionConfigurableChoices,
    ConnectionConfigurablePreview,
    ConnectionConfigurablesResponse,
    FormDiagnostics,
    RecordTypeField,
    TypeField
} from "@wso2/ballerina-core";

jest.mock("@wso2/ballerina-core", () => ({
    __esModule: true,
    keywords: [] as string[],
    ...jest.requireActual("@wso2/ballerina-core/lib/utils/optionality-utils"),
    ...jest.requireActual("@wso2/ballerina-core/lib/utils/source-name-utils"),
    getPrimaryInputType: (): undefined => undefined,
    getSecondaryInputType: (): undefined => undefined,
}));

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    HelperPane: { Body: ({ children }: any) => <div>{children}</div> },
    Button: ({ children, onClick }: any) => <button type="button" onClick={onClick}>{children}</button>,
    LinkButton: ({ children, onClick }: any) => <button type="button" onClick={onClick}>{children}</button>,
    Codicon: ({ name }: any) => <i data-codicon={name} />,
    Icon: ({ name }: any) => <i data-icon={name} />,
    Tooltip: ({ children }: any) => <>{children}</>,
    Typography: ({ children }: any) => <span>{children}</span>,
    ErrorBanner: ({ errorMsg }: any) => <span>{errorMsg}</span>,
    ProgressRing: () => <span data-testid="progress-ring" />,
    Dropdown: (): null => null,
    TextField: ({ id, value, onTextChange }: any) => (
        <input data-testid={id} value={value ?? ""} onChange={(event) => onTextChange(event.target.value)} />
    ),
    Confirm: ({ message, confirmText, onConfirm }: any) => (
        <div role="dialog">
            <span>{message}</span>
            <button type="button" onClick={() => onConfirm(false)}>Cancel</button>
            <button type="button" onClick={() => onConfirm(true)}>{confirmText}</button>
        </div>
    ),
    ThemeColors: new Proxy({}, { get: () => "#000" }),
}));

jest.mock("@vscode/webview-ui-toolkit/react", () => ({
    __esModule: true,
    VSCodeCheckbox: ({ checked, onChange, onClick, ...rest }: any) => (
        <input type="checkbox" checked={!!checked} onChange={onChange ?? (() => undefined)} onClick={onClick}
            data-testid={rest["data-testid"]} />
    ),
}));

jest.mock("@wso2/ballerina-side-panel", () => {
    const React = jest.requireActual("react");
    return {
        __esModule: true,
        Context: React.createContext(null),
        FieldProvider: ({ children }: any) => <>{children}</>,
        // The code view's editor, as a text box the test types code into.
        ChipExpressionEditorComponent: ({ value, onChange }: any) => (
            <textarea data-testid="code-editor" value={value ?? ""} onChange={(event) => onChange(event.target.value, 0)} />
        ),
        ExpandedEditor: (): null => null,
        RecordConfigExpressionEditorConfig: class { },
        getPropertyFromFormField: () => ({}),
        TypeChip: ({ label }: any) => <span>{label}</span>,
        ModeToggle: ({ secondary, onChange, testId }: any) => (
            <span data-testid={testId} data-secondary={String(secondary)}>
                <button type="button" data-testid={`${testId}-primary`} onClick={() => onChange(false)} />
                <button type="button" data-testid={`${testId}-secondary`} onClick={() => onChange(true)} />
            </span>
        ),
        get InputMode() {
            return jest.requireActual(
                "../../../../../../../ballerina-side-panel/src/components/editors/MultiModeExpressionEditor/ChipExpressionEditor/types.ts"
            ).InputMode;
        },
    };
});

jest.mock(
    "@wso2/ballerina-side-panel/lib/components/editors/MultiModeExpressionEditor/ChipExpressionEditor/ChipExpressionDefaultConfig",
    () => ({ __esModule: true, ChipExpressionEditorDefaultConfiguration: class { } })
);

jest.mock("react-markdown", () => ({ __esModule: true, default: (): null => null }));
jest.mock("../../../../../components/Skeletons", () => ({
    __esModule: true,
    RecordFormSkeleton: () => <div data-testid="record-form-skeleton" />,
}));

/**
 * The connection form's diagnostics. Like the form's, the requests share one debounce: only the last one asked for
 * answers, when the test says so, unless every request is answered straight away.
 */
let DIAGNOSTICS: FormDiagnostics["diagnostics"] = [];
let answerEveryDiagnosticsRequest = true;
let lastDiagnosticsRequest: (() => void) | undefined;
const getExpressionFormDiagnostics: FormExpressionEditorProps["getExpressionFormDiagnostics"] =
    async (_show, _expression, key, _property, setDiagnosticsInfo) => {
        lastDiagnosticsRequest = () => setDiagnosticsInfo({ key, diagnostics: DIAGNOSTICS });
        if (answerEveryDiagnosticsRequest) {
            lastDiagnosticsRequest();
        }
    };

const rpcClient = {
    getCommonRpcClient: () => ({ getCurrentProjectTomlValues: async () => ({}) }),
    getBIDiagramRpcClient: () => ({
        getRecordModelFromSource: async ({ expr }: { expr: string }) => ({ recordConfig: modelOf(expr) }),
        getRecordSource: async ({ type }: { type: TypeField }) => ({ recordValue: sourceOf(type) }),
    }),
};
jest.mock("@wso2/ballerina-rpc-client", () => ({ __esModule: true, useRpcContext: () => ({ rpcClient }) }));

import { ConfigureRecordPage, RecordConfigurablesSupport } from "../../../../../views/BI/HelperPaneNew/Views/RecordConfigModal";
import type { ConfigurableRenameRequest } from "../../../../../views/BI/HelperPaneNew/Components/RecordFormView/configurables";
import type { FormExpressionEditorProps } from "@wso2/ballerina-side-panel";

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// The modal is written for the automatic JSX runtime the webview build uses; this suite compiles JSX to React calls.
(globalThis as unknown as { React: typeof React }).React = React;

/** Where each configurable is declared, by name: the module's configurables as the source declares them. */
let DECLARATIONS: Record<string, { filePath: string; line: number; offset: number }>;
const declared = () => ({
    salesforceClientBaseUrl1: { filePath: "/project/config.bal", line: 8, offset: 20 },
    salesforceClientAuthToken1: { filePath: "/project/config.bal", line: 9, offset: 20 },
});
/** Config.toml: the configurables' values, by name. */
const CONFIG_TOML: Record<string, string> = {
    salesforceClientBaseUrl1: "\"https://sss.com\"",
    salesforceClientAuthToken1: "\"12345\"",
};
const PATHS = ["baseUrl", "auth.token"];
const SOURCE = "{baseUrl: salesforceClientBaseUrl1, auth: {token: salesforceClientAuthToken1}}";

/** The record's two string fields as the text gives them: `baseUrl` and `auth.token`. */
function valuesOf(source: string): Record<string, string> {
    return {
        baseUrl: /baseUrl:\s*([^,}]+)/.exec(source)?.[1].trim() ?? "",
        "auth.token": /token:\s*([^,}]+)/.exec(source)?.[1].trim() ?? "",
    };
}

function modelOf(source: string): TypeField {
    const values = valuesOf(source);
    return {
        typeName: "record", name: "ConnectionConfig", selected: true,
        fields: [
            { typeName: "string", name: "baseUrl", selected: true, value: values.baseUrl },
            {
                typeName: "record", name: "auth", selected: true, typeInfo: { name: "BearerTokenConfig" } as any,
                fields: [{ typeName: "string", name: "token", selected: true, value: values["auth.token"] }],
            },
        ],
    } as TypeField;
}

function sourceOf(record: TypeField): string {
    const baseUrl = record.fields![0].value;
    const token = record.fields![1].fields![0].value;
    return `{baseUrl: ${baseUrl}, auth: {token: ${token}}}`;
}

/**
 * The language server's preview of the connection: a field referring to a declared configurable uses it, with its
 * value from Config.toml; a literal becomes the configurable the user's choice names (the generated name otherwise).
 */
/**
 * The init parameter the record is given for, as the language server names it, and the key of its property in the
 * form. A parameter named as a flow node's own property (a MongoDB client's `connection`) is keyed `$connection`.
 */
let PARAMETER: { name: string; key?: string };

function languageServerPreview(recordValue: string, choices: ConnectionConfigurableChoices): ConnectionConfigurablesResponse {
    const values = valuesOf(recordValue);
    const shown: Record<string, string> = {};
    const configurables = PATHS.map((path): ConnectionConfigurablePreview => {
        const value = values[path];
        if (DECLARATIONS[value]) {
            shown[path] = value;
            return {
                parameter: PARAMETER.name, key: PARAMETER.key, fieldPath: path, name: value, type: "string",
                exists: true, kept: false,
                existing: true, value: CONFIG_TOML[value], declaration: DECLARATIONS[value],
            } as ConnectionConfigurablePreview;
        }
        const name = choices[path]?.name ?? `salesforceClient${path === "baseUrl" ? "BaseUrl" : "AuthToken"}`;
        shown[path] = name;
        const existing = !!choices[path]?.existing && !!DECLARATIONS[name];
        return {
            parameter: PARAMETER.name, key: PARAMETER.key, fieldPath: path, name, type: "string", exists: existing,
            kept: false, existing,
            declaration: existing ? DECLARATIONS[name] : undefined,
        } as ConnectionConfigurablePreview;
    });
    return {
        configurables,
        arguments: {
            [PARAMETER.key ?? PARAMETER.name]: `{baseUrl: ${shown.baseUrl}, auth: {token: ${shown["auth.token"]}}}`
        },
    } as ConnectionConfigurablesResponse;
}

const RECORD_TYPE_FIELD = {
    key: "config",
    property: { metadata: { label: "Config" }, optional: false, types: [] },
    recordTypeMembers: [{ type: "ConnectionConfig", kind: "RECORD_TYPE", packageInfo: "ballerinax:salesforce:8.0.0", selected: true }],
} as unknown as RecordTypeField;

const flush = async () => {
    for (let i = 0; i < 5; i++) {
        await act(async () => { await Promise.resolve(); });
    }
};

describe.each([
    { parameter: { name: "config" }, fieldKey: "config" },
    // The language server names the parameter, and keys its property apart from a flow node's own `connection`.
    { parameter: { name: "connection", key: "$connection" }, fieldKey: "$connection" },
])("configurables in the Record Configuration modal, for the parameter $parameter.name", ({ parameter, fieldKey }) => {
    let container: HTMLDivElement;
    let root: Root;
    let support: RecordConfigurablesSupport;
    let sent: ConnectionConfigurableChoices;
    let languageServerRename: jest.Mock<Promise<boolean>, [ConfigurableRenameRequest]>;
    let onChange: jest.Mock<void, [string, boolean?]>;

    beforeEach(async () => {
        jest.useFakeTimers();
        PARAMETER = parameter;
        DECLARATIONS = declared();
        sent = {};
        onChange = jest.fn();
        DIAGNOSTICS = [];
        answerEveryDiagnosticsRequest = true;
        lastDiagnosticsRequest = undefined;
        languageServerRename = jest.fn(async ({ from, to }: ConfigurableRenameRequest) => {
            // The source now declares and uses the configurable by its new name; Config.toml is left as it was.
            DECLARATIONS[to] = DECLARATIONS[from];
            delete DECLARATIONS[from];
            return true;
        });
        support = {
            initialChoices: {},
            preview: async (recordValue, choices) => languageServerPreview(recordValue, choices),
            onChoicesChange: (choices) => { sent = choices; },
            rename: (request) => languageServerRename(request),
        };
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => root.render(
            <ConfigureRecordPage
                fileName="/project/connections.bal"
                targetLineRange={{ startLine: { line: 30, offset: 0 }, endLine: { line: 35, offset: 3 } } as any}
                onChange={onChange}
                currentValue={SOURCE}
                recordTypeField={{ ...RECORD_TYPE_FIELD, key: fieldKey }}
                onClose={() => undefined}
                getHelperPane={() => null}
                triggerCharacters={[]}
                configurables={support}
                formContext={{
                    expressionEditor: {
                        rpcManager: { getExpressionTokens: async (): Promise<number[]> => [] },
                        getExpressionFormDiagnostics,
                    },
                    popupManager: { addPopup: () => undefined, removeLastPopup: () => undefined, closePopup: () => undefined },
                    nodeInfo: { kind: "NEW_CONNECTION" },
                }}
            />
        ));
        await flush();
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        jest.useRealTimers();
    });

    const byTestId = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    const button = (label: string) => Array.from(container.querySelectorAll("button"))
        .find((element) => element.textContent === label || element.getAttribute("aria-label") === label)!;

    const rename = (path: string, name: string) => {
        act(() => byTestId(`record-form-configurable-rename-${path}`)!.click());
        const input = byTestId(`record-form-configurable-name-input-${path}`) as HTMLInputElement;
        act(() => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, name);
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        act(() => button("Done").click());
    };

    it("gives the parent a value typed just before the modal closes", async () => {
        const input = byTestId("record-form-baseUrl") as HTMLInputElement;
        act(() => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "https://closing");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        onChange.mockClear();
        // Closed before the form's pause for typing is over.
        act(() => root.unmount());
        await flush();
        expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining("https://closing"), true);
    });

    it("gives the parent an edit typed while an earlier one's source was generated, when the modal closes", async () => {
        const typeUrl = (url: string) => {
            const input = byTestId("record-form-baseUrl") as HTMLInputElement;
            act(() => {
                Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, url);
                input.dispatchEvent(new Event("input", { bubbles: true }));
            });
        };
        const original = rpcClient.getBIDiagramRpcClient;
        let releaseFirst: (() => void) | undefined;
        let delayed = true;
        rpcClient.getBIDiagramRpcClient = () => ({
            ...original(),
            getRecordSource: (request: { type: TypeField }) => {
                const answer = original().getRecordSource(request);
                if (!delayed) {
                    return answer;
                }
                delayed = false;
                return new Promise((resolve) => { releaseFirst = () => resolve(answer); });
            },
        });
        try {
            typeUrl("https://first");
            await act(async () => { jest.advanceTimersByTime(300); });
            typeUrl("https://second");
            await act(async () => { releaseFirst!(); });
            await flush();
            onChange.mockClear();
            act(() => root.unmount());
            await flush();
            expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining("https://second"), true);
        } finally {
            rpcClient.getBIDiagramRpcClient = original;
        }
    });

    const typeCode = (code: string) => {
        const editor = byTestId("code-editor") as HTMLTextAreaElement;
        act(() => {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(editor, code);
            editor.dispatchEvent(new Event("input", { bubbles: true }));
        });
    };

    it("stays on code with errors rather than show the form on the model it can't become", async () => {
        act(() => byTestId("record-view-switch-secondary")!.click());
        const start = { line: 0, character: 0 };
        DIAGNOSTICS = [{ range: { start, end: start }, severity: 1, message: "missing value" }];
        typeCode("{baseUrl: , auth: {token: salesforceClientAuthToken1}}");
        act(() => byTestId("record-view-switch-primary")!.click());
        await flush();
        expect(byTestId("record-view-switch")?.getAttribute("data-secondary")).toBe("true");
        expect(byTestId("record-form-skeleton")).toBeNull();
    });

    it("shows the form once code reaches the model, though its own diagnostics request was dropped", async () => {
        act(() => byTestId("record-view-switch-secondary")!.click());
        answerEveryDiagnosticsRequest = false;
        typeCode("{baseUrl: \"https://typed\", auth: {token: salesforceClientAuthToken1}}");
        act(() => byTestId("record-view-switch-primary")!.click());
        expect(byTestId("record-form-skeleton")).not.toBeNull();
        // The display's request for the same code comes later and replaces the sync's, which never answers.
        await act(async () => { jest.advanceTimersByTime(300); });
        await act(async () => { lastDiagnosticsRequest!(); });
        await flush();
        expect(byTestId("record-form-skeleton")).toBeNull();
        expect(byTestId("record-view-switch")?.getAttribute("data-secondary")).toBe("false");
    });

    it("opens on the configurables the record uses, with their values", () => {
        expect(byTestId("record-form-configurable-name-auth.token")?.textContent).toBe("salesforceClientAuthToken1");
        expect(byTestId("record-form-configurable-name-baseUrl")?.textContent).toBe("salesforceClientBaseUrl1");
        expect((byTestId("record-form-auth.token") as HTMLInputElement).value).toBe("12345");
        expect((byTestId("record-form-baseUrl") as HTMLInputElement).value).toBe("https://sss.com");
    });

    it("asks before renaming, and changes nothing when the user cancels", () => {
        rename("auth.token", "salesforceToken");
        expect(container.querySelector("[role=dialog]")?.textContent).toContain(
            "Rename configurable? Renaming salesforceClientAuthToken1 to salesforceToken will update all references "
            + "across the project.");
        act(() => button("Cancel").click());
        expect(container.querySelector("[role=dialog]")).toBeNull();
        expect(languageServerRename).not.toHaveBeenCalled();
    });

    it("renames across the project once the user agrees; the modal and the form then use the new name", async () => {
        rename("auth.token", "salesforceToken");
        act(() => button("Rename").click());
        await flush();

        expect(languageServerRename).toHaveBeenCalledWith({
            from: "salesforceClientAuthToken1",
            to: "salesforceToken",
            declaration: { filePath: "/project/config.bal", line: 9, offset: 20 },
        });
        expect(byTestId("record-form-configurable-name-auth.token")?.textContent).toBe("salesforceToken");
        // What saving the connection sends: the configurable by its new name, as one the connection already uses.
        await act(async () => { jest.advanceTimersByTime(500); });
        await flush();
        expect(sent["auth.token"]).toEqual({ name: "salesforceToken", existing: true });
        expect(sent.baseUrl).toEqual({ name: "salesforceClientBaseUrl1", existing: true });
    });

    it("shows that the rename is running, until it is done", async () => {
        let finish: (renamed: boolean) => void = () => undefined;
        languageServerRename.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
        rename("auth.token", "salesforceToken");
        act(() => button("Rename").click());
        await flush();

        expect(byTestId("record-form-configurable-renaming-auth.token")).not.toBeNull();
        expect((byTestId("record-form-configurable-name-input-auth.token") as HTMLInputElement).disabled).toBe(true);
        expect(container.textContent).toContain("Renaming and updating all references across the project…");

        DECLARATIONS.salesforceToken = DECLARATIONS.salesforceClientAuthToken1;
        await act(async () => { finish(true); });
        await flush();
        expect(byTestId("record-form-configurable-renaming-auth.token")).toBeNull();
        expect(byTestId("record-form-configurable-name-auth.token")?.textContent).toBe("salesforceToken");
    });
});
