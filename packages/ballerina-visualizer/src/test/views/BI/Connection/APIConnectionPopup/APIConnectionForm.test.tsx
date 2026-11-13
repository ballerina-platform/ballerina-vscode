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
// the form's scrolling body, and the button is outside that body and not positioned out of flow.
// (wso2/product-integrator#1543: a sticky footer covered the file picker in a short popup.)

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("@wso2/ballerina-core", () => ({ __esModule: true, DIRECTORY_MAP: {} }));

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("../../../../rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

jest.mock("@wso2/ballerina-side-panel", () => ({ __esModule: true }));

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    ThemeColors: new Proxy({}, { get: () => "#000" }),
    Typography: ({ children }: any) => <p>{children}</p>,
    Button: ({ children, onClick, disabled }: any) => <button onClick={onClick} disabled={disabled}>{children}</button>,
    TextField: ({ id, value }: any) => <input data-testid={id} defaultValue={value} />,
    Dropdown: ({ id }: any) => <select data-testid={id} />,
    Stepper: (): null => null,
    Icon: (): null => null,
    Codicon: (): null => null,
    Overlay: (): null => null,
}));

jest.mock("../../../../../views/BI/Connection/ConnectionConfigView", () => ({ __esModule: true, default: (): null => null }));

import { TestRpcContext } from "../../../../rpcHarness";
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

    const renderForm = (props: Partial<React.ComponentProps<typeof APIConnectionForm>> = {}) =>
        act(() => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient: {} }}>
                    <APIConnectionForm fileName="main.bal" projectPath="/project" onSave={jest.fn()} {...props} />
                </TestRpcContext.Provider>
            );
        });

    it.each([
        ["default action", {}],
        ["custom action text", { actionButtonText: "Continue" }],
    ])("keeps every field in the scrolling body and the button out of it (%s)", (_name, props) => {
        renderForm(props);

        const body = container.querySelector('[data-testid="api-connection-form-body"]') as HTMLElement;
        expect(body).not.toBeNull();
        expect(getComputedStyle(body).overflowY).toBe("auto");

        for (const id of FIELD_TEST_IDS) {
            const field = container.querySelector(`[data-testid="${id}"]`);
            expect(field).not.toBeNull();
            expect(body.contains(field)).toBe(true);
        }

        const button = container.querySelector("button") as HTMLElement;
        expect(button).not.toBeNull();
        expect(body.contains(button)).toBe(false);

        // Nothing between the button and the form root may take it out of flow.
        for (let el: HTMLElement | null = button; el && el !== container; el = el.parentElement) {
            expect(["sticky", "fixed", "absolute"]).not.toContain(getComputedStyle(el).position);
        }
    });
});
