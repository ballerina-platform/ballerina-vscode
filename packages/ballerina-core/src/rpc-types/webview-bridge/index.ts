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

import { ChatNotify, DownloadProgress } from "../../state-machine-types";
import { ProjectMigrationResult } from "../../interfaces/extended-lang-client";

/**
 * Shared wire contract for the BI "migrated forms" webview-communication layer
 * (project-creation form + import-integration wizard). Used by BOTH the webview
 * client (`ballerina-visualizer` `BiWsClient`) and the extension server
 * (`ballerina-extension` `DefaultServer`) over the `@wso2/webview-giga-bridge`
 * transport, in proxy (postMessage) and websocket modes.
 */
export const WEBVIEW_WS_EVENTS = {
    /** Correlated reply to a `request()`/`notify()`. */
    WS_RESPONSE: "bi.ws.response",
    /** Migration-tool download progress stream. */
    DOWNLOAD_PROGRESS: "bi.download.progress",
    /** Migration-tool state-change stream. */
    MIGRATION_TOOL_STATE_CHANGED: "bi.migration.state",
    /** Migration-tool log stream. */
    MIGRATION_TOOL_LOGS: "bi.migration.logs",
    /** Per-project migration-completed stream (multi-project migrations). */
    MIGRATED_PROJECT: "bi.migrated.project",
    /** AI-enhancement chat stream. */
    CHAT_NOTIFY: "bi.chat.notify",
} as const;

/** Request envelope the form sends; the bridge unwraps it. Authentication is
 *  handled once during the websocket handshake, so requests carry no token. */
export interface WebviewWsRequest {
    action: string;
    params?: unknown;
}

export interface WebviewWsResponseMessage {
    type: typeof WEBVIEW_WS_EVENTS.WS_RESPONSE;
    action: string;
    success: boolean;
    result?: unknown;
    error?: string;
}

export interface WebviewWsDownloadProgressMessage {
    type: typeof WEBVIEW_WS_EVENTS.DOWNLOAD_PROGRESS;
    progress: DownloadProgress;
}

export interface WebviewWsMigrationStateMessage {
    type: typeof WEBVIEW_WS_EVENTS.MIGRATION_TOOL_STATE_CHANGED;
    state: string;
}

export interface WebviewWsMigrationLogMessage {
    type: typeof WEBVIEW_WS_EVENTS.MIGRATION_TOOL_LOGS;
    log: string;
}

export interface WebviewWsMigratedProjectMessage {
    type: typeof WEBVIEW_WS_EVENTS.MIGRATED_PROJECT;
    project: ProjectMigrationResult;
}

export interface WebviewWsChatNotifyMessage {
    type: typeof WEBVIEW_WS_EVENTS.CHAT_NOTIFY;
    event: ChatNotify;
}

export type WebviewWsResponse =
    | WebviewWsResponseMessage
    | WebviewWsDownloadProgressMessage
    | WebviewWsMigrationStateMessage
    | WebviewWsMigrationLogMessage
    | WebviewWsMigratedProjectMessage
    | WebviewWsChatNotifyMessage;

/** Connection coordinates resolved at form load. `proxy` talks to the Ballerina
 *  visualizer host over postMessage; `websocket` connects to the Ballerina
 *  extension's giga-bridge server (used for the integrator embed). */
export interface WebviewTransportBootstrap {
    mode: "proxy" | "websocket";
    wsServer: string;
    wsPort: number;
    /** Per-session token required by the websocket server. */
    token?: string;
}

/** Coordinates the extension relays to the embedded form so it can connect over
 *  websocket (host + OS-allocated port + per-session token). */
export interface WebviewWsBootstrap {
    host: string;
    port: number;
    token: string;
}

/** Result of an AI-provider sign-in attempt. */
export interface SignInResult {
    success: boolean;
    error?: string;
}
