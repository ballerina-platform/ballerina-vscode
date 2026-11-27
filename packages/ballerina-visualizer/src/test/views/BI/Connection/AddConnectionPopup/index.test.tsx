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

// L2: which Add Connection popup opens. Devant has its own screens, WSO2 Cloud has its own, and a
// directory with no cloud project gets the plain one. The popups themselves are stubbed.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("@wso2/ballerina-core", () => ({ __esModule: true, MACHINE_VIEW: {} }));
jest.mock("@wso2/ballerina-rpc-client", () => ({ __esModule: true, useRpcContext: () => ({ rpcClient: {} }) }));
jest.mock("@wso2/ui-toolkit", () => {
    const Nothing = (): null => null;
    return {
        __esModule: true,
        ThemeColors: new Proxy({}, { get: () => "#000" }),
        Codicon: Nothing,
        Icon: Nothing,
        SearchBox: Nothing,
        Typography: Nothing,
        ProgressRing: Nothing,
    };
});
jest.mock("@wso2/bi-diagram", () => ({ __esModule: true, ConnectorIcon: (): null => null }));
jest.mock("../../../../../components/ButtonCard", () => ({ __esModule: true, default: (): null => null }));
jest.mock("../../../../../views/BI/Connection/APIConnectionPopup", () => ({ __esModule: true, default: (): null => null }));
jest.mock("../../../../../views/BI/Connection/ConnectionConfigurationPopup", () => ({ __esModule: true, default: (): null => null }));
jest.mock("../../../../../views/BI/Connection/DatabaseConnectionPopup", () => ({ __esModule: true, default: (): null => null }));
jest.mock("../../../../../views/BI/Connection/styles", () => {
    const Box = ({ children }: any) => <div>{children}</div>;
    return { __esModule: true, PopupOverlay: Box, PopupContainer: Box, PopupHeader: Box, PopupTitle: Box, CloseButton: Box };
});
jest.mock("../../../../../views/BI/Connection/AddConnectionPopup/styles", () => ({
    __esModule: true,
    PopupContent: ({ children }: any) => <div>{children}</div>,
}));
jest.mock("../../../../../views/BI/Connection/AddConnectionPopup/AddConnectionPopupContent", () => ({
    __esModule: true,
    AddConnectionPopupContent: () => <span>plain popup</span>,
}));
jest.mock("../../../../../views/BI/Connection/DevantConnections/DevantConnectorPopup", () => ({
    __esModule: true,
    DevantConnectorPopup: () => <span>WSO2 Cloud popup</span>,
}));
jest.mock("../../../../../views/BI/Connection/DevantLegacyConnections/DevantConnectorPopup", () => ({
    __esModule: true,
    DevantConnectorPopup: () => <span>Devant popup</span>,
}));

let mockPlatformExtState: Record<string, unknown> | undefined;
jest.mock("../../../../../providers/platform-ext-ctx-provider", () => ({
    __esModule: true,
    usePlatformExtContext: () => ({ platformExtState: mockPlatformExtState }),
}));

import { AddConnectionPopup } from "../../../../../views/BI/Connection/AddConnectionPopup";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const devantProject = { selectedContext: { org: { id: 101, handle: "acme" }, project: { id: "proj-uuid" } } };
const cloudProject = { selectedContext: { projectName: "shop", orgHandle: "acme", contextDirs: [] as string[] } };

describe("AddConnectionPopup", () => {
    let container: HTMLDivElement;
    let root: Root;

    const shown = async (state: Record<string, unknown> | undefined) => {
        mockPlatformExtState = state;
        await act(async () => {
            root.render(<AddConnectionPopup projectPath="/ws/shop" fileName="main.bal" onNavigateToOverview={() => undefined} />);
        });
        return container.textContent;
    };

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it("opens Devant's own screens for a Devant project", async () => {
        expect(await shown({ isLoggedIn: true, platform: "devant", devant: devantProject })).toBe("Devant popup");
    });

    it("does not open WSO2 Cloud's screens on Devant, whatever the shared state still holds", async () => {
        expect(await shown({ isLoggedIn: true, platform: "devant", ...cloudProject })).toContain("plain popup");
        expect(await shown({ isLoggedIn: false, platform: "devant", devant: devantProject })).toContain("plain popup");
    });

    it("opens WSO2 Cloud's screens for a WSO2 Cloud project", async () => {
        expect(await shown({ isLoggedIn: true, ...cloudProject })).toBe("WSO2 Cloud popup");
    });

    it("does not open Devant's screens on WSO2 Cloud, whatever the Devant state still holds", async () => {
        expect(await shown({ isLoggedIn: true, devant: devantProject })).toContain("plain popup");
    });

    it("opens the plain popup with no cloud project", async () => {
        expect(await shown(undefined)).toContain("plain popup");
    });
});
