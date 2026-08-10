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

import { NodeLinkModel, NodeLinkModelOptions } from "../components/NodeLink";
import { ApiCallNodeModel } from "../components/nodes/ApiCallNode";
import { BaseNodeModel } from "../components/nodes/BaseNode";
import { ButtonNodeModel } from "../components/nodes/ButtonNode";
import { CallActivityNodeModel } from "../components/nodes/CallActivityNode";
import { DraftNodeModel } from "../components/nodes/DraftNode/DraftNodeModel";
import { EmptyNodeModel } from "../components/nodes/EmptyNode";
import { IfNodeModel } from "../components/nodes/IfNode/IfNodeModel";
import { SendDataNodeModel } from "../components/nodes/SendDataNode";
import { StartNodeModel } from "../components/nodes/StartNode/StartNodeModel";
import { WaitDataNodeModel } from "../components/nodes/WaitDataNode";
import { WhileNodeModel } from "../components/nodes/WhileNode";
import {
    BUTTON_NODE_HEIGHT,
    EMPTY_NODE_WIDTH,
    END_CONTAINER,
    LAST_NODE,
    NODE_GAP_X,
    NodeTypes,
    START_CONTAINER,
    WHILE_NODE_WIDTH,
} from "../resources/constants";
import { createNodesLink } from "../utils/diagram";
import { isEvalTemplateCall } from "@wso2/ballerina-core";
import {
    getBranchInLinkId,
    getBranchLabel,
    getCustomNodeId,
    isWaitingAgentCall,
    reverseCustomNodeId,
} from "../utils/node";
import { Branch, FlowNode, NodeModel } from "../utils/types";
import { EndNodeModel } from "../components/nodes/EndNode";
import { ErrorNodeModel } from "../components/nodes/ErrorNode";
import { AgentCallNodeModel } from "../components/nodes/AgentCallNode/AgentCallNodeModel";
import { DurableAgentRunNodeModel } from "../components/nodes/DurableAgentRunNode/DurableAgentRunNodeModel";
import { EvalNodeModel } from "../components/nodes/EvalNode/EvalNodeModel";
import { AgentNodeModel } from "../components/nodes/AgentNode/AgentNodeModel";
import { PromptNodeModel } from "../components/nodes/PromptNode/PromptNodeModel";

export class NodeFactoryVisitor implements BaseVisitor {
    nodes: NodeModel[] = [];
    links: NodeLinkModel[] = [];
    private skipChildrenVisit = false;
    private lastNodeModel: NodeModel | undefined; // last visited flow node
    private hasSuggestedNode = false;
    private linkCounter = 0;
    private visibleBtnCounter = 0;
    private pendingComments: FlowNode[] = []; // comment nodes awaiting attachment to the next node
    private nodeComments: Map<string, FlowNode[]> = new Map(); // maps node id -> preceding/trailing comments
    private lastCommentTargetId: string | undefined;

    constructor() {
        // console.log(">>> node factory visitor started");
    }

    private createNodeLinkWithCounter(sourceNode: NodeModel, targetNode: NodeModel, options?: NodeLinkModelOptions): NodeLinkModel {
        options = {
            ...options,
            linkCounter: this.linkCounter++,
        };
        return createNodesLink(sourceNode, targetNode, options);
    }

    private updateNodeLinks(node: FlowNode, nodeModel: NodeModel, options?: NodeLinkModelOptions): void {
        // Synthetic empty nodes have no widget. Keep comments pending until a real node,
        // or attach them to the preceding real node when a branch/flow ends.
        if (node.codedata.node !== "EMPTY") {
            this.flushPendingComments(node.id);
            this.lastCommentTargetId = node.id;
        }
        if (node.viewState?.startNodeId) {
            // new sub flow start
            const startNode = this.nodes.find((n) => n.getID() === node.viewState.startNodeId);
            const link = this.createNodeLinkWithCounter(startNode, nodeModel, options);
            if (link) {
                this.links.push(link);
            }
            this.lastNodeModel = undefined;
        } else if (this.lastNodeModel) {
            const link = this.createNodeLinkWithCounter(this.lastNodeModel, nodeModel, options);
            if (link) {
                this.links.push(link);
            }
        }
        this.lastNodeModel = nodeModel;
    }

