/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { createWebviewTransportAdapter } from "@wso2/webview-giga-bridge/webview";
import { WEBVIEW_WS_EVENTS, WebviewWsResponseMessage } from "@wso2/ballerina-core";
import { WiBridgeClient } from "./integrator-form/context/WsClientContext";

export interface WsCoords {
    host: string;
    port: number;
    token: string;
}

/**
 * Project-creation RPCs are served by the Ballerina host over the WebSocket
 * bridge. Everything else (cloud reads, etc.) is delegated to the host client.
 */
const PROJECT_ACTIONS = new Set([
    "createBIProject",
    "validateProjectPath",
    "getExistingProjectInfo",
    "getProjectComponentNames",
    "selectFileOrDirPath",
    "getWorkspaceRoot",
    "getDefaultOrgName",
    "getDefaultCreationPath",
    "isSupportedSLVersion",
]);

/**
 * Thin client over the shared giga-bridge webview transport (websocket mode)
 * that talks directly to the Ballerina extension's BI form WS server. The
 * per-session token is presented once during the handshake; the result envelope
 * is unwrapped.
 */
export class EmbeddedWsRpc {
    private readonly adapter: ReturnType<typeof createWebviewTransportAdapter<any, WebviewWsResponseMessage>>;

    constructor(coords: WsCoords) {
        this.adapter = createWebviewTransportAdapter<any, WebviewWsResponseMessage>({
            mode: "websocket",
            server: coords.host,
            port: coords.port,
            // The host authenticates the handshake, so the connection is refused
            // without this token.
            token: coords.token,
        });
    }

    async request(action: string, params?: unknown): Promise<unknown> {
        const response = await this.adapter.request({ action, params });
        if (!response || response.type !== WEBVIEW_WS_EVENTS.WS_RESPONSE || response.success === false) {
            throw new Error(response?.error ?? "Project request failed.");
        }
        return response.result ?? null;
    }

    dispose(): void {
        this.adapter.close();
    }
}

/**
 * Builds the composite client the form runs against: project-creation methods
 * are routed over the WS bridge to the Ballerina host, while every other method
 * (cloud reads, runCommand, etc.) falls through to the embedding host's client.
 */
export function createCompositeClient(host: WiBridgeClient, wsRpc: EmbeddedWsRpc): WiBridgeClient {
    return new Proxy(host, {
        get(target, prop) {
            if (typeof prop === "string" && PROJECT_ACTIONS.has(prop)) {
                return (params: unknown) => wsRpc.request(prop, params);
            }
            const value = (target as any)[prop];
            return typeof value === "function" ? value.bind(target) : value;
        },
    }) as unknown as WiBridgeClient;
}
