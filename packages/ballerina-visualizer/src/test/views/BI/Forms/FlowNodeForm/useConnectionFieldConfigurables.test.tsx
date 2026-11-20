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

// L2: renaming the configurable of a connection field whose value is the argument itself (a Kafka consumer's
// bootstrap servers). A configurable the connection already uses is renamed across the project as soon as the user
// agrees in the confirmation, and the form then uses the new name, so saving keeps it. A configurable saving will
// create is only named, with nothing to confirm. The harness renders the hook's footer under one field, as the
// connection form does, and its rename stands in for the form's: the language server's rename, then applyRename.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import type { ConnectionConfigurablesResponse, Property } from "@wso2/ballerina-core";
import { FormField, InputMode } from "@wso2/ballerina-side-panel";

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Codicon: ({ name }: any) => <i data-codicon={name} />,
    ProgressRing: () => <span data-testid="progress-ring" />,
    // The product's confirmation, opened under the line: the message, Cancel, and the action it confirms.
    Confirm: ({ message, confirmText, onConfirm }: any) => (
        <div role="dialog">
            <span>{message}</span>
            <button type="button" onClick={() => onConfirm(false)}>Cancel</button>
            <button type="button" onClick={() => onConfirm(true)}>{confirmText}</button>
        </div>
    ),
    Icon: ({ name }: any) => <i data-icon={name} />,
    Tooltip: ({ children }: any) => <span>{children}</span>,
    Typography: ({ children }: any) => <span>{children}</span>,
    ThemeColors: new Proxy({}, { get: () => "#000" }),
}));

jest.mock("@vscode/webview-ui-toolkit/react", () => ({
    __esModule: true,
    VSCodeCheckbox: ({ checked, onChange, ...rest }: any) => (
        <input type="checkbox" checked={!!checked} onChange={onChange} data-testid={rest["data-testid"]} />
    ),
}));

import {
    ConnectionFieldConfigurables,
    useConnectionFieldConfigurables
} from "../../../../../views/BI/Forms/FlowNodeForm/useConnectionFieldConfigurables";
import type {
    ConfigurableRenameRequest,
    FieldConfigurable
} from "../../../../../views/BI/HelperPaneNew/Components/RecordFormView/configurables";

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const KEY = "bootstrapServers";
const DECLARATION = { filePath: "/project/config.bal", line: 2, offset: 16 };
const EXISTING: FieldConfigurable = { name: "kafkaBootstrapServers", existing: true, declaration: DECLARATION };
const PROPERTY = { optional: false, codedata: { kind: "REQUIRED" } } as unknown as Property;
const FIELD = { key: KEY, optional: false, defaultValue: "" } as unknown as FormField;
const CONFIRMATION = "Rename configurable? Renaming kafkaBootstrapServers to brokers will update all references "
    + "across the project.";

const flush = async () => {
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
};

/** The mode the field's editor is drawn in. */
let mode: InputMode;