    private flushPendingComments(targetId: string | undefined = this.lastCommentTargetId): void {
        if (!targetId || this.pendingComments.length === 0) {
            return;
        }
        const existing = this.nodeComments.get(targetId) ?? [];
        this.nodeComments.set(targetId, [...existing, ...this.pendingComments]);
        this.pendingComments = [];
    }

    private createBaseNode(node: FlowNode): NodeModel {
        if (!node.viewState) {
            console.error(">>> Node view state is not defined", { node });
            return;
        }
        const nodeModel = new BaseNodeModel(node);
        this.nodes.push(nodeModel);
        this.updateNodeLinks(node, nodeModel);
        return nodeModel;
    }

    private createEvalNode(node: FlowNode): NodeModel {
        const nodeModel = new EvalNodeModel(node);
        this.nodes.push(nodeModel);
        this.updateNodeLinks(node, nodeModel);
        return nodeModel;
    }

    private createApiCallNode(node: FlowNode): NodeModel {
        const nodeModel = new ApiCallNodeModel(node);
        this.nodes.push(nodeModel);
        this.updateNodeLinks(node, nodeModel);
        return nodeModel;
    }

    private createCallActivityNode(node: FlowNode): NodeModel {
        const nodeModel = new CallActivityNodeModel(node);
        this.nodes.push(nodeModel);
        this.updateNodeLinks(node, nodeModel);
        return nodeModel;
    }

    private createSendDataNode(node: FlowNode): NodeModel {
        const nodeModel = new SendDataNodeModel(node);
        this.nodes.push(nodeModel);
        this.updateNodeLinks(node, nodeModel);
        return nodeModel;
    }

    private createWaitDataNode(node: FlowNode): NodeModel {
        const nodeModel = new WaitDataNodeModel(node);
        this.nodes.push(nodeModel);
        this.updateNodeLinks(node, nodeModel);
        return nodeModel;
    }

    private createEmptyNode(id: string, x: number, y: number, visible = true, showButton = false): EmptyNodeModel {
        const nodeModel = new EmptyNodeModel(id, visible, showButton, this.visibleBtnCounter++);
        nodeModel.setPosition(x, y);
        this.nodes.push(nodeModel);
        return nodeModel;
    }

    private addSuggestionsButton(node: FlowNode): void {
        // if node is the first suggested node
        // add button node top of this node
        if (node.suggested && !this.hasSuggestedNode) {
            this.hasSuggestedNode = true;
            const buttonNodeModel = new ButtonNodeModel();
            buttonNodeModel.setPosition(
                node.viewState.x + node.viewState.lw + NODE_GAP_X / 2,
                node.viewState.y - BUTTON_NODE_HEIGHT + 10
            );
            this.nodes.push(buttonNodeModel);
        }
    }

    private getBranchStartNode(branch: Branch): NodeModel | undefined {
        // Comments render as note chips on the following node, not as widgets — skip them
        const firstChild = branch.children.find((child) => child.codedata.node !== "COMMENT");
        if (!firstChild) {
            return undefined;
        }
        let firstChildId = firstChild.id;
        if (firstChild.codedata.node === "ERROR_HANDLER" || firstChild.codedata.node === "DIFF_HUNK") {
            firstChildId = getCustomNodeId(firstChild.id, START_CONTAINER);
        }
        return this.nodes.find((n) => n.getID() === firstChildId);
    }

    private getBranchLastFlowNode(branch: Branch): FlowNode | undefined {
        // Comments render as note chips on the following node, not as widgets — skip them
        for (let i = branch.children.length - 1; i >= 0; i--) {
            const child = branch.children[i];
            if (child.codedata.node !== "COMMENT") {
                return child;
            }
        }
        return undefined;
    }

