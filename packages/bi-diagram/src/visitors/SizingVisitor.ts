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

import { BaseVisitor, NodeMetadata } from "@wso2/ballerina-core";

import {
    AGENT_CALL_TOOL_SECTION_GAP,
    AGENT_NODE_ADD_TOOL_BUTTON_WIDTH,
    AGENT_NODE_TOOL_GAP,
    AGENT_NODE_TOOL_SECTION_GAP,
    EMPTY_NODE_CONTAINER_WIDTH,
    END_NODE_WIDTH,
    IF_NODE_WIDTH,
    LABEL_HEIGHT,
    LABEL_WIDTH,
    LAST_NODE,
    NODE_BORDER_WIDTH,
    NODE_GAP_X,
    NODE_GAP_Y,
    NODE_HEIGHT,
    NODE_WIDTH,
    PROMPT_NODE_HEIGHT,
    PROMPT_NODE_WIDTH,
    WAIT_DATA_CORE_HEIGHT,
    WAIT_DATA_CORE_WIDTH,
    WAIT_DATA_ARROW_WIDTH,
    WAIT_DATA_DETAILS_GAP,
    WAIT_DATA_DETAILS_WIDTH,
    WHILE_NODE_WIDTH,
} from "../resources/constants";
import { reverseCustomNodeId } from "../utils/node";
import { Branch, FlowNode } from "../utils/types";

export class SizingVisitor implements BaseVisitor {
    private skipChildrenVisit = false;

    constructor() {
        // console.log(">>> sizing visitor started");
    }

    private setNodeSize(
        node: FlowNode | Branch,
        leftWidth: number,
        rightWidth: number,
        height: number,
        containerLeftWidth?: number,
        containerRightWidth?: number,
        containerHeight?: number
    ): void {
        if (!node.viewState) {
            console.error(">>> Node view state is not defined", { node });
            return;
        }

        // Set basic widths and height
        node.viewState.lw = leftWidth;
        node.viewState.rw = rightWidth;
        node.viewState.h = height;

        // Set container dimensions
        node.viewState.clw = containerLeftWidth || leftWidth;
        node.viewState.crw = containerRightWidth || rightWidth;
        node.viewState.ch = containerHeight || height;
    }

    private createBaseNode(node: FlowNode): void {
        const totalWidth = NODE_WIDTH;
        const halfWidth = totalWidth / 2;
        let height = NODE_HEIGHT + NODE_BORDER_WIDTH * 2;

        if (node.properties?.variable?.value || node.properties?.type?.value) {
            height += LABEL_HEIGHT;
        }

        this.setNodeSize(node, halfWidth, halfWidth, height);
    }

    private createApiCallNode(node: FlowNode): void {
        const nodeWidth = NODE_WIDTH;
        const halfNodeWidth = nodeWidth / 2;
        const containerLeftWidth = halfNodeWidth;
        const containerRightWidth = halfNodeWidth + NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT;

        const nodeHeight = NODE_HEIGHT;
        let containerHeight = nodeHeight;
        if (node.properties?.variable?.value || node.properties?.type?.value) {
            containerHeight += LABEL_HEIGHT;
        }

        this.setNodeSize(node, containerLeftWidth, containerRightWidth, containerHeight);
    }

    private createSendDataNode(node: FlowNode): void {
        const nodeWidth = NODE_WIDTH;
        const halfNodeWidth = nodeWidth / 2;
        const containerLeftWidth = halfNodeWidth;
        const containerRightWidth = halfNodeWidth + NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT;

        // Send data nodes always render the right-side workflow square with label-space SVG height.
        const containerHeight = NODE_HEIGHT + LABEL_HEIGHT;

        this.setNodeSize(node, containerLeftWidth, containerRightWidth, containerHeight);
    }

    private createWaitDataNode(node: FlowNode): void {
        const halfCircle = WAIT_DATA_CORE_WIDTH / 2;
        const leftWidth = halfCircle + WAIT_DATA_ARROW_WIDTH;
        const containerLeftWidth = leftWidth;
        const containerRightWidth = halfCircle + WAIT_DATA_DETAILS_GAP + WAIT_DATA_DETAILS_WIDTH;
        const containerHeight = WAIT_DATA_CORE_HEIGHT;
        this.setNodeSize(
            node,
            leftWidth,
            halfCircle,
            containerHeight,
            containerLeftWidth,
            containerRightWidth,
            containerHeight
        );
    }

