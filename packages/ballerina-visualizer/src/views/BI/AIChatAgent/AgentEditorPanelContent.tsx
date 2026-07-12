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

import { FlowNode } from "@wso2/ballerina-core";
import { AddMcpServer } from "./AddMcpServer";
import { AddTool } from "./AddTool";
import { MemoryManagerConfig } from "./MemoryManagerConfig";
import { NewTool, NewToolSelectionMode } from "./NewTool";
import { UseAgentTool } from "./UseAgentTool";
import { UseAgentToolForm } from "./UseAgentToolForm";
import { AgentEditorController } from "./useAgentEditorController";

export function getAgentEditorPanelTitle(controller: AgentEditorController): string {
    switch (controller.view) {
        case "MEMORY": return "Configure Memory";
        case "NEW_TOOL_AGENT_FORM": return "Use Agent";
        case "ADD_MCP": return "Add MCP Server";
        case "EDIT_MCP": return "Edit MCP Server";
        default: return "Add Tool";
    }
}

export function AgentEditorPanelContent({ controller }: { controller: AgentEditorController }) {
    const agent = controller.agentNode;
    if (!agent) return null;
    switch (controller.view) {
        case "MEMORY":
            return <MemoryManagerConfig agentNode={agent} memoryNode={controller.memoryNode as FlowNode}
                memoryPropertyKey={controller.memoryPropertyKey} onSave={controller.close} />;
        case "ADD_TOOL":
            return <AddTool agentNode={agent}
                onCreateCustomTool={() => controller.openView("NEW_TOOL_CUSTOM")}
                onUseConnection={() => controller.openView("NEW_TOOL_CONNECTION")}
                onUseFunction={() => controller.openView("NEW_TOOL_FUNCTION")}
                onUseAgent={() => controller.openView("NEW_TOOL_AGENT")}
                onUseMcpServer={() => controller.openView("ADD_MCP")} onSave={controller.close} />;
        case "NEW_TOOL_CUSTOM":
        case "NEW_TOOL_CONNECTION":
        case "NEW_TOOL_FUNCTION":
            return <NewTool agentNode={agent}
                mode={controller.view === "NEW_TOOL_CUSTOM" ? NewToolSelectionMode.CUSTOM_TOOL
                    : controller.view === "NEW_TOOL_CONNECTION" ? NewToolSelectionMode.CONNECTION
                        : NewToolSelectionMode.FUNCTION}
                onSave={controller.close} onBack={controller.back} onSetBackOverride={() => { }} />;
        case "NEW_TOOL_AGENT":
            return <UseAgentTool agentNode={agent} onSelectAgent={controller.selectAgent}
                onAgentCreated={controller.onAgentCreated} onBack={controller.back} onClose={controller.close} />;
        case "NEW_TOOL_AGENT_FORM":
            return <UseAgentToolForm agentNode={agent} agentVarName={controller.selectedAgentName}
                onSave={controller.close} />;
        case "ADD_MCP":
            return <AddMcpServer agentNode={agent} onSave={controller.close} onBack={controller.back} />;
        case "EDIT_MCP":
            return <AddMcpServer editMode name={controller.selectedTool?.name} agentNode={agent}
                onSave={controller.close} />;
        default:
            return null;
    }
}