describe("renaming a connection field's configurable", () => {
    let container: HTMLDivElement;
    let root: Root;
    let hook: ConnectionFieldConfigurables;
    let languageServerRename: jest.Mock<Promise<boolean>, [ConfigurableRenameRequest]>;

    function Harness() {
        const preview = async (): Promise<ConnectionConfigurablesResponse> => ({ configurables: [] });
        hook = useConnectionFieldConfigurables(true, preview, async (request) => {
            const renamed = await languageServerRename(request);
            if (renamed) {
                hook.applyRename(request.from, request.to);
            }
            return renamed;
        }, true);
        return <>{hook.renderFieldFooter?.(FIELD, mode, "\"localhost:9092\"")}</>;
    }

    beforeEach(() => {
        jest.useFakeTimers();
        mode = InputMode.TEXT;
        languageServerRename = jest.fn(async (_request: ConfigurableRenameRequest) => true);
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => root.render(<Harness />));
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        jest.useRealTimers();
    });

    const byTestId = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    const button = (label: string) =>
        Array.from(document.querySelectorAll("button")).find((element) =>
            element.textContent === label || element.getAttribute("aria-label") === label) as HTMLButtonElement;
    const shownName = () => byTestId(`record-form-configurable-name-${KEY}`)?.textContent;

    const open = (choice: FieldConfigurable) => act(() => hook.adopt({ [KEY]: choice }, { configurables: [] }));

    const typeName = (name: string) => {
        act(() => byTestId(`record-form-configurable-rename-${KEY}`)!.click());
        const input = byTestId(`record-form-configurable-name-input-${KEY}`) as HTMLInputElement;
        act(() => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, name);
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
    };

    it("asks first, in the words the product uses for a rename that updates references", () => {
        open(EXISTING);
        typeName("brokers");
        expect(container.textContent).toContain("Note: Renaming will update all references across the project");
        act(() => button("Done").click());

        expect(document.body.textContent).toContain(CONFIRMATION);
        expect(button("Rename")).toBeTruthy();
        expect(button("Cancel")).toBeTruthy();
        expect(languageServerRename).not.toHaveBeenCalled();
    });

    it("asks on Enter as on the ✓ button", () => {
        open(EXISTING);
        typeName("brokers");
        const input = byTestId(`record-form-configurable-name-input-${KEY}`)!;
        act(() => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
        expect(document.body.textContent).toContain(CONFIRMATION);
    });

    it("changes nothing when the user cancels, and keeps the name typed to fix or leave", () => {
        open(EXISTING);
        typeName("brokers");
        act(() => button("Done").click());
        act(() => button("Cancel").click());

        expect(document.body.textContent).not.toContain(CONFIRMATION);
        expect(languageServerRename).not.toHaveBeenCalled();
        expect((byTestId(`record-form-configurable-name-input-${KEY}`) as HTMLInputElement).value).toBe("brokers");
        expect(hook.choiceFor(KEY, PROPERTY)).toEqual({ name: "kafkaBootstrapServers", existing: true });
    });

    it("renames across the project once the user agrees, and the form then uses the new name", async () => {
        open(EXISTING);
        typeName("brokers");
        act(() => button("Done").click());
        act(() => button("Rename").click());
        await flush();

        expect(languageServerRename).toHaveBeenCalledTimes(1);
        expect(languageServerRename).toHaveBeenCalledWith({
            from: "kafkaBootstrapServers", to: "brokers", declaration: DECLARATION
        });
        expect(document.body.textContent).not.toContain(CONFIRMATION);
        expect(byTestId(`record-form-configurable-name-input-${KEY}`)).toBeNull();
        expect(shownName()).toBe("brokers");
        // Saving tells the language server the connection uses the configurable by its new name.
        expect(hook.choiceFor(KEY, PROPERTY)).toEqual({ name: "brokers", existing: true });
        // Nothing is left to rename when the form is saved, so it saves.
        let saved = false;
        act(() => { saved = hook.commitRename(); });
        expect(saved).toBe(true);
        expect(languageServerRename).toHaveBeenCalledTimes(1);
    });

    it("keeps the old name, and says so, when the rename finds nothing to rename", async () => {
        languageServerRename.mockResolvedValue(false);
        open(EXISTING);
        typeName("brokers");
        act(() => button("Done").click());
        act(() => button("Rename").click());
        await flush();

        expect(container.querySelector("[role=alert]")?.textContent).toBe("Could not rename kafkaBootstrapServers.");
        expect((byTestId(`record-form-configurable-name-input-${KEY}`) as HTMLInputElement).value).toBe("brokers");
        expect(hook.choiceFor(KEY, PROPERTY)).toEqual({ name: "kafkaBootstrapServers", existing: true });
    });

    it("keeps the old name, and says so, when the rename fails", async () => {
        languageServerRename.mockRejectedValue(new Error("no document"));
        const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
        open(EXISTING);
        typeName("brokers");
        act(() => button("Done").click());
        act(() => button("Rename").click());
        await flush();

        expect(container.querySelector("[role=alert]")?.textContent).toBe("Could not rename kafkaBootstrapServers.");
        expect(hook.choiceFor(KEY, PROPERTY)).toEqual({ name: "kafkaBootstrapServers", existing: true });
        consoleError.mockRestore();
    });

    it("stops the save to ask about a rename across the project still being typed", () => {
        open(EXISTING);
        typeName("brokers");
        let saved = true;
        act(() => { saved = hook.commitRename(); });

        expect(saved).toBe(false);
        expect(document.body.textContent).toContain(CONFIRMATION);
        expect(languageServerRename).not.toHaveBeenCalled();
        expect(hook.choiceFor(KEY, PROPERTY)).toEqual({ name: "kafkaBootstrapServers", existing: true });
    });

    it("lets the form save once the field with a rename still being typed leaves the mode a value is typed in", () => {
        open(EXISTING);
        typeName("brokers");
        mode = InputMode.EXP;
        act(() => root.render(<Harness />));
        let saved = false;
        act(() => { saved = hook.commitRename(); });

        expect(saved).toBe(true);
        expect(document.body.textContent).not.toContain(CONFIRMATION);
        expect(languageServerRename).not.toHaveBeenCalled();
        // Code written in the expression mode stays as is; back in a typed mode, the field uses its configurable again.
        expect(hook.choiceFor(KEY, PROPERTY)).toEqual({ keep: true });
        mode = InputMode.TEXT;
        act(() => root.render(<Harness />));
        expect(hook.choiceFor(KEY, PROPERTY)).toEqual({ name: "kafkaBootstrapServers", existing: true });
    });

    it("only names a configurable saving will create: nothing refers to it, so nothing is asked", () => {
        open({ name: "kafkaBootstrapServers" });
        typeName("brokers");
        act(() => button("Done").click());

        expect(document.body.textContent).not.toContain(CONFIRMATION);
        expect(languageServerRename).not.toHaveBeenCalled();
        expect(shownName()).toBe("brokers");
        expect(hook.choiceFor(KEY, PROPERTY)).toEqual({ name: "brokers" });
    });

    it("names a configurable saving will create with a name still being typed when the form is saved", () => {
        open({ name: "kafkaBootstrapServers" });
        typeName("brokers");
        let saved = false;
        act(() => { saved = hook.commitRename(); });
        expect(saved).toBe(true);
        expect(hook.choiceFor(KEY, PROPERTY)).toEqual({ name: "brokers" });
    });
});

