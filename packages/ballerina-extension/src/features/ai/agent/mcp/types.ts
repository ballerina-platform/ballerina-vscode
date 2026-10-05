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

export type McpTransportType = "stdio" | "http";

export type McpScope = "user" | "workspace" | "builtin";

export interface McpStdioServerConfig {
    type?: "stdio";
    command: string;
    args?: string[];
    env?: Record<string, string>;
    disabled?: boolean;
}

export interface McpOAuthConfig {
    clientId: string;
    callbackPort: number;
}

export interface McpHttpServerConfig {
    type?: "http";
    url: string;
    headers?: Record<string, string>;
    oauth?: McpOAuthConfig;
    /** Header name → env var name. The value is read from the environment at connect time so secrets stay out of mcp.json. */
    headersFromEnv?: Record<string, string>;
    disabled?: boolean;
}

export type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig;

export interface McpConfigFile {
    mcpServers?: Record<string, McpServerConfig>;
}

export type McpConnectionStatus = "disconnected" | "connecting" | "connected" | "failed";

export interface McpToolSummary {
    name: string;
    description?: string;
}

/** DTO-shaped variant: `type` is required, internal `disabled` flag is dropped. */
export type NormalisedMcpServerConfig =
    | { type: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
    | { type: "http"; url: string; headers?: Record<string, string>; headersFromEnv?: Record<string, string>; oauth?: McpOAuthConfig };

export interface McpServerStatus {
    name: string;
    scope: McpScope;
    transport: McpTransportType;
    enabled: boolean;
    status: McpConnectionStatus;
    error?: string;
    signInRequired?: boolean;
    tools: McpToolSummary[];
    /** Raw config as stored on disk — used by the Edit dialog to pre-fill fields. */
    config: NormalisedMcpServerConfig;
    /** True when this server is shadowed by a same-named workspace-scope server. */
    shadowed?: boolean;
}
