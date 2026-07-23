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
import { DiagramEngine } from "@projectstorm/react-diagrams-core";
import { FlowNode } from "../../../utils/types";
import { NodeTypes } from "../../../resources/constants";
import { AgentCallNodeModel } from "../AgentCallNode/AgentCallNodeModel";
import { AgentCallNodeWidget } from "../AgentCallNode/AgentCallNodeWidget";
import { AgentNodeModel } from "../AgentNode/AgentNodeModel";
import { AgentNodeWidget } from "../AgentNode/AgentNodeWidget";

type AgentWidgetModel = AgentNodeModel | AgentCallNodeModel;

interface AgentWidgetProps {
    model: AgentWidgetModel;
    engine: DiagramEngine;
    onClick?: (node: FlowNode) => void;
}

interface AgentWidgetVariant {
    render: (props: AgentWidgetProps) => JSX.Element;
}

const variants = {
    [NodeTypes.AGENT_NODE]: {
        render: (props) => <AgentNodeWidget {...props} model={props.model as AgentNodeModel} variant="agent" />,
    },
    [NodeTypes.AGENT_TYPE_NODE]: {
        render: (props) => <AgentNodeWidget {...props} model={props.model as AgentNodeModel} variant="agentType" />,
    },
    [NodeTypes.AGENT_CALL_NODE]: {
        render: (props) => <AgentCallNodeWidget {...props} model={props.model as AgentCallNodeModel} />,
    },
} satisfies Record<NodeTypes.AGENT_NODE | NodeTypes.AGENT_TYPE_NODE | NodeTypes.AGENT_CALL_NODE, AgentWidgetVariant>;

export function AgentWidget(props: AgentWidgetProps): JSX.Element {
    return variants[props.model.getType() as keyof typeof variants].render(props);
}
