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

export * from "./types";
export { namespaceToolName, parseMcpToolName, MCP_TOOL_PREFIX } from "./naming";
export { BUILT_IN_MCP_SERVERS, type BuiltInMcpServer } from "./builtIns";
export {
    ensureMcpConfigFileExists,
    loadMcpConfig,
    USER_MCP_CONFIG_PATH,
    PROJECT_MCP_FILENAME,
    workspaceMcpConfigPath,
    hasProjectMcpConfig,
    configFilePath,
    watchMcpConfig,
    writeMcpServer,
    updateMcpServer,
    deleteMcpServer,
} from "./configLoader";
export { isMcpToolsEnabled, MCP_ENABLE_SETTING, MCP_ENABLE_SETTING_KEY } from "./enablement";
export {
    McpClientManager,
    initMcpClientManager,
    getMcpClientManager,
    refreshMcpClientManager,
    disposeMcpClientManager,
    type EnabledOverrideStore,
} from "./McpClientManager";
export { bridgeMcpTools, getMcpTools, type BridgeOptions } from "./toolBridge";