    private createBlockNode(node: Branch): void {
        // get max width of children and sum of heights
        let leftWidth = 0;
        let rightWidth = 0;
        let height = 0;
        if (node.children) {
            node.children.forEach((child: FlowNode) => {
                if (child.viewState) {
                    leftWidth = Math.max(leftWidth, child.viewState.clw);
                    rightWidth = Math.max(rightWidth, child.viewState.crw);
                    if (height > 0) {
                        // add link heights
                        height += NODE_GAP_Y;
                    }
                    height += child.viewState.ch;
                }
            });
        }
        height = Math.max(height, NODE_HEIGHT * 2);
        this.setNodeSize(node, leftWidth, rightWidth, height);
    }

    private validateNode(node: FlowNode | Branch): boolean {
        if (this.skipChildrenVisit) {
            return false;
        }
        if (!node.viewState) {
            // console.error(">>> Node view state is not defined", { node });
            return false;
        }
        return true;
    }

    endVisitNode = (node: FlowNode): void => {
        if (!this.validateNode(node)) return;
        this.createBaseNode(node);
    };

    endVisitEventStart(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        // consider this as a start node
        const width = Math.round(NODE_WIDTH / 3);
        const height = Math.round(NODE_HEIGHT / 1.5) + NODE_BORDER_WIDTH * 2;
        const halfWidth = width / 2;
        this.setNodeSize(node, halfWidth, halfWidth, height);
    }

    endVisitIf(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        // first branch
        const firstBranchWidthViewState = node.branches.at(0)?.viewState;
        if (!firstBranchWidthViewState) {
            console.error("No first branch view state found in if node", node);
            return;
        }
        // last branch
        const lastBranchWidthViewState = node.branches.at(-1)?.viewState;
        if (!lastBranchWidthViewState) {
            console.error("No last branch view state found in if node", node);
            return;
        }
        const middleBranchesWidth = node.branches.slice(1, -1).reduce((acc, branch) => {
            if (!branch?.viewState) {
                console.error("Branch view state is not defined", branch);
                return acc;
            }
            return acc + branch.viewState?.clw + branch.viewState?.crw;
        }, 0);
        // if bar width
        const ifBarWidth =
            firstBranchWidthViewState?.crw +
            middleBranchesWidth +
            lastBranchWidthViewState?.clw +
            NODE_GAP_X * (node.branches.length - 1);
        // if node container left width
        const ifNodeContainerLeftWidth = firstBranchWidthViewState?.clw + ifBarWidth / 2;
        // if node container right width
        const ifNodeContainerRightWidth = ifBarWidth / 2 + lastBranchWidthViewState?.crw;

        // if node container height
        let containerHeight = 0;
        if (node.branches) {
            node.branches.forEach((child: Branch) => {
                if (child.viewState) {
                    containerHeight = Math.max(containerHeight, Math.max(child.viewState.ch, NODE_GAP_Y));
                }
            });
        }
        // add if node width and height
        containerHeight += IF_NODE_WIDTH + (NODE_GAP_Y * 5) / 2;

        const halfNodeWidth = IF_NODE_WIDTH / 2;
        const nodeHeight = IF_NODE_WIDTH;

        this.setNodeSize(
            node,
            halfNodeWidth,
            halfNodeWidth,
            nodeHeight,
            ifNodeContainerLeftWidth,
            ifNodeContainerRightWidth,
            containerHeight
        );
    }

    endVisitMatch(node: FlowNode, parent?: FlowNode): void {
        this.endVisitIf(node, parent);
    }

    endVisitConditional(node: Branch, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.createBlockNode(node);
    }

    // while, foreach, error handler
    endVisitBody(node: Branch, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.createBlockNode(node);
    }

    endVisitOnFailure(node: Branch, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.createBlockNode(node);
    }

    endVisitElse(node: Branch, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.createBlockNode(node);
    }

    endVisitRemoteActionCall(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.createApiCallNode(node);
    }

    endVisitResourceActionCall(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.createApiCallNode(node);
    }

    endVisitVectorKnowledgeBaseCall(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.createApiCallNode(node);
    }

    endVisitWorkflowRun(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.createBaseNode(node);
    }

    endVisitActivityCall(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.createBaseNode(node);
    }

    endVisitSendData(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.createSendDataNode(node);
    }

    endVisitAgent(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        const halfNodeWidth = NODE_WIDTH / 2;
        const containerLeftWidth = halfNodeWidth;
        const containerRightWidth = halfNodeWidth + NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT + LABEL_WIDTH;
        const nodeMetadata = node.metadata.data as NodeMetadata;
        const tools = nodeMetadata?.agentInfo?.tools || [];
        const numberOfCircles = tools.length || 0;
        let containerHeight = NODE_HEIGHT + AGENT_NODE_TOOL_SECTION_GAP + AGENT_NODE_ADD_TOOL_BUTTON_WIDTH + AGENT_NODE_TOOL_GAP * 2;
        if (numberOfCircles > 0) {
            containerHeight += numberOfCircles * (NODE_HEIGHT + AGENT_NODE_TOOL_GAP);
        }
        this.setNodeSize(node, containerLeftWidth, containerRightWidth, containerHeight);
    }

