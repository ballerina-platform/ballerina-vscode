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
    COMMENT_NODE_CIRCLE_WIDTH,
    COMMENT_NODE_GAP,
    DIAGRAM_CENTER_X,
    DRAFT_NODE_BORDER_WIDTH,
    LAST_NODE,
    NODE_GAP_X,
    NODE_GAP_Y,
    NODE_PADDING,
} from "../resources/constants";
import { reverseCustomNodeId } from "../utils/node";
import { Branch, FlowNode } from "../utils/types";

export class PositionVisitor implements BaseVisitor {
    private skipChildrenVisit = false;
    private diagramCenterX = DIAGRAM_CENTER_X;
    private lastNodeY = 200;

    constructor() {
        // console.log(">>> position visitor started");
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

    beginVisitEventStart(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        // consider this as a start node
        node.viewState.y = this.lastNodeY;
        this.lastNodeY += node.viewState.h + NODE_GAP_Y;

        if (parent?.codedata.node === "WORKER" || parent?.codedata.node === "ON_FAILURE") {
            const centerX = getTopNodeCenter(node, parent, this.diagramCenterX);
            node.viewState.x = centerX - node.viewState.lw;
        } else {
            node.viewState.x = this.diagramCenterX - node.viewState.rw;
        }
    }

    beginVisitIf(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        node.viewState.y = this.lastNodeY;
        this.lastNodeY += node.viewState.h + (NODE_GAP_Y * 4) / 2;

        const centerX = getTopNodeCenter(node, parent, this.diagramCenterX);
        node.viewState.x = centerX - node.viewState.lw;

        if (node.branches.length < 2) {
            console.error("If node should have 2 branches");
            return;
        }

        this.positionBranchLanes(node, centerX);
    }

    // Places a container's branches side by side under it, NODE_GAP_X apart,
    // all starting at the current lastNodeY. A single branch is centered.
    private positionBranchLanes(node: FlowNode, centerX: number): void {
        node.branches.forEach((branch, index) => {
            if (!branch?.viewState) {
                console.error("Branch view state is not defined", branch);
                return;
            }
            if (node.branches.length === 1) {
                branch.viewState.x = centerX - branch.viewState.clw;
            } else if (index === 0) {
                branch.viewState.x = centerX - node.viewState.clw;
            } else {
                const previousBranch = node.branches.at(index - 1);
                if (!previousBranch.viewState) {
                    console.error("Previous branch view state is not defined", previousBranch);
                    return;
                }
                branch.viewState.x =
                    previousBranch.viewState.x +
                    previousBranch.viewState.clw +
                    previousBranch.viewState.crw +
                    NODE_GAP_X;
            }
            branch.viewState.y = this.lastNodeY;
        });
    }

    endVisitIf(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.lastNodeY = node.viewState.y + node.viewState.ch + NODE_GAP_Y;
    }

    beginVisitMatch(node: FlowNode, parent?: FlowNode): void {
        this.beginVisitIf(node, parent);
    }

    endVisitMatch(node: FlowNode, parent?: FlowNode): void {
        this.endVisitIf(node, parent);
    }

    // Synthetic review-diff container: headless fork — lanes start right below the previous node.
    beginVisitDiffHunk(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        node.viewState.y = this.lastNodeY;
        this.lastNodeY += NODE_GAP_Y;

        const centerX = getTopNodeCenter(node, parent, this.diagramCenterX);
        node.viewState.x = centerX - node.viewState.lw;

        this.positionBranchLanes(node, centerX);
    }

    endVisitDiffHunk(node: FlowNode, parent?: FlowNode): void {
        this.endVisitIf(node, parent);
    }

    beginVisitConditional(node: Branch, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.lastNodeY = node.viewState.y;
    }

    beginVisitBody(node: Branch, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        // `Body` is inside `Foreach` node
        this.lastNodeY = node.viewState.y;
    }

    beginVisitOnFailure(node: Branch, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        // Added `On Error` start node initial gap here
        this.lastNodeY = node.viewState.y + NODE_GAP_Y / 2;
    }

    beginVisitElse(node: Branch, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.lastNodeY = node.viewState.y;
    }

    beginVisitNode(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        if (!node.viewState.y) {
            node.viewState.y = this.lastNodeY;
        }
        this.lastNodeY += node.viewState.h + NODE_GAP_Y;

        if (!node.viewState.x) {
            const centerX = getTopNodeCenter(node, parent, this.diagramCenterX);
            node.viewState.x = centerX - node.viewState.lw;
        }
    }

    beginVisitEmpty(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        // add empty node end of the block
        if (reverseCustomNodeId(node.id).label === LAST_NODE) {
            node.viewState.y = this.lastNodeY;
            const centerX = (parent && parent.viewState) ? parent.viewState.x + parent.viewState.lw : this.diagramCenterX;
            node.viewState.x = centerX - node.viewState.rw;
            // if top node is comment, align with comment
            if (parent.codedata.node === "COMMENT" && parent.viewState) {
                node.viewState.x = parent.viewState.x - (COMMENT_NODE_CIRCLE_WIDTH / 2 + DRAFT_NODE_BORDER_WIDTH);
            }
            return;
        }
        // normal node flow
        this.beginVisitNode(node, parent);
    }

    beginVisitComment(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        if (!node.viewState.y) {
            node.viewState.y = this.lastNodeY - COMMENT_NODE_GAP;
        }
        this.lastNodeY = node.viewState.y + node.viewState.h + COMMENT_NODE_GAP;

        if (!node.viewState.x) {
            const centerX = getTopNodeCenter(node, parent, this.diagramCenterX);
            node.viewState.x = centerX - NODE_PADDING / 2;
        }
    }

    beginVisitWhile(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        node.viewState.y = this.lastNodeY;
        this.lastNodeY += node.viewState.h + NODE_GAP_Y;

        const centerX = getTopNodeCenter(node, parent, this.diagramCenterX);
        node.viewState.x = centerX - node.viewState.lw;

        // const branch = node.branches.find((branch) => branch.label === "Body");
        const branch = node.branches.at(0);
        if (!branch?.viewState) {
            console.error("No body branch found in while node", node);
            return;
        }
        branch.viewState.y = this.lastNodeY;
        branch.viewState.x = centerX - branch.viewState.clw;
    }

    endVisitWhile(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.lastNodeY = node.viewState.y + node.viewState.ch + NODE_GAP_Y;
    }

    beginVisitForeach(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.beginVisitWhile(node, parent);
    }

    endVisitForeach(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.endVisitWhile(node, parent);
    }

    beginVisitLock(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.beginVisitWhile(node, parent);
    }

    endVisitLock(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.endVisitWhile(node, parent);
    }

    beginVisitErrorHandler(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;

        // if top level node, hide gap
        if (node.viewState.isTopLevel) {
            this.lastNodeY -= NODE_GAP_Y;
        }

        node.viewState.y = this.lastNodeY;
        this.lastNodeY += NODE_GAP_Y;

        const centerX = getTopNodeCenter(node, parent, this.diagramCenterX);
        node.viewState.x = centerX - node.viewState.lw;

        const bodyBranch = node.branches.find((branch) => branch.codedata.node === "BODY");
        if (bodyBranch?.viewState) {
            bodyBranch.viewState.y = this.lastNodeY;
            bodyBranch.viewState.x = centerX - bodyBranch.viewState.clw;
        }

        const onFailureBranch = node.branches.find((branch) => branch.codedata.node === "ON_FAILURE");
        if (onFailureBranch?.viewState) {
            onFailureBranch.viewState.y = this.lastNodeY + bodyBranch.viewState.ch + NODE_GAP_Y;
            onFailureBranch.viewState.x = centerX - onFailureBranch.viewState.clw;
        }
    }

    endVisitErrorHandler(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.lastNodeY = node.viewState.y + node.viewState.ch + NODE_GAP_Y;
    }

    beginVisitFork(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;

        node.viewState.y = this.lastNodeY;
        this.lastNodeY += node.viewState.h + NODE_GAP_Y;

        const centerX = getTopNodeCenter(node, parent, this.diagramCenterX);
        node.viewState.x = centerX - node.viewState.lw;

        node.branches?.forEach((branch, index) => {
            if (!branch?.viewState) {
                console.error("Branch view state is not defined", branch);
                return;
            }
            if (index === 0) {
                branch.viewState.x = centerX - node.viewState.clw;
            } else {
                const previousBranch = node.branches.at(index - 1);
                if (!previousBranch.viewState) {
                    console.error("Previous branch view state is not defined", previousBranch);
                    return;
                }
                branch.viewState.x =
                    previousBranch.viewState.x +
                    previousBranch.viewState.clw +
                    previousBranch.viewState.crw +
                    NODE_GAP_X;
            }
            branch.viewState.y = this.lastNodeY;
        });
    }

    endVisitFork(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.lastNodeY = node.viewState.y + node.viewState.ch + NODE_GAP_Y;
    }

    beginVisitWorker(node: Branch, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.lastNodeY = node.viewState.y;
    }

    skipChildren(): boolean {
        return this.skipChildrenVisit;
    }

    getNodePosition(node: FlowNode, parent: FlowNode) {
        return { x: node.viewState.x, y: node.viewState.y };
    }
}

// get top node center. base node is centered. base node center is the width/2. comment node is left aligned. so, center is x.
function getTopNodeCenter(node: FlowNode, parent: FlowNode, branchCenterX: number) {
    if (!parent) {
        console.error("Parent is not defined");
        return;
    }
    if (!parent.viewState) {
        console.error("Parent view state is not defined");
        return;
    }
    if (parent.codedata.node === "COMMENT") {
        return parent.viewState.x + NODE_PADDING / 2;
    }
    const centerX = parent ? parent.viewState.x + parent.viewState.lw : branchCenterX;
    return centerX;
}