    private getBranchEndNode(branch: Branch): NodeModel | undefined {
        // get last child node model
        const lastNode = this.getBranchLastFlowNode(branch);
        if (!lastNode) {
            return;
        }
        let lastChildNodeModel: NodeModel | undefined;
        if (lastNode.codedata.node === "IF" || lastNode.codedata.node === "MATCH") {
            // if last child is IF, find endIf node
            lastChildNodeModel = this.nodes.find((n) => n.getID() === `${lastNode.id}-endif`);
        } else if (
            lastNode.codedata.node === "ERROR_HANDLER" &&
            lastNode.branches.find((b) => b.codedata.node === "ON_FAILURE")?.viewState
        ) {
            lastChildNodeModel = this.nodes.find((n) => n.getID() === getCustomNodeId(lastNode.id, END_CONTAINER));
        } else if (
            lastNode.codedata.node === "WHILE" ||
            lastNode.codedata.node === "FOREACH" ||
            lastNode.codedata.node === "FORK" ||
            lastNode.codedata.node === "LOCK" ||
            lastNode.codedata.node === "DIFF_HUNK"
        ) {
            // if last child is WHILE or FOREACH, find endwhile node
            lastChildNodeModel = this.nodes.find((n) => n.getID() === getCustomNodeId(lastNode.id, END_CONTAINER));
        } else {
            lastChildNodeModel = this.nodes.find((n) => n.getID() === lastNode.id);
        }
        return lastChildNodeModel;
    }

    getNodes(): NodeModel[] {
        return this.nodes;
    }

