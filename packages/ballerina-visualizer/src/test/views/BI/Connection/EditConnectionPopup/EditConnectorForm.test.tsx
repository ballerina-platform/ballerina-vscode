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

// L2: editing a database connector backed by a WSO2 Cloud connection. WSO2 Cloud never returns
// secret values, so the form has to fall back to the credentials step, where the person enters
// them and connects, instead of the table step it shows when the credentials come back whole.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("@wso2/ballerina-core", () => ({ __esModule: true }));

jest.mock("@wso2/wso2-platform-core", () => ({
    __esModule: true,
    DatabaseRequestStatusEnum: { Active: "ACTIVE" },
    ServiceInfoVisibilityEnum: { Project: "PROJECT", Organization: "ORGANIZATION", Public: "PUBLIC" },
}));

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("../../../../rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    ThemeColors: new Proxy({}, { get: () => "#000" }),
    Typography: ({ children }: any) => <p>{children}</p>,
    Button: ({ children, onClick, disabled }: any) => <button onClick={onClick} disabled={disabled}>{children}</button>,
    TextField: ({ id, value, onTextChange }: any) => (
        <input data-testid={id} value={value} onChange={(e) => onTextChange?.(e.target.value)} />
    ),
    Stepper: (): null => null,
    Icon: (): null => null,
    Codicon: (): null => null,
    SearchBox: (): null => null,
    ProgressIndicator: (): null => null,
    Overlay: (): null => null,
}));

jest.mock("../../../../../components/Loader", () => ({ __esModule: true, LoadingRing: (): null => null }));

const credentialProperties = {
    dbSystem: { metadata: { label: "Database System" }, value: "mysql" },
    host: { metadata: { label: "Host" }, value: "" },
    port: { metadata: { label: "Port" }, value: "" },
    user: { metadata: { label: "User" }, value: "" },
    password: { metadata: { label: "Password" }, value: "" },
    database: { metadata: { label: "Database" }, value: "" },
};

jest.mock("../../../../../views/BI/Connection/DatabaseConnectionPopup", () => ({
    __esModule: true,
    fetchConnectorCredentials: () => Promise.resolve({ success: true, connectorCredentials: { properties: credentialProperties } }),
}));

const platformRpcClient = {
    getConnection: jest.fn(() =>
        Promise.resolve({
            configurations: {
                dev: {
                    entries: {
                        Host: { value: "db.example.com" },
                        Port: { value: "3306" },
                        User: { value: "admin" },
                        Database: { value: "orders" },
                        Password: { isSensitive: true, isFile: false, valueRef: "secret-ref" },
                    },
                },
            },
        })
    ),
    resolveConnectionSecrets: jest.fn(() => Promise.resolve({ secrets: [] as { key: string; value: string }[] })),
};

jest.mock("../../../../../providers/platform-ext-ctx-provider", () => ({
    __esModule: true,
    usePlatformExtContext: () => ({
        platformRpcClient,
        platformExtState: {
            isLoggedIn: true,
            session: { org: { handle: "acme" } },
            selectedContext: { project: { name: "shop" }, projectName: "shop" },
            selectedIntegration: { integration: { id: "orders-api" } },
            selectedEnv: { id: "dev" },
            devantConns: { list: [{ name: "ordersDb", groupUuid: "orders-api/ordersDb", resourceType: "THIRD_PARTY" }] },
        },
    }),
}));

import { TestRpcContext } from "../../../../rpcHarness";
import { EditConnectorForm } from "../../../../../views/BI/Connection/EditConnectionPopup/EditConnectorForm";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const introspectDatabase = jest.fn((_req: any) => Promise.resolve({ tables: [{ table: "orders", selected: true, existing: true }] }));
const rpcClient = {
    getVisualizerLocation: () => Promise.resolve({ projectPath: "/ws/shop" }),
    getConnectorWizardRpcClient: () => ({ introspectDatabase }),
};

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe("EditConnectorForm with a WSO2 Cloud connection whose secrets are not returned", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(async () => {
        introspectDatabase.mockClear();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        await act(async () => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient }}>
                    <EditConnectorForm properties={credentialProperties as any} connectionName="ordersDb" handleClosePopup={() => undefined} />
                </TestRpcContext.Provider>
            );
        });
        await flush();
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const input = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLInputElement;
    const button = (label: string) => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === label);

    it("shows the credentials step, prefilled and asking for the secret, without connecting blank", () => {
        expect(container.textContent).toContain("Database Credentials");
        expect(container.textContent).toContain("Enter Password here to connect.");
        expect(container.textContent).not.toContain("Select Tables");
        expect(input("host").value).toBe("db.example.com");
        expect(input("password").value).toBe("");
        expect(button("Connect & Introspect Database")).toBeDefined();
        expect(introspectDatabase).not.toHaveBeenCalled();
    });

    it("connects with the secret the person enters", async () => {
        await act(async () => {
            const field = input("password");
            const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
            setValue.call(field, "s3cret");
            field.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await act(async () => {
            button("Connect & Introspect Database")!.click();
        });
        await flush();

        expect(introspectDatabase).toHaveBeenCalledTimes(1);
        const sent = introspectDatabase.mock.calls[0][0].properties;
        expect(sent.password.value).toBe("s3cret");
        expect(sent.host.value).toBe("db.example.com");
        expect(container.textContent).toContain("Select Tables");
    });
});
