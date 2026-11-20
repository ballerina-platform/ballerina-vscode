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

// L2: the "Connect via API Specification" form must never paint its action button over its own
// fields. jsdom has no layout, so this pins the structure that guarantees it: every field lives in
// the form's scrolling body, that body can shrink, and the button is outside it and in flow.
// (wso2/product-integrator#1543: a sticky footer covered the file picker in a short popup.)

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("@wso2/ballerina-core", () => ({ __esModule: true, DIRECTORY_MAP: {} }));

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("../../../../rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    ThemeColors: new Proxy({}, { get: () => "#000" }),
    Typography: ({ children }: any) => <p>{children}</p>,
    // className carries the emotion styles of a styled(Button), which the out-of-flow check reads.
    Button: ({ children, onClick, disabled, className }: any) => (
        <button className={className} onClick={onClick} disabled={disabled}>{children}</button>
    ),
    TextField: ({ id, value }: any) => <input data-testid={id} defaultValue={value} />,
    Dropdown: ({ id }: any) => <select data-testid={id} />,
    Stepper: (): null => null,
    Icon: (): null => null,
    Codicon: (): null => null,
    Overlay: (): null => null,
}));

jest.mock("../../../../../views/BI/Connection/ConnectionConfigView", () => ({ __esModule: true, default: (): null => null }));

import { TestRpcContext } from "../../../../rpcHarness";
import { declaredValue, resolveLength } from "../../../../cssRules";
import { APIConnectionForm } from "../../../../../views/BI/Connection/APIConnectionPopup";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const FIELD_TEST_IDS = ["api-spec-type", "connector-name", "api-spec-upload"];

describe("APIConnectionForm layout", () => {
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

    const renderForm = (props: Partial<React.ComponentProps<typeof APIConnectionForm>> = {}, rpcClient: object = {}) =>
        act(() => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient }}>
                    <APIConnectionForm fileName="main.bal" projectPath="/project" onSave={jest.fn()} {...props} />
                </TestRpcContext.Provider>
            );
        });

    const formBody = () => container.querySelector('[data-testid="api-connection-form-body"]') as HTMLElement;

    it.each([
        ["new connector", {}],
        // The WSO2 Cloud step: locked fields, a file already chosen, its own button text.
        ["WSO2 Cloud upload step", { disabled: true, initialFilePath: "/spec.yaml", actionButtonText: "Continue" }],
    ])("keeps every field in the scrolling body and the button out of it (%s)", (_name, props) => {
        renderForm(props);

        const body = formBody();
        expect(body).not.toBeNull();
        // The body scrolls only because it may shrink below its content: drop a `min-height: 0`
        // here or on its parent and the popup scrolls instead, taking the button out of view.
        const bodyStyle = getComputedStyle(body);
        expect(["auto", "scroll"]).toContain(bodyStyle.overflowY || bodyStyle.overflow);
        expect(["0", "0px"]).toContain(bodyStyle.minHeight);
        expect(bodyStyle.flexGrow).toBe("1");

        const layout = body.parentElement as HTMLElement;
        const layoutStyle = getComputedStyle(layout);
        expect(layoutStyle.display).toBe("flex");
        expect(layoutStyle.flexDirection).toBe("column");
        expect(["0", "0px"]).toContain(layoutStyle.minHeight);

        for (const id of FIELD_TEST_IDS) {
            const field = container.querySelector(`[data-testid="${id}"]`);
            expect(field).not.toBeNull();
            expect(body.contains(field)).toBe(true);
        }

        const button = container.querySelector("button") as HTMLElement;
        expect(button).not.toBeNull();
        expect(body.contains(button)).toBe(false);
        expect(layout.contains(button)).toBe(true);

        // Nothing between the button and the form root may take it out of flow.
        for (let el: HTMLElement | null = button; el && el !== container; el = el.parentElement) {
            expect(["sticky", "fixed", "absolute"]).not.toContain(getComputedStyle(el).position);
        }
    });

    // The body reaches into its host's side padding exactly as far as its own padding plus a
    // scrollbar gutter it always reserves, so the fields are as wide as the button below whether
    // or not the body scrolls, and do not change width when the scrollbar comes and goes.
    it("keeps the fields as wide as the button, scrolling or not", () => {
        renderForm();

        const body = formBody();
        expect(declaredValue(body, "scrollbar-gutter")).toBe("stable");
        const reach = -resolveLength(declaredValue(body, "margin-right") ?? "0px");
        const padding = resolveLength(declaredValue(body, "padding-right") ?? "0px");
        const scrollbar = resolveLength(declaredValue(body, "width", "::-webkit-scrollbar") ?? "0px");
        expect(scrollbar).toBeGreaterThan(0);
        expect(padding + scrollbar).toBe(reach);
    });

    // A failed save disables the button, and the error at the top of the body is the only reason
    // shown, while the user is usually scrolled down to the file picker when they save.
    it("brings a failed save's error into view", async () => {
        // jsdom has no scrollIntoView; @wso2/test-config stubs it on HTMLElement.
        const scrollIntoView = jest.spyOn(HTMLElement.prototype, "scrollIntoView");
        const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
        const rpcClient = {
            getBIDiagramRpcClient: () => ({
                generateOpenApiClient: async () => ({ errorMessage: "Invalid specification" }),
            }),
        };
        try {
            renderForm({ initialFilePath: "/spec.yaml", initialName: "petstore" }, rpcClient);
            const button = container.querySelector("button") as HTMLButtonElement;
            expect(button.disabled).toBe(false);

            await act(async () => button.click());

            const error = container.querySelector('[data-testid="api-connection-error"]');
            expect(error).not.toBeNull();
            expect(formBody().contains(error)).toBe(true);
            expect(button.disabled).toBe(true);
            expect(scrollIntoView.mock.contexts).toContain(error);
        } finally {
            scrollIntoView.mockRestore();
            consoleError.mockRestore();
        }
    });
});
