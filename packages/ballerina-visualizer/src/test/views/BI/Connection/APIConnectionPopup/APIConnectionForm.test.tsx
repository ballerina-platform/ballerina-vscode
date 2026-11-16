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
import { APIConnectionForm, APIConnectionPopup } from "../../../../../views/BI/Connection/APIConnectionPopup";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Every rule emotion has injected, as text. jsdom cannot evaluate min()/vh, so these are read raw. */
const emotionRules = (): string[] =>
    Array.from(document.querySelectorAll("style")).flatMap((style) => [
        style.textContent ?? "",
        ...Array.from((style.sheet as CSSStyleSheet | null)?.cssRules ?? []).map((rule) => rule.cssText),
    ]);

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
        ["new connector", {}],
        // The WSO2 Cloud step: locked fields, a file already chosen, its own button text.
        ["WSO2 Cloud upload step", { disabled: true, initialFilePath: "/spec.yaml", actionButtonText: "Continue" }],
    ])("keeps every field in the scrolling body and the button out of it (%s)", (_name, props) => {
        renderForm(props);

        const body = container.querySelector('[data-testid="api-connection-form-body"]') as HTMLElement;
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

    // The popup is centred in the webview, so a minimum height above the viewport's pushes its
    // header and its action button off both ends, where nothing can scroll them back.
    it("never asks for more height than the webview has", () => {
        act(() => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient: {} }}>
                    <APIConnectionPopup fileName="main.bal" projectPath="/project" />
                </TestRpcContext.Provider>
            );
        });

        const popupRule = emotionRules().find((rule) => /position:\s*fixed/.test(rule) && /min-height/.test(rule));
        expect(popupRule).toBeDefined();
        const minHeight = /min-height:\s*([^;]+);/.exec(popupRule!)![1];
        expect(minHeight).toMatch(/^min\(.*100vh.*\)$/);
    });
});
