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

import { CSSProperties } from "react";

import {
    DIFF_ADDED_BG_COLOR,
    DIFF_ADDED_COLOR,
    DIFF_MODIFIED_BG_COLOR,
    DIFF_MODIFIED_COLOR,
    DIFF_REMOVED_BG_COLOR,
    DIFF_REMOVED_COLOR,
} from "../resources/constants";
import { Branch, FlowNode, FlowNodeDiffState } from "./types";

const WORKFLOW_NODE_KINDS = new Set(["WORKFLOW_RUN", "ACTIVITY_CALL", "SEND_DATA", "WAIT_DATA", "HUMAN_TASK"]);

// Durable-agentic-workflow register/add statements: rendered without the module prefix and
// with the registered name (metadata.description) as the node's second line.
const DURABLE_AGENT_REGISTER_NODE_KINDS = new Set([
    "DURABLE_AGENT_REGISTER_EVENT",
    "DURABLE_AGENT_REGISTER_TOOL",
    "DURABLE_AGENT_ADD_ACTIVITY",
    "DURABLE_AGENT_HUMAN_TASK",
]);

// Workflow and durable-agent statements are actions on the context or the agent — `ctx->callActivity`,
// `ctx->runChildWorkflow`, `agent.sendData` — not calls into a module's API. Titling them
// "workflow : <label>" misreads what they are, so they keep their plain action label.
const WORKFLOW_ACTION_NODE_KINDS = new Set([
    "ACTIVITY_CALL",
    "CONNECTION_ACTIVITY_CALL",
    "HUMAN_TASK",
    "SEND_DATA",
    "WAIT_DATA",
    "UPDATE_DATA",
    "WORKFLOW_RUN",
    "CHILD_WORKFLOW_RUN",
    "CHILD_WORKFLOW_CALL",
    "CHILD_WORKFLOW_WAIT",
    "CHILD_WORKFLOW_SEND_DATA",
    "DURABLE_AGENT_RUN",
    "DURABLE_AGENT_START",
    "DURABLE_AGENT_UPDATE",
    "DURABLE_AGENT_RESULT",
    "DURABLE_AGENT_DATA_RESULT",
]);

export function isWorkflowActionNode(nodeOrKind?: FlowNode | string) {
    if (!nodeOrKind) {
        return false;
    }

    const nodeKind = typeof nodeOrKind === "string" ? nodeOrKind : nodeOrKind.codedata?.node;
    return typeof nodeKind === "string" && WORKFLOW_ACTION_NODE_KINDS.has(nodeKind);
}

export function isDurableAgentRegisterNode(nodeOrKind?: FlowNode | string) {
    if (!nodeOrKind) {
        return false;
    }

    const nodeKind = typeof nodeOrKind === "string" ? nodeOrKind : nodeOrKind.codedata?.node;
    return typeof nodeKind === "string" && DURABLE_AGENT_REGISTER_NODE_KINDS.has(nodeKind);
}

/**
 * Whether a durable agent call suspends the caller until the agent answers.
 *
 * The waiting and non-waiting reads share a node kind — `waitForDataResult`/`getDataResult` and
 * `waitForResult`/`getResult` — so the flag the language server attaches is what decides between
 * the wait shape and a plain node.
 */
/**
 * Whether a node is a workflow receiving one of its declared data events, as opposed to merely
 * waiting on something. Receiving is the same act in a workflow and in an agent, so both show the
 * agent box's receive-event icon.
 */
export function isReceiveEventNode(node?: FlowNode) {
    return node?.codedata?.node === "WAIT_DATA";
}

export function isWaitingAgentCall(node?: FlowNode) {
    return (node?.metadata?.data as { waits?: boolean } | undefined)?.waits === true;
}

/**
 * The data-event channel a durable agent send/wait concerns, used as the node's title so it reads
 * "Send to &lt;event&gt;" / "Wait for &lt;event&gt;". Absent when the channel is not statically known.
 */
export function getAgentDataEventName(node?: FlowNode) {
    return (node?.metadata?.data as { dataName?: string } | undefined)?.dataName;
}

export interface DiffStatePresentation {
    symbol: "+" | "−" | "~";
    label: "Added" | "Removed" | "Modified";
    borderStyle: "solid" | "dashed" | "dotted";
    strokeDasharray?: string;
}

