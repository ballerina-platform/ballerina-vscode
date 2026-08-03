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

import { LAST_NODE, START_NODE } from "../resources/constants";
import { getCustomNodeId } from "../utils/node";
import { Branch, Flow, FlowNode, Property, ViewState } from "../utils/types";

export class InitVisitor implements BaseVisitor {
    private skipChildrenVisit = false;
    private flow: Flow;
    private expandedErrorHandler?: string;

    constructor(model: Flow, expandedErrorHandler?: string) {
        this.flow = model;
        this.expandedErrorHandler = expandedErrorHandler;
    }

    private getDefaultViewState(): ViewState {
        return {
            x: 0,
            y: 0,
            lw: 0,
            rw: 0,
            h: 0,
            clw: 0,
            crw: 0,
            ch: 0,
        };
    }

    private validateNode(node: FlowNode): boolean {
        if (this.skipChildrenVisit) {
            return false;
        }
        return true;
    }

    beginVisitNode(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        node.viewState = this.getDefaultViewState();
    }

    endVisitNode(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        // if this is last block in the flow, add empty node end of the block
        if (!node.returning && this.flow.nodes.at(-1).id === node.id) {
            const emptyNode: FlowNode = {
                id: getCustomNodeId(node.id, LAST_NODE),
                codedata: {
                    node: "EMPTY",
                },
                returning: false,
                metadata: { label: "", description: "" },
                branches: [],
                viewState: this.getDefaultViewState(),
            };
            this.flow.nodes.push(emptyNode);
        }

        // supported node types which has children and branches
        // TODO: this list should go away once we have a way to support all node types
        const supportedNodeTypes = [
            "IF",
            "ELSE",
            "MATCH",
            "WHILE",
            "FOREACH",
            "ERROR_HANDLER",
            "FORK",
            "LOCK",
            "DIFF_HUNK",
        ];
        if (node.branches && !supportedNodeTypes.includes(node.codedata.node)) {
            // unsupported node types with children and branches
            node.branches = [];
        }
    }

    beginVisitIf(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        node.viewState = this.getDefaultViewState();
        // add empty node if branch is empty
        node.branches?.forEach((branch, index) => {
            // if branch is not empty remove empty node
            if (branch.children && branch.children.length > 0) {
                const emptyNodeIndex = branch.children.findIndex((child) => child.codedata.node === "EMPTY");
                if (emptyNodeIndex >= 0) {
                    branch.children.splice(emptyNodeIndex, 1);
                }
            }

            // if branch is empty add empty node
            if (!branch.children || branch.children.length === 0) {
                // empty branch
                // add empty node as `add new node` button
                const emptyNode: FlowNode = {
                    id: getCustomNodeId(node.id, branch.label, index),
                    codedata: {
                        node: "EMPTY",
                    },
                    returning: false,
                    metadata: { label: "", description: "" },
                    branches: [],
                    viewState: this.getDefaultViewState(),
                };
                branch.children.push(emptyNode);
            }
            branch.viewState = this.getDefaultViewState();
        });

        // add empty else branch if not exists
        if (node.branches.find((branch) => branch.label === "Else") === undefined) {
            const emptyElseBranch: FlowNode = {
                id: getCustomNodeId(node.id, "Else"),
                codedata: {
                    node: "EMPTY",
                },
                returning: false,
                metadata: {
                    label: "",
                    description: "",
                    draft: true, // else branch is draft
                },
                branches: [],
                viewState: this.getDefaultViewState(),
            };
            node.branches.push({
                label: "Else",
                kind: "block",
                codedata: {
                    node: "ELSE",
                    lineRange: node.codedata.lineRange,
                },
                repeatable: "ZERO_OR_MORE",
                properties: {},
                children: [emptyElseBranch],
            });
        }
    }

    // Synthetic review-diff container (see utils/diff.ts). Branches hold the removed/added lanes.
    beginVisitDiffHunk(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        node.viewState = this.getDefaultViewState();
        node.branches?.forEach((branch) => {
            branch.viewState = this.getDefaultViewState();
        });
    }