    endVisitAgentCall(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        const nodeWidth = NODE_WIDTH;
        const halfNodeWidth = nodeWidth / 2;
        const containerLeftWidth = halfNodeWidth;
        const containerRightWidth = halfNodeWidth + NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT + LABEL_WIDTH;

        // Calculate node height based on node type
        const nodeMetadata = node.metadata.data as NodeMetadata;
        const tools = nodeMetadata?.agentInfo?.tools || [];
        const numberOfCircles = tools.length || 0;
        let containerHeight = NODE_HEIGHT + AGENT_CALL_TOOL_SECTION_GAP + AGENT_NODE_TOOL_GAP * 2 + 38;
        if (numberOfCircles > 0) {
            containerHeight += numberOfCircles * (NODE_HEIGHT + AGENT_NODE_TOOL_GAP);
        }
        this.setNodeSize(node, containerLeftWidth, containerRightWidth, containerHeight);
    }

    endVisitAgentRun(node: FlowNode, parent?: FlowNode): void {
        this.endVisitAgentCall(node, parent);
    }

    endVisitAgentType(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        const halfNodeWidth = NODE_WIDTH / 2;
        const containerLeftWidth = halfNodeWidth;
        const containerRightWidth = halfNodeWidth + NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT + LABEL_WIDTH;
        const nodeMetadata = node.metadata.data as NodeMetadata;
        const agentInfo = nodeMetadata?.agentInfo;
        const memoryHeight = agentInfo?.memory?.propertyKey ? 52 : 0;
        const hasPrompt = Boolean(agentInfo?.systemPrompt?.role && agentInfo?.systemPrompt?.instructions);
        const descriptionHeight = hasPrompt ? 115 : agentInfo?.description ? 95 : 0;
        const boxHeight = NODE_HEIGHT + memoryHeight + descriptionHeight;
        const toolCount = (agentInfo?.tools || []).length;
        const baseHeight = NODE_HEIGHT + AGENT_NODE_TOOL_SECTION_GAP;
        const toolsHeight = toolCount * (NODE_HEIGHT + AGENT_NODE_TOOL_GAP);
        const containerHeight = Math.max(boxHeight, baseHeight + toolsHeight);
        this.setNodeSize(node, containerLeftWidth, containerRightWidth, containerHeight);
    }

    endVisitEmpty(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        if (reverseCustomNodeId(node.id).label === LAST_NODE) {
            const halfWidth = END_NODE_WIDTH / 2;
            const containerHalfWidth = EMPTY_NODE_CONTAINER_WIDTH / 2;
            this.setNodeSize(
                node,
                halfWidth,
                halfWidth,
                END_NODE_WIDTH,
                containerHalfWidth,
                containerHalfWidth,
                NODE_HEIGHT
            );
            return;
        }
        const halfWidth = END_NODE_WIDTH / 2;
        const containerHalfWidth = EMPTY_NODE_CONTAINER_WIDTH / 2;
        this.setNodeSize(
            node,
            halfWidth,
            halfWidth,
            END_NODE_WIDTH,
            containerHalfWidth,
            containerHalfWidth,
            END_NODE_WIDTH
        );
    }

    endVisitComment(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        // Comment nodes are not rendered; their content is shown as a note chip on the next node.
        // Setting size to 0 ensures no layout gap is created.
        this.setNodeSize(node, 0, 0, 0);
    }

    private visitContainerNode(node: FlowNode, topElementWidth: number) {
        let containerLeftWidth = 0;
        let containerRightWidth = 0;
        let containerHeight = 0;
        if (node.branches && node.branches.length > 0) {
            const branch = node.branches.at(0);
            if (branch.viewState) {
                containerLeftWidth = Math.max(containerLeftWidth, Math.max(branch.viewState.clw, NODE_GAP_X));
                containerRightWidth = Math.max(containerRightWidth, Math.max(branch.viewState.crw, NODE_GAP_X));
                containerHeight = branch.viewState.ch;
            }
        }
        // add while node width and height
        containerHeight += topElementWidth + NODE_GAP_Y * 2;
        containerLeftWidth += NODE_GAP_X / 2;
        containerRightWidth += NODE_GAP_X / 2;

        const halfNodeWidth = topElementWidth / 2;
        const nodeHeight = topElementWidth;
        this.setNodeSize(
            node,
            halfNodeWidth,
            halfNodeWidth,
            nodeHeight,
            containerLeftWidth,
            containerRightWidth,
            containerHeight
        );
    }