describe("a connection field's configurable when the preview fails", () => {
    let container: HTMLDivElement;
    let root: Root;
    let answer: () => Promise<ConnectionConfigurablesResponse>;
    let hook: ConnectionFieldConfigurables;

    function Harness() {
        hook = useConnectionFieldConfigurables(true, () => answer(), async () => false, true);
        return <>{hook.renderFieldFooter?.(FIELD, InputMode.TEXT, "\"localhost:9092\"")}</>;
    }

    beforeEach(() => {
        jest.useFakeTimers();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        jest.useRealTimers();
    });

    const shown = async () => {
        act(() => root.render(<Harness />));
        await act(async () => { jest.advanceTimersByTime(1000); });
        await flush();
        return container.textContent ?? "";
    };

    it("says why, rather than show no names as if nothing were configurable", async () => {
        answer = async () => ({ configurables: [], errorMsg: "the project doesn't compile" });
        expect(await shown()).toContain("Couldn't work out the configurables: the project doesn't compile");
    });

    it("ignores a preview that answers after the values it was for changed, though the next one hasn't started", async () => {
        let answerFirst: (response: ConnectionConfigurablesResponse) => void = () => undefined;
        answer = () => new Promise((resolve) => { answerFirst = resolve; });
        act(() => root.render(<Harness />));
        await act(async () => { jest.advanceTimersByTime(500); });
        // The connection is renamed while the first preview is out; the next waits for typing to pause.
        act(() => hook.schedulePreview("variable"));
        await act(async () => { answerFirst({ configurables: [], errorMsg: "stale" }); });
        await flush();
        expect(container.textContent).not.toContain("stale");
    });

    it("says why when the request itself fails", async () => {
        const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
        answer = async () => { throw new Error("connection lost"); };
        expect(await shown()).toContain("Couldn't work out the configurables: connection lost");
        consoleError.mockRestore();
    });
});
