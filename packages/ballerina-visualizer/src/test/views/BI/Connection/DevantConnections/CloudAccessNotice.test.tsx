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
import { Root, createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { PlatformExtState } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { CloudAccessNotice } from "../../../../../views/BI/Connection/DevantConnections/CloudAccessNotice";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockPlatformExtState: PlatformExtState;
const mockLoginToDevant = jest.fn();

jest.mock("../../../../../providers/platform-ext-ctx-provider", () => ({
    usePlatformExtContext: () => ({
        platformExtState: mockPlatformExtState,
        loginToDevant: mockLoginToDevant,
    }),
}));

jest.mock("@vscode/webview-ui-toolkit/react", () => {
    const React = require("react");
    return {
        VSCodeLink: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) =>
            React.createElement("button", { onClick }, children),
    };
});

jest.mock("../../../../../views/BI/Connection/AddConnectionPopup/styles", () => {
    const React = require("react");
    return {
        IntroText: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
    };
});

const state = (values: Partial<PlatformExtState>): PlatformExtState =>
    ({ isExtInstalled: true, ...values }) as PlatformExtState;

describe("CloudAccessNotice", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        jest.clearAllMocks();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const renderNotice = () => {
        act(() => root.render(<CloudAccessNotice purpose="to browse knowledge bases." />));
    };

    it("offers sign-in when the cloud host is signed out", () => {
        mockPlatformExtState = state({ isLoggedIn: false, cloudAccess: "signed-out" });

        renderNotice();

        expect(container.textContent).toBe("Sign in to Choreo Cloud to browse knowledge bases.");
        const button = container.querySelector("button");
        expect(button?.textContent).toBe("Sign in");
        act(() => button?.click());
        expect(mockLoginToDevant).toHaveBeenCalledTimes(1);
    });

    it.each(["no-access", "declined"] as const)("offers access when cloud access is %s", (cloudAccess) => {
        mockPlatformExtState = state({ isLoggedIn: false, cloudAccess });

        renderNotice();

        expect(container.textContent).toContain("Allow access");
        const button = container.querySelector("button");
        act(() => button?.click());
        expect(mockLoginToDevant).toHaveBeenCalledTimes(1);
    });

    it("renders nothing when cloud access is ready", () => {
        mockPlatformExtState = state({ isLoggedIn: true, cloudAccess: "connected" });

        renderNotice();

        expect(container).toBeEmptyDOMElement();
    });
});
