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

import { BaseVisitor } from "@wso2/ballerina-core";

import {
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
    NODE_PADDING,
    NODE_WIDTH,
    PROMPT_NODE_HEIGHT,
    PROMPT_NODE_WIDTH,
    WAIT_DATA_CORE_HEIGHT,
    WAIT_DATA_CORE_WIDTH,
    WAIT_DATA_ARROW_WIDTH,
    WAIT_DATA_DETAILS_GAP,
    WAIT_DATA_DETAILS_WIDTH,
    WHILE_NODE_WIDTH,
    NodeTypes,
} from "../resources/constants";
import { getEvalNodeContainerHeight } from "../components/nodes/EvalNode/evalNodePresentation";
import { isEvalTemplateCall, NodeMetadata } from "@wso2/ballerina-core";
import { getAgentNodeContainerHeight } from "../components/nodes/AgentWidget/agentNodeLayout";
import { isWaitingAgentCall, reverseCustomNodeId } from "../utils/node";
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
        // The mirror of a send: same body, with the room for the source box and its arrow on the
        // left instead of the right.
        const halfNodeWidth = NODE_WIDTH / 2;
        // The widths are the node's own bounds, not an inner box's: passing the body's half-width
        // while the container reached further left put the body off the node's centre, and the
        // links bent sideways to meet it. LABEL_WIDTH keeps the source's name from being clipped.
        const containerLeftWidth = halfNodeWidth + NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT;
        const containerRightWidth = halfNodeWidth;
        const containerHeight = NODE_HEIGHT + LABEL_HEIGHT;
        this.setNodeSize(node, containerLeftWidth, containerRightWidth, containerHeight);
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
        if (isEvalTemplateCall(node)) {
            this.createEvalNode(node);
            return;
        }
        this.createBaseNode(node);
    };

    private createEvalNode(node: FlowNode): void {
        const halfNodeWidth = NODE_WIDTH / 2;
        const containerRightWidth = halfNodeWidth + NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT + LABEL_WIDTH;
        this.setNodeSize(node, halfNodeWidth, containerRightWidth, getEvalNodeContainerHeight(node));
    }

    endVisitEventStart(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        // consider this as a start node
        // Size the pill to fit its label (e.g. "Configure Agent") instead of clipping it;
        // ~8px per character at the 14px GilmerMedium label font, plus the pill padding.
        const label = node.metadata?.label || "Start";
        const labelWidth = label.length * 8 + NODE_PADDING * 2 + NODE_BORDER_WIDTH * 2;
        const width = Math.max(Math.round(NODE_WIDTH / 3), Math.min(labelWidth, NODE_WIDTH));
        const height = Math.round(NODE_HEIGHT / 1.5) + NODE_BORDER_WIDTH * 2;
        const halfWidth = width / 2;
        this.setNodeSize(node, halfWidth, halfWidth, height);
    }

    // Container left/right widths for a row of branch lanes joined by a horizontal bar.
    // Callers pass only defined view states (see collectBranchViewStates), and the row is
    // never empty, so first/last are safe to index directly.
    private computeBranchRowWidths(branchViewStates: NonNullable<Branch["viewState"]>[]): { left: number; right: number } {
        const first = branchViewStates[0];
        const last = branchViewStates[branchViewStates.length - 1];
        const middleBranchesWidth = branchViewStates
            .slice(1, -1)
            .reduce((acc, viewState) => acc + viewState.clw + viewState.crw, 0);
        const barWidth = first.crw + middleBranchesWidth + last.clw + NODE_GAP_X * (branchViewStates.length - 1);
        return { left: first.clw + barWidth / 2, right: barWidth / 2 + last.crw };
    }

    // Tallest branch lane in the row (each lane counts at least one node gap).
    private computeBranchRowHeight(branchViewStates: NonNullable<Branch["viewState"]>[]): number {
        return branchViewStates.reduce((max, viewState) => Math.max(max, Math.max(viewState.ch, NODE_GAP_Y)), 0);
    }

    // The defined view states of a node's branches, narrowed so callers get non-optional
    // elements (a branch without layout can't contribute to sizing).
    private collectBranchViewStates(node: FlowNode): NonNullable<Branch["viewState"]>[] {
        return node.branches
            .map((branch) => branch.viewState)
            .filter((viewState): viewState is NonNullable<Branch["viewState"]> => viewState !== undefined);
    }

    endVisitIf(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        const branchViewStates = this.collectBranchViewStates(node);
        if (branchViewStates.length === 0) {
            console.error("No branch view states found in if node", node);
            return;
        }

        const { left, right } = this.computeBranchRowWidths(branchViewStates);
        // add if node width and height
        const containerHeight = this.computeBranchRowHeight(branchViewStates) + IF_NODE_WIDTH + (NODE_GAP_Y * 5) / 2;

        const halfNodeWidth = IF_NODE_WIDTH / 2;
        this.setNodeSize(node, halfNodeWidth, halfNodeWidth, IF_NODE_WIDTH, left, right, containerHeight);
    }

    endVisitMatch(node: FlowNode, parent?: FlowNode): void {
        this.endVisitIf(node, parent);
    }

    // Synthetic review-diff container: removed/added lanes side by side, headless
    // (no visible widget of its own, unlike the IF diamond).
    endVisitDiffHunk(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        const branchViewStates = this.collectBranchViewStates(node);
        if (branchViewStates.length === 0) {
            console.error("No branch view states found in diff hunk node", node);
            return;
        }

        // a single lane sits inline, so the container is just that lane's width
        const onlyLane = branchViewStates.length === 1 ? branchViewStates[0] : undefined;
        const { left, right } = onlyLane
            ? { left: onlyLane.clw, right: onlyLane.crw }
            : this.computeBranchRowWidths(branchViewStates);
        // add fork gap above the lanes and join gap below them
        const containerHeight = this.computeBranchRowHeight(branchViewStates) + NODE_GAP_Y + NODE_GAP_Y / 2;

        this.setNodeSize(node, 0, 0, 0, left, right, containerHeight);
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
        // Drawn as an action, so measured as one — same as the child-workflow start.
        this.createApiCallNode(node);
    }

    endVisitActivityCall(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.createBaseNode(node);
    }

    endVisitConnectionActivityCall(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        // Connection-backed activity calls render like action calls, reserving right-side space for
        // the connection arrow and endpoint.
        this.createApiCallNode(node);
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
        const containerHeight = getAgentNodeContainerHeight(node, NodeTypes.AGENT_NODE);
        this.setNodeSize(node, containerLeftWidth, containerRightWidth, containerHeight);
    }

    endVisitAgentCall(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        const nodeWidth = NODE_WIDTH;
        const halfNodeWidth = nodeWidth / 2;
        const containerLeftWidth = halfNodeWidth;
        const containerRightWidth = halfNodeWidth + NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT + LABEL_WIDTH;

        const containerHeight = getAgentNodeContainerHeight(node, NodeTypes.AGENT_CALL_NODE);
        this.setNodeSize(node, containerLeftWidth, containerRightWidth, containerHeight);
    }

    endVisitAgentRun(node: FlowNode, parent?: FlowNode): void {
        this.endVisitAgentCall(node, parent);
    }

    endVisitTypedAgent(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        const halfNodeWidth = NODE_WIDTH / 2;
        const containerLeftWidth = halfNodeWidth;
        const containerRightWidth = halfNodeWidth + NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT + LABEL_WIDTH;
        const containerHeight = getAgentNodeContainerHeight(node, NodeTypes.TYPED_AGENT_NODE);
        this.setNodeSize(node, containerLeftWidth, containerRightWidth, containerHeight);
    }

    endVisitDurableAgentRun(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;

        // Draft placeholder ("Define Durable Agentic Workflow") renders as a plain dashed box
        // without the side circle columns, so no side space is reserved.
        if (node.metadata?.draft) {
            const halfWidth = NODE_WIDTH / 2;
            this.setNodeSize(node, halfWidth, halfWidth, NODE_HEIGHT + LABEL_HEIGHT * 2);
            return;
        }

        const halfNodeWidth = NODE_WIDTH / 2;
        const sideColumnWidth = NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT + LABEL_WIDTH;

        const nodeMetadata = node.metadata.data as NodeMetadata & {
            tools?: unknown[];
            activities?: unknown[];
            humanTasks?: unknown[];
            events?: unknown[];
            peers?: unknown[];
            agentBox?: boolean;
            agentName?: string;
        };

        // The in-chain buildAndRun statement ("Build Agent") renders as a compact node like
        // the other register statements; only the synthetic agent-box copy (agentBox flag)
        // gets the big visualization with the side circle columns.
        if (!nodeMetadata?.agentBox) {
            let height = NODE_HEIGHT + NODE_BORDER_WIDTH * 2;
            if (nodeMetadata?.agentName || node.metadata?.description) {
                height += LABEL_HEIGHT;
            }
            this.setNodeSize(node, halfNodeWidth, halfNodeWidth, height);
            return;
        }

        // Left column: human task and event circles (arrows point into the box).
        const leftCircles = (nodeMetadata?.humanTasks?.length || 0) + (nodeMetadata?.events?.length || 0);
        // Right column: the model circle plus AI tool, activity and peer circles — the same set the
        // widget paints there, so the reserved rows match the painted rows.
        const rightCircles =
            1 +
            (nodeMetadata?.tools?.length || 0) +
            (nodeMetadata?.activities?.length || 0) +
            (nodeMetadata?.peers?.length || 0);

        // Reserve left-side space only when left circles exist (the widget skips the left svg otherwise).
        const containerLeftWidth = halfNodeWidth + (leftCircles > 0 ? sideColumnWidth : 0);
        // Reserve right-side space for the model circle and capability circles column.
        const containerRightWidth = halfNodeWidth + sideColumnWidth;

        // Height must fit the taller of the two circle columns; row 0 holds the model circle
        // (and the first left circle), remaining rows are offset by the tool section gap.
        const numberOfRows = Math.max(leftCircles, rightCircles);
        const containerHeight =
            NODE_HEIGHT +
            AGENT_NODE_TOOL_SECTION_GAP +
            AGENT_NODE_TOOL_GAP * 2 +
            (numberOfRows - 1) * (NODE_HEIGHT + AGENT_NODE_TOOL_GAP);
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

        const branchViewStates = this.collectBranchViewStates(node);
        if (branchViewStates.length === 0) {
            console.error("No branch view states found in fork node", node);
            return;
        }

        const { left: nodeContainerLeftWidth, right: nodeContainerRightWidth } =
            this.computeBranchRowWidths(branchViewStates);
        const containerHeight = this.computeBranchRowHeight(branchViewStates) + WHILE_NODE_WIDTH + NODE_GAP_Y;

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

    // Child workflow nodes reuse the workflow-run/send/wait shapes, so they are measured with them.
    endVisitChildWorkflowRun(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        // Measured as the action it is drawn as, so the layout reserves the arrow and the
        // target square to its right.
        this.createApiCallNode(node);
    }

    endVisitChildWorkflowCall(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.endVisitChildWorkflowRun(node, parent);
    }

    endVisitChildWorkflowSendData(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.createSendDataNode(node);
    }

    endVisitChildWorkflowWait(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.createWaitDataNode(node);
    }

    // The durable agent send/wait nodes reuse the workflow shapes, so they have to be measured
    // the same way — otherwise the widget draws at a size the layout never reserved.
    endVisitDurableAgentUpdate(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.createSendDataNode(node);
    }

    endVisitDurableAgentDataResult(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        if (isWaitingAgentCall(node)) {
            this.createWaitDataNode(node);
        } else {
            this.createBaseNode(node);
        }
    }

    endVisitDurableAgentResult(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.endVisitDurableAgentDataResult(node, parent);
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
