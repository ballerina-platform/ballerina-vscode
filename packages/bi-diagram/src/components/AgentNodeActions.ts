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

import { FlowNode, ToolData } from "../utils/types";

/** Editing capabilities exposed by a host that renders an agent node. */
export interface AgentNodeActions {
    onModelSelect?: (node: FlowNode) => void;
    onAddTool?: (node: FlowNode) => void;
    onAddMcpServer?: (node: FlowNode) => void;
    onSelectTool?: (tool: ToolData, node: FlowNode) => void;
    onSelectMcpToolkit?: (tool: ToolData, node: FlowNode) => void;
    onDeleteTool?: (tool: ToolData, node: FlowNode) => void;
    goToTool?: (tool: ToolData, node: FlowNode) => void;
    onSelectMemoryManager?: (node: FlowNode) => void;
    onDeleteMemoryManager?: (node: FlowNode) => void;
    onChatWithAgent?: (node: FlowNode) => void;
}
