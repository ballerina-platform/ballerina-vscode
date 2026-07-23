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

import { NodeMetadata } from "@wso2/ballerina-core";
import {
    AGENT_CALL_TOOL_SECTION_GAP,
    AGENT_NODE_ADD_TOOL_BUTTON_WIDTH,
    AGENT_NODE_TOOL_GAP,
    AGENT_NODE_TOOL_SECTION_GAP,
    NODE_HEIGHT,
    NodeTypes,
} from "../../../resources/constants";
import { FlowNode } from "../../../utils/types";

export type AgentWidgetType = NodeTypes.AGENT_NODE | NodeTypes.AGENT_TYPE_NODE | NodeTypes.AGENT_CALL_NODE;

const layoutStrategies = {
    [NodeTypes.AGENT_NODE]: (toolHeight: number) => NODE_HEIGHT + AGENT_NODE_TOOL_SECTION_GAP
        + AGENT_NODE_ADD_TOOL_BUTTON_WIDTH + AGENT_NODE_TOOL_GAP * 2 + toolHeight,
    [NodeTypes.AGENT_TYPE_NODE]: (toolHeight: number, agentInfo?: NodeMetadata["agentInfo"]) => {
        const memoryHeight = agentInfo?.memory?.propertyKey ? 52 : 0;
        const hasPrompt = Boolean(agentInfo?.systemPrompt?.role && agentInfo?.systemPrompt?.instructions);
        const descriptionHeight = hasPrompt ? 115 : agentInfo?.description ? 95 : 0;
        return Math.max(NODE_HEIGHT + memoryHeight + descriptionHeight, NODE_HEIGHT + AGENT_NODE_TOOL_SECTION_GAP + toolHeight);
    },
    [NodeTypes.AGENT_CALL_NODE]: (toolHeight: number) => NODE_HEIGHT + AGENT_CALL_TOOL_SECTION_GAP
        + AGENT_NODE_TOOL_GAP * 2 + 38 + toolHeight,
} satisfies Record<AgentWidgetType, (toolHeight: number, agentInfo?: NodeMetadata["agentInfo"]) => number>;

export function getAgentNodeContainerHeight(node: FlowNode, type: AgentWidgetType): number {
    const agentInfo = (node.metadata?.data as NodeMetadata | undefined)?.agentInfo;
    const toolCount = agentInfo?.tools?.length ?? 0;
    const toolHeight = toolCount * (NODE_HEIGHT + AGENT_NODE_TOOL_GAP);
    return layoutStrategies[type](toolHeight, agentInfo);
}