    endVisitWhile(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.visitContainerNode(node, WHILE_NODE_WIDTH);
    }

    endVisitForeach(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.visitContainerNode(node, WHILE_NODE_WIDTH);
    }

    endVisitLock(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.visitContainerNode(node, WHILE_NODE_WIDTH);
    }

    endVisitErrorHandler(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;

        let containerLeftWidth = 0;
        let containerRightWidth = 0;
        let containerHeight = 0;
        if (node.branches && node.branches.length > 0) {
            const bodyBranch = node.branches.find((branch) => branch.codedata.node === "BODY");
            if (bodyBranch.viewState) {
                containerLeftWidth = Math.max(containerLeftWidth, Math.max(bodyBranch.viewState.clw, NODE_GAP_X));
                containerRightWidth = Math.max(containerRightWidth, Math.max(bodyBranch.viewState.crw, NODE_GAP_X));
                bodyBranch.viewState.ch += NODE_GAP_Y;
                containerHeight = bodyBranch.viewState.ch;
            }
            const onFailureBranch = node.branches.find((branch) => branch.codedata.node === "ON_FAILURE");
            if (onFailureBranch.viewState) {
                containerLeftWidth = Math.max(containerLeftWidth, Math.max(onFailureBranch.viewState.clw, NODE_GAP_X));
                containerRightWidth = Math.max(
                    containerRightWidth,
                    Math.max(onFailureBranch.viewState.crw, NODE_GAP_X)
                );
                containerHeight = bodyBranch.viewState.ch + onFailureBranch.viewState.ch + NODE_GAP_Y;
            }
        }
        // add while node width and height
        containerHeight += WHILE_NODE_WIDTH + NODE_GAP_Y;
        containerLeftWidth += NODE_GAP_X / 2;
        containerRightWidth += NODE_GAP_X / 2;

        const halfNodeWidth = WHILE_NODE_WIDTH / 2;
        const nodeHeight = WHILE_NODE_WIDTH;
        this.setNodeSize(
            node,
            halfNodeWidth,
            halfNodeWidth,
            nodeHeight,
            containerLeftWidth,
            containerRightWidth,
            containerHeight
        );
    }

    endVisitFork(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;

        if (!node.branches) {
            return;
        }

        // first branch
        const firstBranchWidthViewState = node.branches.at(0)?.viewState;
        if (!firstBranchWidthViewState) {
            console.error("No first branch view state found in fork node", node);
            return;
        }
        // last branch
        const lastBranchWidthViewState = node.branches.at(-1)?.viewState;
        if (!lastBranchWidthViewState) {
            console.error("No last branch view state found in fork node", node);
            return;
        }
        // middle branches width
        const middleBranchesWidth = node.branches.slice(1, -1).reduce((acc, branch) => {
            if (!branch?.viewState) {
                console.error("Branch view state is not defined", branch);
                return acc;
            }
            return acc + branch.viewState?.clw + branch.viewState?.crw;
        }, 0);
        const topBarWidth =
            firstBranchWidthViewState?.crw +
            middleBranchesWidth +
            lastBranchWidthViewState?.clw +
            NODE_GAP_X * (node.branches.length - 1);
        // node container left width
        const nodeContainerLeftWidth = firstBranchWidthViewState?.clw + topBarWidth / 2;
        // node container right width
        const nodeContainerRightWidth = topBarWidth / 2 + lastBranchWidthViewState?.crw;

        // node container height
        let containerHeight = 0;
        if (node.branches) {
            node.branches.forEach((child: Branch) => {
                if (child.viewState) {
                    containerHeight = Math.max(containerHeight, Math.max(child.viewState.ch, NODE_GAP_Y));
                }
            });
        }
        // add if node width and height
        containerHeight += WHILE_NODE_WIDTH + NODE_GAP_Y;

        const halfNodeWidth = WHILE_NODE_WIDTH / 2;
        const nodeHeight = WHILE_NODE_WIDTH;

        this.setNodeSize(
            node,
            halfNodeWidth,
            halfNodeWidth,
            nodeHeight,
            nodeContainerLeftWidth,
            nodeContainerRightWidth,
            containerHeight
        );
    }

    endVisitWorker(node: Branch, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.createBlockNode(node);
    }

    endVisitWaitData(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.createWaitDataNode(node);
    }

    endVisitNpFunction(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;

        const halfNodeWidth = PROMPT_NODE_WIDTH / 2;
        const nodeHeight = PROMPT_NODE_HEIGHT;

        this.setNodeSize(
            node,
            halfNodeWidth,
            halfNodeWidth,
            nodeHeight
        );
    }

    skipChildren(): boolean {
        return this.skipChildrenVisit;
    }
}