const DIFF_STATE_PRESENTATIONS: Record<FlowNodeDiffState, DiffStatePresentation> = {
    added: { symbol: "+", label: "Added", borderStyle: "solid" },
    removed: { symbol: "−", label: "Removed", borderStyle: "dashed", strokeDasharray: "6 4" },
    modified: { symbol: "~", label: "Modified", borderStyle: "dotted", strokeDasharray: "2 2" },
};

export function getDiffStatePresentation(state?: FlowNodeDiffState): DiffStatePresentation | undefined {
    return state ? DIFF_STATE_PRESENTATIONS[state] : undefined;
}

// Colors for a node in the unified review-diff diagram, keyed by its diff state.
// Raw strings so both `style`-prop consumers and SVG fill/stroke attributes can use them.
export function getDiffColors(node: FlowNode): { background: string; border: string } | undefined {
    switch (node?.diffState) {
        case "removed":
            return { background: DIFF_REMOVED_BG_COLOR, border: DIFF_REMOVED_COLOR };
        case "added":
            return { background: DIFF_ADDED_BG_COLOR, border: DIFF_ADDED_COLOR };
        case "modified":
            return { background: DIFF_MODIFIED_BG_COLOR, border: DIFF_MODIFIED_COLOR };
        default:
            return undefined;
    }
}

// Inline style overrides for nodes rendered inside the unified review-diff diagram.
// Applied on top of the widget's styled-component so every node kind gets the same treatment.
export function getDiffContainerStyles(node: FlowNode): CSSProperties | undefined {
    const colors = getDiffColors(node);
    const presentation = getDiffStatePresentation(node?.diffState);
    if (!colors || !presentation) {
        return undefined;
    }
    return {
        backgroundColor: colors.background,
        borderColor: colors.border,
        borderStyle: presentation.borderStyle,
        outline: "1px solid var(--vscode-contrastBorder, transparent)",
        outlineOffset: "2px",
    };
}

export function getDiffStrokeDasharray(node: FlowNode): string | undefined {
    return getDiffStatePresentation(node?.diffState)?.strokeDasharray;
}

export function getDiffTitleStyles(node: FlowNode): CSSProperties | undefined {
    if (!node?.diffState) {
        return undefined;
    }
    return node.diffState === "removed" ? { textDecoration: "line-through" } : undefined;
}

export function getNodeIdFromModel(node: FlowNode, prefix?: string) {
    if (!node) {
        return null;
    }
    if (prefix) {
        return `${prefix}-${node.id}`;
    }
    return node.id;
}

export function getBranchLabel(branch: Branch): string {
    return branch.properties?.condition?.value?.toString().trim() || branch.label;
}

export function getCustomNodeId(nodeId: string, label: string, branchIndex?: number, suffix?: string) {
    return `${nodeId}-${label}${branchIndex ? `-${branchIndex}` : ""}${suffix ? `-${suffix}` : ""}`;
}

export function reverseCustomNodeId(customNodeId: string) {
    const parts = customNodeId.split("-");
    const nodeId = parts[0];
    const label = parts[1];
    const branchIndex = parts.length > 3 ? parseInt(parts[3]) : undefined;
    const suffix = parts.length > 4 ? parts.slice(4).join("-") : undefined;
    return { nodeId, label, branchIndex, suffix };
}

export function getBranchInLinkId(nodeId: string, branchLabel: string, branchIndex: number) {
    return `${nodeId}-${branchLabel}-branch-${branchIndex}-in-link`;
}

const nodeContainsNonEmptyDiagnostics = (node: FlowNode) => {
    if (!node?.properties) {
        return false;
    }
    return Object.keys(node.properties).some((key) => {
        const property = node.properties[key];
        if (property?.types?.length === 1 && property.types[0].fieldType === "REPEATABLE_LIST") {
            const diagnostics = property.value?.map((item: any) => item?.diagnostics?.diagnostics).flat().filter(dg => dg?.severity === "ERROR");
            return diagnostics?.length > 0;
        }
        return (property?.diagnostics?.diagnostics?.length > 0);
    });
}