    beginVisitMatch(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        node.viewState = this.getDefaultViewState();
        // add empty node if branch is empty
        node.branches?.forEach((branch, index) => {
            // if branch is not empty remove empty node
            if (branch.children && branch.children.length > 0) {
                const emptyNodeIndex = branch.children.findIndex((child) => child.codedata.node === "EMPTY");
                if (emptyNodeIndex >= 0) {
                    branch.children.splice(emptyNodeIndex, 1);
                }
            }

            // if branch is empty add empty node
            if (!branch.children || branch.children.length === 0) {
                // empty branch
                // add empty node as `add new node` button
                const emptyNode: FlowNode = {
                    id: getCustomNodeId(node.id, branch.label, index),
                    codedata: {
                        node: "EMPTY",
                    },
                    returning: false,
                    metadata: { label: "", description: "" },
                    branches: [],
                    viewState: this.getDefaultViewState(),
                };
                branch.children.push(emptyNode);
            }
            branch.viewState = this.getDefaultViewState();
        });

        // add empty default "_" branch if not exists
        if (
            node.branches.find((branch) => (branch.properties?.patterns?.value as Property[]).at(0)?.value === "_") ===
            undefined
        ) {
            const emptyDefaultBranch: FlowNode = {
                id: getCustomNodeId(node.id, "_"),
                codedata: {
                    node: "EMPTY",
                },
                returning: false,
                metadata: {
                    label: "",
                    description: "",
                    draft: true, // default branch is draft
                },
                branches: [],
                viewState: this.getDefaultViewState(),
            };
            node.branches.push({
                label: "_",
                kind: "block",
                codedata: {
                    node: "CONDITIONAL",
                    lineRange: node.codedata.lineRange,
                },
                repeatable: "ONE_OR_MORE",
                properties: {
                    patterns: {
                        metadata: {
                            label: "Patterns",
                            description: "List of binding patterns",
                        },
                        types: [{ fieldType: "SINGLE_SELECT", selected: false }],
                        value: [
                            {
                                metadata: {
                                    label: "Pattern",
                                    description: "Binding pattern",
                                },
                                types: [{ fieldType: "EXPRESSION", selected: false }],
                                value: "_",
                                optional: false,
                                editable: true,
                                advanced: false,
                                hidden: false,
                            },
                        ],
                        optional: false,
                        editable: true,
                        advanced: false,
                        hidden: false,
                    },
                },
                children: [emptyDefaultBranch],
            });
        }
    }

    private visitContainerNode(node: FlowNode, parent?: FlowNode): void {
        node.viewState = this.getDefaultViewState();

        if (!node.branches || node.branches.length < 1) {
            console.error("Branch node model not found");
            return;
        }

        const branch = node.branches.at(0);
        if (!branch) {
            console.error("No branch found in container node", node);
            return;
        }
        branch.viewState = this.getDefaultViewState();

        // remove empty nodes if the branch is not empty
        if (branch.children && branch.children.length > 0) {
            let emptyNodeIndex = branch.children.findIndex((child) => child.codedata.node === "EMPTY");
            while (emptyNodeIndex >= 0) {
                branch.children.splice(emptyNodeIndex, 1);
                emptyNodeIndex = branch.children.findIndex((child) => child.codedata.node === "EMPTY");
            }
        }

        // add empty node if the branch is empty
        if (!branch.children || branch.children.length === 0) {
            // empty branch
            // add empty node as `add new node` button
            const emptyNode: FlowNode = {
                id: getCustomNodeId(node.id, branch.label),
                codedata: {
                    node: "EMPTY",
                },
                returning: false,
                metadata: { label: "", description: "" },
                branches: [],
                viewState: this.getDefaultViewState(),
            };
            branch.children.push(emptyNode);
        }
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

        node.viewState = this.getDefaultViewState();
        if (!node.branches || node.branches.length < 1) {
            console.error("Branch node model not found");
            return;
        }

        // hide container if the first node is a error handler
        const errorNode = this.flow.nodes?.at(1);
        if (errorNode && errorNode.codedata.node === "ERROR_HANDLER") {
            errorNode.viewState.isTopLevel = true;
        }

        // Update Body branch with end node
        const bodyBranch = node.branches.find((branch) => branch.codedata.node === "BODY");
        if (!bodyBranch) {
            console.error("Body branch not found", node);
            return;
        }

        bodyBranch.viewState = this.getDefaultViewState();
        // remove empty nodes if the body branch is not empty
        if (bodyBranch.children && bodyBranch.children.length > 0) {
            let emptyNodeIndex = bodyBranch.children.findIndex((child) => child.codedata.node === "EMPTY");
            while (emptyNodeIndex >= 0) {
                bodyBranch.children.splice(emptyNodeIndex, 1);
                emptyNodeIndex = bodyBranch.children.findIndex((child) => child.codedata.node === "EMPTY");
            }
        }

        // add empty node if the body branch is empty
        if (!bodyBranch.children || bodyBranch.children.length === 0) {
            // add empty node as `add new node` button
            const emptyNode: FlowNode = {
                id: getCustomNodeId(node.id, bodyBranch.label),
                codedata: {
                    node: "EMPTY",
                },
                returning: false,
                metadata: { label: "", description: "" },
                branches: [],
                viewState: this.getDefaultViewState(),
            };
            bodyBranch.children.push(emptyNode);
        }

        // Update On Failure branch with start and end node
        const onFailureBranch = node.branches.find((branch) => branch.codedata.node === "ON_FAILURE");
        if (!onFailureBranch) {
            console.error("On failure branch not found", node);
            return;
        }
        onFailureBranch.viewState = this.getDefaultViewState();
        // Check if first node is not already a start node
        const startNode: FlowNode = {
            id: getCustomNodeId(node.id, START_NODE, 0, "ON_FAILURE"),
            metadata: {
                label: "On Error",
                description: "",
            },
            codedata: {
                node: "EVENT_START",
                lineRange: onFailureBranch.codedata.lineRange,
            },
            branches: [],
            returning: false,
            viewState: this.getDefaultViewState(),
        };
        onFailureBranch.children.unshift(startNode);

        // add end node to the error branch
        const onFailureEndNode: FlowNode = {
            id: getCustomNodeId(node.id, LAST_NODE, 0, "ON_FAILURE"),
            codedata: {
                node: "EMPTY",
            },
            returning: false,
            metadata: { label: "", description: "" },
            branches: [],
            viewState: this.getDefaultViewState(),
        };
        onFailureBranch.children.push(onFailureEndNode);
    }

