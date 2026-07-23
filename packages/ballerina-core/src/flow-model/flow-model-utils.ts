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

import { AgentToolData, FlowNode, Property } from "../interfaces/bi";

import { Flow } from "../interfaces/bi";
import { ToolParameters } from "../rpc-types/ai-agent/interfaces";
import { BaseVisitor } from "./BaseVisitor";

const metaNodes = ["viewState", "position", "parent"];

export function traverseFlow(flow: Flow, visitor: BaseVisitor, parent?: FlowNode) {
    let lastNode: FlowNode = undefined;
    flow.nodes.forEach((node) => {
        traverseNode(node, visitor, parent || lastNode);
        lastNode = node;
    });
}

export function traverseNode(node: FlowNode, visitor: BaseVisitor, parent?: FlowNode) {
    if (!node.codedata.node) {
        console.warn("FlowNode kind is not defined", node);
        return;
    }
    let name = "";
    // convert this kind to a camel case string
    node.codedata.node.split("_").forEach((kind) => {
        name += kind.charAt(0).toUpperCase() + kind.slice(1).toLowerCase();
    });

    let beginVisitFn: any = (visitor as any)[`beginVisit${name}`];
    if (!beginVisitFn) {
        beginVisitFn = visitor.beginVisitNode && visitor.beginVisitNode;
    }

    if (beginVisitFn) {
        beginVisitFn.bind(visitor)(node, parent);
    }

    const keys = Object.keys(node);
    keys.forEach((key) => {
        if (metaNodes.includes(key) || visitor.skipChildren()) {
            return;
        }

        const childNode = (node as any)[key] as any;
        if (Array.isArray(childNode)) {
            childNode.forEach((elementNode) => {

                // HACK: remove this after fixing the getFlowNode response
                // if(elementNode && elementNode.kind && !elementNode.codedata.node){
                //     elementNode.codedata.node = elementNode.kind;
                //     console.warn("HACK: copied node kind to codedata", elementNode);
                // }

                if (!elementNode?.codedata.node) {
                    console.warn("Child node kind is not defined", elementNode);
                    return;
                }

                traverseNode(elementNode, visitor, node);
            });
            return;
        }

        if (!childNode?.codedata?.node) {
            return;
        }

        traverseNode(childNode, visitor, node);
    });

    let endVisitFn: any = (visitor as any)[`endVisit${name}`];
    if (!endVisitFn) {
        endVisitFn = visitor.endVisitNode && visitor.endVisitNode;
    }

    if (endVisitFn) {
        endVisitFn.bind(visitor)(node, parent);
    }
}

export interface AgentToolHostClass {
    className: string;
    filePath: string;
}

export function buildAgentToolNode(wrappedNode: FlowNode, toolName: string, description: string, connection: string,
    toolParameters?: ToolParameters, hostClass?: AgentToolHostClass): FlowNode {
    const auth = wrappedNode.codedata.data?.auth;
    const data: AgentToolData = {
        node: wrappedNode,
        connection,
        description,
        ...(typeof auth === "string" ? { auth } : {}),
        ...(hostClass ? { hostClassName: hostClass.className, filePath: hostClass.filePath } : {}),
    };
    return createAgentToolNode(toolName, data, toolParameters ? { parameters: toolParameters } : {});
}

export function buildAgentCallToolNode(toolName: string, agentVarName: string, includeContext: boolean,
    description: string, hostClass?: AgentToolHostClass, agentReceiver?: string): FlowNode {
    const data: AgentToolData = {
        toolKind: "AGENT_CALL",
        agentVarName,
        includeContext,
        description,
        ...(agentReceiver ? { agentReceiver } : {}),
        ...(hostClass ? { hostClassName: hostClass.className, filePath: hostClass.filePath } : {}),
    };
    return createAgentToolNode(toolName, data);
}

function createAgentToolNode(toolName: string, data: AgentToolData, extraProperties: FlowNode["properties"] = {}): FlowNode {
    return {
        id: "0",
        metadata: { label: "Agent Tool", description: "" },
        codedata: { node: "AGENT_TOOL", isNew: true, data },
        properties: {
            functionName: {
                metadata: { label: "Name", description: "Name of the tool" },
                valueType: "IDENTIFIER",
                value: toolName,
                optional: false,
                editable: true,
                advanced: false,
            } as Property,
            ...extraProperties,
        },
        branches: [],
        returning: false,
    };
}