export function nodeHasError(node: FlowNode) {
    if (!node) {
        return false;
    }

    // Check node
    if (node.diagnostics && node.diagnostics.hasDiagnostics) {
        if (node.diagnostics.diagnostics) {
            return node.diagnostics.diagnostics?.some((diagnostic) => diagnostic.severity === "ERROR");
        }
        else if (nodeContainsNonEmptyDiagnostics(node)) {
            return true;
        }
    }

    // Check branch properties
    if (node.branches) {
        return node.branches.some((branch) => {
            if (!branch.properties) {
                return false;
            }
            return Object.values(branch.properties).some((property) =>
                property?.diagnostics?.diagnostics?.some((diagnostic) => diagnostic.severity === "ERROR")
            );
        });
    }

    // Check properties
    if (node.properties) {
        const hasPropertyError = Object.values(node.properties).some((property) =>
            property?.diagnostics?.diagnostics?.some((diagnostic) => diagnostic.severity === "ERROR")
        );
        if (hasPropertyError) {
            return true;
        }
    }

    return false;
}

export function isWorkflowNode(nodeOrKind?: FlowNode | string) {
    if (!nodeOrKind) {
        return false;
    }

    const nodeKind = typeof nodeOrKind === "string" ? nodeOrKind : nodeOrKind.codedata?.node;
    return typeof nodeKind === "string" && WORKFLOW_NODE_KINDS.has(nodeKind);
}

export function getNodeTitle(node: FlowNode) {
    const getPropertyString = (key: string): string | undefined => {
        const value = (node.properties as any)?.[key]?.value;
        return typeof value === "string" ? value.trim() : undefined;
    };
    const getFunctionName = (value?: string): string | undefined => {
        if (!value) {
            return undefined;
        }

        return value
            .trim()
            .replace(/^["']|["']$/g, "")
            .split(":")
            .pop()
            ?.split("(")[0]
            ?.trim();
    };

    if (node.codedata?.node === "WAIT") {
        const directExpression = getPropertyString("expression");
        if (directExpression) {
            return `wait : ${directExpression}`;
        }

        const futuresValue = (node.properties as any)?.["futures"]?.value;
        if (futuresValue && typeof futuresValue === "object") {
            for (const future of Object.values(futuresValue as Record<string, any>)) {
                const expression = future?.value?.expression?.value;
                if (typeof expression === "string" && expression.trim()) {
                    return `wait : ${expression.trim()}`;
                }
            }
        }
        return "wait";
    }

    if (node.codedata?.node === "ACTIVITY_CALL" || node.codedata?.node === "CONNECTION_ACTIVITY_CALL") {
        // Builtin activities (ballerina/workflow.activity) carry a friendly label ("Call REST API");
        // older language servers set the generic "callActivity" method name — fall through for those.
        const label = node.metadata?.label;
        if (
            node.codedata?.org === "ballerina" &&
            node.codedata?.module === "workflow.activity" &&
            label &&
            label !== "callActivity"
        ) {
            return label;
        }
        const activityFunction =
            getFunctionName(getPropertyString("activityFunction")) ||
            getFunctionName(typeof node.codedata?.symbol === "string" ? node.codedata.symbol : undefined);
        if (activityFunction) {
            return activityFunction;
        }
    }

    if (node.codedata?.node === "WORKFLOW_RUN") {
        const processFunction = getFunctionName(getPropertyString("processFunction"));
        if (processFunction) {
            return `Run ${processFunction}`;
        }
    }

    // Durable-agentic-workflow register statements keep their plain label ("Register Event", ...)
    // without the module prefix; the registered name renders as the node's second line instead.
    if (isDurableAgentRegisterNode(node)) {
        return node.metadata?.label ?? node.codedata.node;
    }

    const label = node.metadata.label.includes(".") ? node.metadata.label.split(".").pop() : node.metadata.label;

    // An action keeps its own name: the module prefix would describe where the API lives, which is
    // not what these statements are.
    if (isWorkflowActionNode(node)) {
        return label;
    }

    if (node.codedata?.org === "ballerina" || node.codedata?.org === "ballerinax") {
        const module = node.codedata.module?.includes(".")
            ? node.codedata.module.split(".").pop()
            : node.codedata.module;
        return `${module} : ${label}`;
    }
    return label;
}

export function getRawTemplate(text: string) {
    const rawTemplateRegex = /^`.+$`/
    const isRawTemplate = text.match(rawTemplateRegex)?.[0];
    if (!isRawTemplate) {
        return `\`${text}\``;
    }

    return text;
}