    private removeViewStateRecursively(node: FlowNode): void {
        node.viewState = undefined;

        node.branches?.forEach((branch) => {
            branch.viewState = undefined;
            branch.children?.forEach((child) => {
                this.removeViewStateRecursively(child);
            });
        });

    }

    endVisitErrorHandler(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        // Remove view state of error branch and its children when not expanded
        const errorBranch = node.branches.find((branch) => branch.codedata.node === "ON_FAILURE");
        if (errorBranch) {
            // Only hide viewState if this error handler is not expanded
            if (this.expandedErrorHandler !== node.id) {
                errorBranch.viewState = undefined;
                errorBranch.children.forEach((child) => {
                    this.removeViewStateRecursively(child);
                });
            }
        }
        
        this.endVisitNode(node, parent);
    }

    private visitForkNode(node: FlowNode, parent?: FlowNode): void {
        node.viewState = this.getDefaultViewState();

        // if node has no branches, create a new branch
        if (!node.branches || node.branches.length === 0) {
            const newBranch: Branch = {
                label: "Empty",
                kind: "block",
                codedata: { node: "WORKER" },
                repeatable: "ZERO_OR_MORE",
                properties: {},
                children: [],
            };
            node.branches = [newBranch];
        }

        node.branches?.forEach((branch, index) => {
            // add start node, end node to every branch
            const startNode: FlowNode = {
                id: getCustomNodeId(node.id, START_NODE, index, branch.label),
                metadata: {
                    label: branch.label,
                    description: "",
                },
                codedata: {
                    node: "EVENT_START",
                },
                branches: [],
                returning: false,
                viewState: this.getDefaultViewState(),
            };
            // add startNode as first child of the branch
            branch.children.unshift(startNode);

            const endNode: FlowNode = {
                id: getCustomNodeId(node.id, LAST_NODE, index, branch.label),
                codedata: {
                    node: "EMPTY",
                },
                returning: false,
                metadata: { label: "", description: "" },
                branches: [],
                viewState: this.getDefaultViewState(),
            };
            // add endNode as last child of the branch
            branch.children.push(endNode);
        });
    }

    beginVisitFork(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        this.visitForkNode(node, parent);
    }

    beginVisitParallelFlow(node: FlowNode, parent?: FlowNode): void {
        if (!this.validateNode(node)) return;
        node.branches = []; // HACK: Remove branches until parallel flow is implemented
        this.beginVisitNode(node, parent);
    }

    skipChildren(): boolean {
        return this.skipChildrenVisit;
    }
}
