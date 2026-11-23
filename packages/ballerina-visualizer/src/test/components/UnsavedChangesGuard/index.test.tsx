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
import { useConfirmDiscard, useReportUnsavedChanges } from "@wso2/ballerina-side-panel";
import { UnsavedChangesGuard } from "../../../components/UnsavedChangesGuard";

jest.mock("@wso2/ui-toolkit", () => ({
    Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => <button onClick={onClick}>{children}</button>,
    Codicon: (): null => null,
    Typography: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));
jest.mock("../../../components/PopupModal", () => ({
    PopupModal: ({ children, onClose }: { children: (close: () => void) => React.ReactNode; onClose: () => void }) => <div>{children(onClose)}</div>,
    PopupModalStep: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("../../../views/BI/Connection/styles", () => {
    const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
    return { CloseButton: Pass, HeaderTitleContainer: Pass, PopupContent: Pass, PopupFooter: Pass, PopupHeader: Pass, PopupTitle: Pass };
});

function EditedForm({ dirty, onClose }: { dirty: boolean; onClose: () => void }) {
    useReportUnsavedChanges(dirty);
    const confirmDiscard = useConfirmDiscard();
    return <button id="close" onClick={() => confirmDiscard(onClose)}>Close</button>;
}

describe("UnsavedChangesGuard", () => {
    let host: HTMLDivElement;
    let root: Root;
    const onClose = jest.fn();

    const render = (dirty: boolean) => act(() => {
        root.render(<UnsavedChangesGuard><EditedForm dirty={dirty} onClose={onClose} /></UnsavedChangesGuard>);
    });
    const click = (element: Element) => act(() => {
        element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const button = (label: string) => [...document.body.querySelectorAll("vscode-button, button")].find((b) => b.textContent?.trim() === label);

    beforeEach(() => {
        jest.useFakeTimers();
        onClose.mockReset();
        host = document.createElement("div");
        document.body.appendChild(host);
        root = createRoot(host);
    });

    afterEach(() => {
        act(() => root.unmount());
        host.remove();
        jest.useRealTimers();
    });

    it("closes at once when nothing is edited", () => {
        render(false);
        click(document.getElementById("close")!);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(document.body.textContent).not.toContain("Unsaved Changes");
    });

    it("asks first when a form has unsaved edits, and closes only on Discard Changes", () => {
        render(true);
        click(document.getElementById("close")!);
        expect(onClose).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain("Unsaved Changes");
        click(button("Discard Changes")!);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("keeps the form open on Cancel", () => {
        render(true);
        click(document.getElementById("close")!);
        click(button("Cancel")!);
        act(() => { jest.runAllTimers(); });
        expect(onClose).not.toHaveBeenCalled();
        expect(document.body.textContent).not.toContain("Unsaved Changes");
    });
});
