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

import { NodeLinkModel } from "../components/NodeLink";
import { EmptyNodeModel } from "../components/nodes/EmptyNode";
import { END_CONTAINER, NodeTypes, START_CONTAINER } from "../resources/constants";
import { getBranchInLinkId, getCustomNodeId, getNodeIdFromModel } from "../utils/node";
import { Branch, Flow, FlowNode, LinePosition, LinkableNodeModel, NodeModel } from "../utils/types";

// Where a statement added after this node goes. Shared with node moves, which must land where "+" would add.
export function slotAfter(node: FlowNode): LinePosition {
    const range = node.codedata.lineRange;
    if (node.codedata.node === "COMMENT") {
        return { line: range.endLine.line + 1, offset: 0 }; // HACK: add 1 line to avoid merging with comment
    }
    if (node.codedata.node === "EVENT_START") {
        return { line: range.startLine.line, offset: range.startLine.offset + 1 }; // FIXME: need to fix with LS extension
    }
    return range.endLine;
}

// Where a statement added as the first in this branch goes.
export function slotAtBranchStart(branch: Branch): LinePosition {
    const line = branch.codedata.lineRange.startLine;
    if (branch.codedata.node === "WORKER") {
        // The brace that ends the header line; files saved with Windows line endings put "\r" before the "\n".
        const brace = branch.codedata.sourceCode.search(/\{\r?\n/);
        return { line: line.line, offset: line.offset + brace + 1 }; // HACK: need to fix with LS extension
    }
    return { line: line.line, offset: line.offset + 1 }; // HACK: need to fix with LS extension
}

export class LinkTargetVisitor implements BaseVisitor {
    private skipChildrenVisit = false;
    private flow: Flow;
    private nodeModels: NodeModel[];
    private topDoBranch: string;

    constructor(originalFlowModel: Flow, nodeModels: NodeModel[], topDoBranch?: string) {
        // console.log(">>> add link targets visitor started");
        this.flow = originalFlowModel;
        this.nodeModels = nodeModels;
        if (topDoBranch !== undefined) {
            this.topDoBranch = topDoBranch;
        }
    }

    private getOutLinksFromNode(node: FlowNode): NodeLinkModel[] {
        const model = this.nodeModels.find((nodeModel) => nodeModel.getID() === getNodeIdFromModel(node));
        if (!model) {
            return;
        }

        return this.getOutLinksFromModel(model as LinkableNodeModel);
    }

    private getOutLinksFromModel(nodeModel: NodeModel): NodeLinkModel[] {
        if (nodeModel.getType() === NodeTypes.BUTTON_NODE) {
            console.log(">>> getOutLinksFromNode: button node not supported");
            return;
        }

        const model = nodeModel as LinkableNodeModel;

        const outPort = model.getOutPort();
        if (!outPort) {
            return;
        }

        const outLinks = outPort.getLinks();
        if (!outLinks) {
            console.log(">>> out links not found", { model });
            return;
        }

        const links: NodeLinkModel[] = [];
        for (const outLink of Object.values(outLinks)) {
            links.push(outLink as NodeLinkModel);
        }

        return links;
    }

    private validateNode(node: FlowNode): boolean {
        if (this.skipChildrenVisit) {
            return false;
        }
        if (!node.viewState) {
            // console.error(">>> Node view state is not defined", { node });
            return false;
        }
        return true;
    }

    beginVisitNode(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        const outLinks = this.getOutLinksFromNode(node);
        if (!outLinks) {
            return;
        }
        outLinks.forEach((outLink) => {
            // set target position
            if (outLink && node.codedata?.lineRange?.endLine) {
                outLink.setTarget(slotAfter(node));
                outLink.setTopNode(node);
            }
        });
    }

    beginVisitComment(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        const outLinks = this.getOutLinksFromNode(node);
        if (!outLinks) {
            return;
        }
        outLinks.forEach((outLink) => {
            // set target position
            if (outLink && node.codedata?.lineRange?.endLine) {
                outLink.setTarget(slotAfter(node));
                outLink.setTopNode(node);
            }
        });
    }

    beginVisitEventStart(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;

        if (!node.codedata.lineRange) {
            return;
        }
        // out links
        const outLinks = this.getOutLinksFromNode(node);
        // find top level do block
        outLinks?.forEach((outLink) => {
            outLink.setTarget(slotAfter(node));
            outLink.setTopNode(node);
        });
    }

    beginVisitIf(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        const outLinks = this.getOutLinksFromNode(node);
        if (!outLinks) {
            return;
        }
        node.branches.forEach((branch, index) => {
            // in link
            const link = outLinks.find((link) => link.linkId === getBranchInLinkId(node.id, branch.label, index));
            if (!link) {
                console.error(">>> Link not found", { node, branch });
                return;
            }
            link.setTarget(slotAtBranchStart(branch));
            link.setTopNode(branch);

            // if branch is empty, target node is empty node.
            // improve empty node with target position and top node
            const firstNode = link.targetNode;
            if (firstNode && firstNode.getType() === NodeTypes.EMPTY_NODE) {
                const emptyNode = firstNode as EmptyNodeModel;
                emptyNode.setTopNode(branch);
                emptyNode.setTarget(slotAtBranchStart(branch));
            }
        });

        // update end-if link target
        const endIfModel = this.nodeModels.find((nodeModel) => nodeModel.getID() === `${node.id}-endif`);
        if (!endIfModel) {
            console.log("End-if node model not found", node);
            return;
        }
        const endIfOutLinks = this.getOutLinksFromModel(endIfModel);
        if (!endIfOutLinks) {
            return;
        }
        endIfOutLinks.forEach((outLink) => {
            // set target position
            if (outLink && node.codedata?.lineRange?.endLine) {
                outLink.setTarget(slotAfter(node));
            }
            outLink.setTopNode(node);
        });
    }

    beginVisitMatch(node: FlowNode, parent?: FlowNode): void {
        this.beginVisitIf(node, parent);
    }

    private visitContainerNode(node: FlowNode, parent?: FlowNode) {
        const outLinks = this.getOutLinksFromNode(node);
        if (!outLinks) {
            return;
        }
        if (outLinks.length === 0) {
            console.log(">>> no out links", { node });
            return;
        }
        if (outLinks.length > 1) {
            console.log(">>> multiple out links", { node, outLinks });
            return;
        }

        const bodyBranch = node.branches.at(0);
        if (!bodyBranch) {
            console.error("No body branch found in container node", node);
            return;
        }
        outLinks.forEach((outLink) => {
            outLink.setTarget(slotAtBranchStart(bodyBranch));
            outLink.setTopNode(bodyBranch);
            // if the body branch is empty, target node is empty node.
            // improve empty node with target position and top node
            const firstNode = outLink.targetNode;
            if (firstNode && firstNode.getType() === NodeTypes.EMPTY_NODE) {
                const emptyNode = firstNode as EmptyNodeModel;
                emptyNode.setTopNode(bodyBranch);
                emptyNode.setTarget(slotAtBranchStart(bodyBranch));
            }
        });

        // update end-container link target
        const endContainerModel = this.nodeModels.find(
            (nodeModel) => nodeModel.getID() === getCustomNodeId(node.id, END_CONTAINER)
        );
        if (!endContainerModel) {
            console.log("End-container node model not found", node);
            return;
        }
        const endContainerOutLinks = this.getOutLinksFromModel(endContainerModel);
        if (!endContainerOutLinks || endContainerOutLinks.length == 0) {
            console.log(">>> no end container out links", { node });
            return;
        }
        const outLink = endContainerOutLinks.at(0);

        // set target position
        if (outLink && node.codedata?.lineRange?.endLine) {
            outLink.setTarget(slotAfter(node));
        }
        outLink.setTopNode(node);
    }

    beginVisitWhile(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.visitContainerNode(node, parent);
    }

    beginVisitForeach(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.visitContainerNode(node, parent);
    }

    beginVisitLock(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.visitContainerNode(node, parent);
    }

    beginVisitErrorHandler(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;

        const startEmptyNodeModel = this.nodeModels.find(
            (nodeModel) => nodeModel.getID() === getCustomNodeId(node.id, START_CONTAINER)
        );
        if (!startEmptyNodeModel) {
            console.log(">>> error start empty node model not found", node);
            return;
        }

        const outLinks = this.getOutLinksFromModel(startEmptyNodeModel as LinkableNodeModel);
        if (!outLinks) {
            return;
        }
        if (outLinks.length === 0) {
            console.log(">>> no out links", { node });
            return;
        }
        if (outLinks.length > 1) {
            console.log(">>> multiple out links", { node, outLinks });
            return;
        }

        const bodyBranch = node.branches?.find((branch) => branch.codedata.node === "BODY");
        if (!bodyBranch) {
            console.log(">>> no body branch", { node });
            return;
        }
        outLinks.forEach((outLink) => {
            outLink.setTarget(slotAtBranchStart(bodyBranch));
            outLink.setTopNode(bodyBranch);
            // if the body branch is empty, target node is empty node.
            // improve empty node with target position and top node
            const firstNode = outLink.targetNode;
            if (firstNode && firstNode.getType() === NodeTypes.EMPTY_NODE) {
                const emptyNode = firstNode as EmptyNodeModel;
                emptyNode.setTopNode(bodyBranch);
                emptyNode.setTarget(slotAtBranchStart(bodyBranch));
            }
        });

        const endContainerNodeModel = this.nodeModels.find(
            (nodeModel) => nodeModel.getID() === getCustomNodeId(node.id, END_CONTAINER)
        );
        if (endContainerNodeModel) {
            const endContainerOutLinks = this.getOutLinksFromModel(endContainerNodeModel);
            if (!endContainerOutLinks || endContainerOutLinks.length == 0) {
                console.log(">>> no end container out links", { node });
                return;
            }
            endContainerOutLinks.forEach((outLink) => {
                // set target position
                if (outLink && node.codedata?.lineRange?.endLine) {
                    outLink.setTarget(slotAfter(node));
                }
                outLink.setTopNode(node);
            });
        }

        const errorNodeModel = this.nodeModels.find((nodeModel) => nodeModel.getID() === node.id);
        if (errorNodeModel) {
            const errorOutLinks = this.getOutLinksFromModel(errorNodeModel);
            if (!errorOutLinks || errorOutLinks.length == 0) {
                console.log(">>> no error out links", { node });
                return;
            }
            errorOutLinks.forEach((outLink) => {
                // set target position
                if (outLink && node.codedata?.lineRange?.endLine) {
                    outLink.setTarget(slotAfter(node));
                }
                outLink.setTopNode(node);
            });
        }
    }

    beginVisitFork(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;

        node.branches?.forEach((branch, index) => {
            const outLinks = this.getOutLinksFromNode(branch.children.at(0));
            const link = outLinks.at(0);
            if (!link) {
                console.error(">>> Link not found", { node, branch });
                return;
            }
            link.setTarget(slotAtBranchStart(branch));
            link.setTopNode(branch);
        });

        const endContainerNodeModel = this.nodeModels.find(
            (nodeModel) => nodeModel.getID() === getCustomNodeId(node.id, END_CONTAINER)
        );
        (endContainerNodeModel ? this.getOutLinksFromModel(endContainerNodeModel) : undefined)?.forEach((outLink) => {
            if (node.codedata?.lineRange?.endLine) {
                outLink.setTarget(slotAfter(node));
            }
            outLink.setTopNode(node);
        });
    }

    skipChildren(): boolean {
        return this.skipChildrenVisit;
    }
}