    getLinks(): NodeLinkModel[] {
        return this.links;
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

    beginVisitNode = (node: FlowNode): void => {
        if (!this.validateNode(node)) return;
        if (node.id) {
            if (isEvalTemplateCall(node)) {
                this.createEvalNode(node);
            } else {
                this.createBaseNode(node);
            }
            this.addSuggestionsButton(node);
        }
    }; // only ui nodes have id

    beginVisitEventStart(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        // consider this as a start node
        const nodeModel = new StartNodeModel(node);
        this.nodes.push(nodeModel);
        this.updateNodeLinks(node, nodeModel);
    }

    beginVisitIf(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        const nodeModel = new IfNodeModel(node);
        this.nodes.push(nodeModel);
        this.updateNodeLinks(node, nodeModel);
        this.addSuggestionsButton(node);
        this.lastNodeModel = undefined;
    }

    endVisitIf(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        const ifNodeModel = this.nodes.find((n) => n.getID() === node.id);
        if (!ifNodeModel) {
            console.error("If node model not found", node);
            return;
        }

        // create branches IN links
        node.branches?.forEach((branch, index) => {
            if (!branch.children || branch.children.length === 0) {
                // this empty branch will be handled in OUT links
                return;
            }
            const firstChildNodeModel = this.getBranchStartNode(branch);
            if (!firstChildNodeModel) {
                // check non empty children. empty branches will handel later in below logic
                return;
            }

            const link = this.createNodeLinkWithCounter(ifNodeModel, firstChildNodeModel, {
                id: getBranchInLinkId(node.id, branch.label, index),
                label: getBranchLabel(branch),
            });
            if (link) {
                this.links.push(link);
            }
        });

        // create branches OUT links
        const endIfEmptyNode = this.createEmptyNode(
            `${node.id}-endif`,
            node.viewState.x + node.viewState.lw - EMPTY_NODE_WIDTH / 2,
            node.viewState.y + node.viewState.ch - EMPTY_NODE_WIDTH / 2
        ); // TODO: move position logic to position visitor
        endIfEmptyNode.setParentFlowNode(node);

        let endIfLinkCount = 0;
        let allBranchesReturn = true;
        node.branches?.forEach((branch, index) => {
            if (!branch.children || branch.children.length === 0) {
                console.error("Branch children not found", branch);
                return;
            }

            // get last child node model
            const lastNode = branch.children.at(-1);
            // check last node is a returning node
            if (!lastNode.returning) {
                allBranchesReturn = false;
            }

            // handle empty nodes in empty branches
            if (
                branch.children &&
                branch.children.length === 1 &&
                branch.children.find((n) => n.codedata.node === "EMPTY")
            ) {
                // empty branch
                const branchEmptyNodeModel = branch.children.at(0);
                let branchEmptyNode = this.createEmptyNode(
                    branchEmptyNodeModel.id,
                    branchEmptyNodeModel.viewState.x,
                    branchEmptyNodeModel.viewState.y,
                    true,
                    branchEmptyNodeModel.metadata?.draft ? false : true // else branch is draft
                );
                const noElseBranch = branchEmptyNodeModel.metadata?.draft;
                const linkIn = this.createNodeLinkWithCounter(ifNodeModel, branchEmptyNode, {
                    id: getBranchInLinkId(node.id, branch.label, index),
                    label: noElseBranch ? "" : getBranchLabel(branch),
                    brokenLine: noElseBranch,
                    showAddButton: false,
                });
                const linkOut = this.createNodeLinkWithCounter(branchEmptyNode, endIfEmptyNode, {
                    brokenLine: true,
                    showAddButton: false,
                    alignBottom: true,
                });
                if (linkIn && linkOut) {
                    this.links.push(linkIn, linkOut);
                    endIfLinkCount++;
                }
                return;
            }

            const lastChildNodeModel = this.getBranchEndNode(branch);
            if (!lastChildNodeModel) {
                console.error("Cannot find last child node model in branch", branch);
                return;
            }

            const link = this.createNodeLinkWithCounter(lastChildNodeModel, endIfEmptyNode, {
                alignBottom: true,
                brokenLine: lastNode.returning,
                showAddButton: !lastNode.returning,
            });
            if (link) {
                this.links.push(link);
                endIfLinkCount++;
            }
        });

        // TODO: remove this logic after completing the error handling node
        // if (endIfLinkCount === 0 || allBranchesReturn) {
        //     // remove endIf node if no links are created
        //     const index = this.nodes.findIndex((n) => n.getID() === endIfEmptyNode.getID());
        //     if (index !== -1) {
        //         this.nodes.splice(index, 1);
        //     }
        //     return;
        // }

        this.lastNodeModel = endIfEmptyNode;
    }

    beginVisitMatch(node: FlowNode, parent?: FlowNode): void {
        this.beginVisitIf(node, parent);
    }

    endVisitMatch(node: FlowNode, parent?: FlowNode): void {
        this.endVisitIf(node, parent);
    }

    // Synthetic review-diff container: no widget of its own — an invisible fork anchor
    // connects the previous node to the removed/added lanes, and an invisible join
    // anchor connects the lanes back to the next node.
    beginVisitDiffHunk(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        const forkAnchor = this.createEmptyNode(
            getCustomNodeId(node.id, START_CONTAINER),
            node.viewState.x + node.viewState.lw - EMPTY_NODE_WIDTH / 2,
            node.viewState.y - EMPTY_NODE_WIDTH / 2,
            false
        );
        forkAnchor.setParentFlowNode(node);
        // Link from the previous node directly (not via updateNodeLinks) so a pending
        // comment chip stays available for the first real node inside the lanes.
        if (this.lastNodeModel) {
            const link = this.createNodeLinkWithCounter(this.lastNodeModel, forkAnchor);
            if (link) {
                this.links.push(link);
            }
        }
        this.lastNodeModel = undefined;
    }

    endVisitDiffHunk(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        const forkAnchor = this.nodes.find((n) => n.getID() === getCustomNodeId(node.id, START_CONTAINER));
        if (!forkAnchor) {
            console.error("Diff hunk fork anchor not found", node);
            return;
        }

        const joinAnchor = this.createEmptyNode(
            getCustomNodeId(node.id, END_CONTAINER),
            node.viewState.x + node.viewState.lw - EMPTY_NODE_WIDTH / 2,
            node.viewState.y + node.viewState.ch - EMPTY_NODE_WIDTH / 2,
            false
        );
        joinAnchor.setParentFlowNode(node);

        node.branches?.forEach((branch) => {
            if (!branch.children || branch.children.length === 0) {
                console.error("Diff hunk branch has no children", branch);
                return;
            }

            const firstChildNodeModel = this.getBranchStartNode(branch);
            if (firstChildNodeModel) {
                const inLink = this.createNodeLinkWithCounter(forkAnchor, firstChildNodeModel, {
                    id: getBranchInLinkId(node.id, branch.label, 0),
                    showAddButton: false,
                });
                if (inLink) {
                    this.links.push(inLink);
                }
            }

            const lastNode = this.getBranchLastFlowNode(branch);
            const lastChildNodeModel = this.getBranchEndNode(branch);
            if (lastChildNodeModel) {
                const outLink = this.createNodeLinkWithCounter(lastChildNodeModel, joinAnchor, {
                    alignBottom: true,
                    brokenLine: lastNode?.returning,
                    showAddButton: false,
                });
                if (outLink) {
                    this.links.push(outLink);
                }
            }

            // Lane with no renderable node (safety net): keep the flow connected
            if (!firstChildNodeModel && !lastChildNodeModel) {
                const passThroughLink = this.createNodeLinkWithCounter(forkAnchor, joinAnchor, {
                    showAddButton: false,
                });
                if (passThroughLink) {
                    this.links.push(passThroughLink);
                }
            }
        });

        this.lastNodeModel = joinAnchor;
    }

    endVisitConditional(node: Branch, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.flushPendingComments();
        this.lastNodeModel = undefined;
    }

    endVisitBody(node: Branch, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        // `Body` is inside `Foreach` node
        this.flushPendingComments();
        this.lastNodeModel = undefined;
    }

    endVisitElse(node: Branch, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.flushPendingComments();
        this.lastNodeModel = undefined;
    }

    private visitContainerNode(node: FlowNode, topElementWidth: number) {
        const containerNodeModel = this.nodes.find((n) => n.getID() === node.id);
        if (!containerNodeModel) {
            console.error("Container node model not found", node);
            return;
        }

        // assume that only the body branch exist
        const branch = node.branches.at(0);
        if (!branch) {
            console.error("No body branch found in container node", node);
            return;
        }
        // Create branch's IN link
        if (branch.children && branch.children.length > 0) {
            const firstChildNodeModel = this.getBranchStartNode(branch);
            if (firstChildNodeModel) {
                const link = this.createNodeLinkWithCounter(containerNodeModel, firstChildNodeModel);
                if (link) {
                    this.links.push(link);
                }
            }
        }

        // create branch's OUT link
        const endContainerEmptyNode = this.createEmptyNode(
            getCustomNodeId(node.id, END_CONTAINER),
            node.viewState.x + topElementWidth / 2 - EMPTY_NODE_WIDTH / 2,
            node.viewState.y - EMPTY_NODE_WIDTH / 2 + node.viewState.ch
        );
        endContainerEmptyNode.setParentFlowNode(node);
        this.lastNodeModel = endContainerEmptyNode;

        if (
            branch.children &&
            branch.children.length === 1 &&
            branch.children.find((n) => n.codedata.node === "EMPTY")
        ) {
            const branchEmptyNodeModel = branch.children.at(0);

            let branchEmptyNode = this.createEmptyNode(
                branchEmptyNodeModel.id,
                node.viewState.x + topElementWidth / 2 - EMPTY_NODE_WIDTH / 2,
                branchEmptyNodeModel.viewState.y,
                true,
                true
            );
            const linkIn = this.createNodeLinkWithCounter(containerNodeModel, branchEmptyNode, {
                showAddButton: false,
            });
            const linkOut = this.createNodeLinkWithCounter(branchEmptyNode, endContainerEmptyNode, {
                showAddButton: false,
                alignBottom: true,
            });
            if (linkIn && linkOut) {
                this.links.push(linkIn, linkOut);
            }
            return;
        }

        const lastNode = branch.children.at(-1);
        const lastChildNodeModel = this.getBranchEndNode(branch);
        if (!lastChildNodeModel) {
            console.error("Cannot find last child node model in branch", branch);
            return;
        }

        const endLink = this.createNodeLinkWithCounter(lastChildNodeModel, endContainerEmptyNode, {
            alignBottom: true,
            showAddButton: !lastNode.returning,
        });
        if (endLink) {
            this.links.push(endLink);
        }
    }

    beginVisitWhile(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        const nodeModel = new WhileNodeModel(node);
        this.nodes.push(nodeModel);
        this.updateNodeLinks(node, nodeModel);
        this.addSuggestionsButton(node);
        this.lastNodeModel = undefined;
    }

    endVisitWhile(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.visitContainerNode(node, WHILE_NODE_WIDTH);
    }

    beginVisitForeach(node: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.beginVisitWhile(node);
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

        // add empty node start of the error handler boundary
        const containerStartEmptyNode = this.createEmptyNode(
            getCustomNodeId(node.id, START_CONTAINER),
            node.viewState.x + node.viewState.lw - EMPTY_NODE_WIDTH / 2,
            node.viewState.y - EMPTY_NODE_WIDTH / 2,
            !node.viewState.isTopLevel
        );
        containerStartEmptyNode.setParentFlowNode(node);

        this.nodes.push(containerStartEmptyNode);
        if (!node.viewState.isTopLevel) {
            this.updateNodeLinks(node, containerStartEmptyNode);
        }
        this.addSuggestionsButton(node);
        this.lastNodeModel = undefined;
    }

    endVisitErrorHandler(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;

        const containerStartEmptyNodeModel = this.nodes.find(
            (n) => n.getID() === getCustomNodeId(node.id, START_CONTAINER)
        );
        if (!containerStartEmptyNodeModel) {
            console.error("Container node model not found", node);
            return;
        }

        // assume that only the body branch exist
        const bodyBranch = node.branches.find((branch) => branch.codedata.node === "BODY");
        if (!bodyBranch) {
            console.error("Body branch not found", node);
            return;
        }

        const onFailureBranch = node.branches.find((branch) => branch.codedata.node === "ON_FAILURE");

        // Create branch's IN link
        if (bodyBranch.children && bodyBranch.children.length > 0) {
            const firstChildNodeModel = this.getBranchStartNode(bodyBranch);
            if (firstChildNodeModel) {
                const link = this.createNodeLinkWithCounter(containerStartEmptyNodeModel, firstChildNodeModel);
                if (link) {
                    this.links.push(link);
                }
            }
        }

        // create error node model
        const containerNodeModel = new ErrorNodeModel(node, bodyBranch);
        this.nodes.push(containerNodeModel);

        // if (node.viewState.isTopLevel) {
        //     // link last node of body branch to container node model
        //     const lastNodeModel = this.getBranchEndNode(bodyBranch);
        //     if (lastNodeModel) {
        //         const link = this.createNodeLinkWithCounter(lastNodeModel, containerNodeModel);
        //         if (link) {
        //             this.links.push(link);
        //         }
        //     }
        // }

        if (onFailureBranch?.viewState) {
            // create empty node for end of on failure branch
            const endOnFailureEmptyNode = this.createEmptyNode(
                getCustomNodeId(node.id, END_CONTAINER),
                node.viewState.x + node.viewState.lw - EMPTY_NODE_WIDTH / 2,
                node.viewState.y + node.viewState.ch - EMPTY_NODE_WIDTH / 2
            );
            this.nodes.push(endOnFailureEmptyNode);

            this.lastNodeModel = endOnFailureEmptyNode;
        } else {
            // collapsed mode
            this.lastNodeModel = containerNodeModel;
        }

        if (bodyBranch.children && bodyBranch.children.at(0)?.codedata.node === "EMPTY") {
            const branchEmptyNodeModel = bodyBranch.children.at(0);
            if (!branchEmptyNodeModel || !branchEmptyNodeModel.viewState) {
                console.error("Branch empty node model not found", bodyBranch);
                return;
            }

            let branchEmptyNode = this.createEmptyNode(
                branchEmptyNodeModel.id,
                node.viewState.x + WHILE_NODE_WIDTH / 2 - EMPTY_NODE_WIDTH / 2,
                branchEmptyNodeModel.viewState.y,
                true,
                true
            );
            branchEmptyNode.setParentFlowNode(node);
            const linkIn = this.createNodeLinkWithCounter(containerStartEmptyNodeModel, branchEmptyNode, {
                showAddButton: false,
            });
            if (linkIn) {
                this.links.push(linkIn);
            }
        }

        const lastNodeModel = this.getBranchEndNode(bodyBranch);
        if (lastNodeModel) {
            const linkOut = this.createNodeLinkWithCounter(lastNodeModel, containerNodeModel, {
                showAddButton: lastNodeModel.getID() !== getCustomNodeId(node.id, bodyBranch.label),
                showArrow: false,
            });
            if (linkOut) {
                this.links.push(linkOut);
            }
        }
    }

    beginVisitFork(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        const nodeModel = new WhileNodeModel(node);
        this.nodes.push(nodeModel);
        this.updateNodeLinks(node, nodeModel);
        this.addSuggestionsButton(node);
        this.lastNodeModel = undefined;
    }

    endVisitFork(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;

        // create branch's OUT link
        const endContainerEmptyNode = this.createEmptyNode(
            getCustomNodeId(node.id, END_CONTAINER),
            node.viewState.x + WHILE_NODE_WIDTH / 2 - EMPTY_NODE_WIDTH / 2,
            node.viewState.y - EMPTY_NODE_WIDTH / 2 + node.viewState.ch
        );
        endContainerEmptyNode.setParentFlowNode(node);
        this.lastNodeModel = endContainerEmptyNode;
    }

    endVisitWorker(node: Branch, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.flushPendingComments();
        this.lastNodeModel = undefined;
    }

    beginVisitRemoteActionCall(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        if (node.id) {
            this.createApiCallNode(node);
            this.addSuggestionsButton(node);
        }
    }

    beginVisitActivityCall(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        if (node.id) {
            this.createCallActivityNode(node);
            this.addSuggestionsButton(node);
        }
    }

    beginVisitConnectionActivityCall(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        if (node.id) {
            // Connection-backed activity calls render with the same double-line activity box as
            // plain activity calls; the widget adds a dashed link per connection (it is a local
            // activity invocation, not a remote call, so no arrowhead).
            this.createCallActivityNode(node);
            this.addSuggestionsButton(node);
        }
    }

    // Starting a workflow looks the same wherever it is started from: the statement, the instance
    // it binds, and an arrow to the workflow being run. The child-workflow start uses this shape,
    // so the outside-world start uses it too.
    beginVisitWorkflowRun(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        if (node.id) {
            this.createApiCallNode(node);
            this.addSuggestionsButton(node);
        }
    }

    beginVisitSendData(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        if (node.id) {
            this.createSendDataNode(node);
            this.addSuggestionsButton(node);
        }
    }

    beginVisitWaitData(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        if (node.id) {
            this.createWaitDataNode(node);
            this.addSuggestionsButton(node);
        }
    }

    // A child workflow is still a workflow being run, so it uses the workflow-run node with its
    // target beside it rather than a generic call box titled with the truncated method name.
    beginVisitChildWorkflowRun(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        if (node.id) {
            // Starting a child workflow is an action on the context, so it reads as one: the
            // statement on the left, the variable it binds in the middle, and an arrow to the
            // workflow being run.
            this.createApiCallNode(node);
            this.addSuggestionsButton(node);
        }
    }

    beginVisitChildWorkflowCall(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.beginVisitChildWorkflowRun(node, parent);
    }

    beginVisitChildWorkflowSendData(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        if (node.id) {
            this.createSendDataNode(node);
            this.addSuggestionsButton(node);
        }
    }

    // Waiting on a child workflow suspends the caller, so it takes the wait shape.
    beginVisitChildWorkflowWait(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        if (node.id) {
            this.createWaitDataNode(node);
            this.addSuggestionsButton(node);
        }
    }

    // A durable agent's data-event send renders as the workflow send node: same shape, and the
    // square on the right points at the agent instead of a workflow.
    beginVisitDurableAgentUpdate(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        if (node.id) {
            this.createSendDataNode(node);
            this.addSuggestionsButton(node);
        }
    }

    // The result reads come in a waiting and a non-waiting form on the same node kind
    // (waitForDataResult/getDataResult, waitForResult/getResult). Only the waiting form
    // suspends the caller, so only it gets the wait shape.
    beginVisitDurableAgentDataResult(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        if (!node.id) {
            return;
        }
        if (isWaitingAgentCall(node)) {
            this.createWaitDataNode(node);
        } else {
            this.createBaseNode(node);
        }
        this.addSuggestionsButton(node);
    }

    beginVisitDurableAgentResult(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.beginVisitDurableAgentDataResult(node, parent);
    }

    beginVisitResourceActionCall(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.beginVisitRemoteActionCall(node, parent);
    }

    beginVisitVectorKnowledgeBaseCall(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.beginVisitRemoteActionCall(node, parent);
    }

    beginVisitAgent(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        if (!node.id) {
            return;
        }
        const nodeModel = new AgentNodeModel(node);
        this.nodes.push(nodeModel);
        this.updateNodeLinks(node, nodeModel);
        this.addSuggestionsButton(node);
    }

    beginVisitAgentCall(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        if (!node.id) {
            return;
        }
        const nodeModel = new AgentCallNodeModel(node);
        this.nodes.push(nodeModel);
        this.updateNodeLinks(node, nodeModel);
        this.addSuggestionsButton(node);
    }

    beginVisitAgentRun(node: FlowNode, parent?: FlowNode): void {
        this.beginVisitAgentCall(node, parent);
    }

    beginVisitTypedAgent(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        if (!node.id) {
            return;
        }
        const nodeModel = new AgentNodeModel(node, NodeTypes.TYPED_AGENT_NODE);
        this.nodes.push(nodeModel);
        this.updateNodeLinks(node, nodeModel);
        this.addSuggestionsButton(node);
    }

    beginVisitDurableAgentRun(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        if (!node.id) {
            return;
        }
        const nodeModel = new DurableAgentRunNodeModel(node);
        this.nodes.push(nodeModel);
        // The synthetic agent-box copy (metadata.data.agentBox) floats above the chain:
        // skip updateNodeLinks so it gets no incoming link and does not become the link
        // source for the following start pill (which would render an edge plus an
        // add-button between the box and the pill). The pill still becomes lastNodeModel
        // itself and links downward to the first statement.
        //
        // Exception — the agent-only view: there the flow model is just
        // [Start, agent box], so a start node has already been visited. Link it to the
        // box with a non-editable edge (no add-button).
        const nodeData = node.metadata?.data as { agentBox?: boolean; agentDeclarationCanvas?: boolean };
        const isAgentBox = nodeData?.agentBox === true;
        // Only the synthetic declaration-canvas copy (agent-only view) gets the non-editable
        // Start edge — an in-chain `agent.run(...)` statement also carries the agentBox marker
        // but is a real statement, so its edges keep the add-button. The LS marks the synthetic
        // copy explicitly; node ids are generated, so they cannot be matched on.
        const isDeclarationCanvasBox = nodeData?.agentDeclarationCanvas === true;
        if (!isAgentBox) {
            this.updateNodeLinks(node, nodeModel);
        } else if (isDeclarationCanvasBox && this.lastNodeModel instanceof StartNodeModel) {
            this.updateNodeLinks(node, nodeModel, { showAddButton: false });
        } else if (this.lastNodeModel) {
            // Object-model agent box rendered in-chain (an `agent.run(...)` statement inside a
            // workflow function or resource): keep the normal chain links.
            this.updateNodeLinks(node, nodeModel);
        }
        this.addSuggestionsButton(node);
    }

    beginVisitEmpty(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        // add empty node end of the block
        if (reverseCustomNodeId(node.id).label === LAST_NODE) {
            const lastNodeModel = new EndNodeModel(node.id);
            lastNodeModel.setPosition(node.viewState.x, node.viewState.y);
            this.updateNodeLinks(node, lastNodeModel, { showArrow: true, showButtonAlways: this.nodes.length === 1 });
            if (Object.keys(lastNodeModel.getInPort().getLinks()).length > 0) {
                // only render the last node model if it has links
                this.nodes.push(lastNodeModel);
            }
            return;
        }
        // skip node creation
    }

    beginVisitDraft(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        const nodeModel = new DraftNodeModel(node);
        this.nodes.push(nodeModel);
        this.updateNodeLinks(node, nodeModel);
    }

    beginVisitComment(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        // Keep every adjacent comment. A single pending slot made an inserted note overwrite
        // the existing note before either could be rendered.
        this.pendingComments.push(node);
    }

    getNodeComments(): Map<string, FlowNode[]> {
        // A final comment has no following node; attach it to the preceding real node so it
        // remains visible instead of being silently dropped.
        this.flushPendingComments();
        return this.nodeComments;
    }

    beginVisitNpFunction(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        const nodeModel = new PromptNodeModel(node);
        this.nodes.push(nodeModel);
        this.updateNodeLinks(node, nodeModel);
    }

    skipChildren(): boolean {
        return this.skipChildrenVisit;
    }

    getLastNodeModel(): NodeModel | undefined {
        return this.lastNodeModel;
    }
}
