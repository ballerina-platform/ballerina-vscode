/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, { useMemo } from "react";
import { CodeContext, FlowNode } from "@wso2/ballerina-core";
import { FormAssist, RunFormAssist } from "@wso2/ballerina-side-panel";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { createMiniChatPrompt } from "../../../../components/AgentStatusOrb/promptHandoff";
import { requestMiniChatOpen } from "../../../../components/AgentStatusOrb/shared";
import { AssistLocation, assistFormInForm } from "../form-utils";
import { nodeAssistSchema } from "./schemas";
import { useAssistTarget } from "../../AIChatAgent/agentScope";

interface NodeFormAssistProps {
    node: FlowNode;
    location: AssistLocation;
    // The node with the form's current, unsaved values.
    toNode: () => FlowNode;
    // Rebuilds the form from a node, so every editor shows the applied values.
    reseed: (node: FlowNode) => void;
    // Closes the form once the chat takes the step over.
    onClose?: () => void;
}

// The node's kind with the connection and action it calls, e.g. a model provider's generate, so the request never asks which.
function describeNode(node: FlowNode): string {
    const connection = node.properties?.connection?.value;
    const name = node.properties?.variable?.value;
    const action = node.codedata.symbol;
    return [node.codedata.node, typeof name === "string" && name ? `named ${name}` : "",
        typeof connection === "string" && connection ? `on ${connection}` : "", action ? `(${action})` : ""]
        .filter(Boolean).join(" ");
}

/** Whether the node's form has values or rows the form's Copilot can fill. */
export function hasNodeFormAssist(node: FlowNode): boolean {
    const described = nodeAssistSchema(node)?.describe(node);
    return !!described && (described.groups.length > 0 || described.slots.length > 0);
}

// The chat edits the source at the step: the saved node itself, or the spot where a new one goes.
function stepContext(node: FlowNode, { fileName, startLine }: AssistLocation): CodeContext {
    const range = node.codedata.lineRange;
    return range && !node.codedata.isNew
        ? { type: "selection", startPosition: range.startLine, endPosition: range.endLine, filePath: fileName }
        : { type: "addition", position: startLine, filePath: fileName };
}

// Closing the form loses what the user typed, so a value that differs from the source is kept as their edit.
export const FORM_VALUES = "The form's current values follow. A value that differs from the source is an edit the user made in the form and has not saved yet: keep it as part of this change.";

// Steps a hand-off usually wraps, by the statement the diagram draws them from.
const STATEMENTS: Record<string, string> = { FAIL: "a fail statement", RETURN: "a return statement", PANIC: "a panic statement" };

// What the chat needs to write the step: its kind, whether it exists yet, and the values the form held unsaved.
function stepNote(node: FlowNode, values: string[]): string {
    const kind = node.codedata.node;
    const step = `${node.metadata?.label ?? kind} node${STATEMENTS[kind] ? `, written as ${STATEMENTS[kind]},` : ` (node kind ${kind})`}`;
    const where = node.codedata.isNew
        ? `The ${step} is new and not in the source yet: write it at the given position as part of this change.`
        : `The ${step} is the selected code; keep it as that kind of statement.`;
    return values.length ? `${where} ${FORM_VALUES}\n${values.map((value) => `- ${value}`).join("\n")}` : where;
}

// Lets a field's Copilot request reach the whole node form; each form only says how to read its values and how to rebuild.
export function NodeFormAssist({ node, location, toNode, reseed, onClose }: NodeFormAssistProps) {
    const { rpcClient } = useRpcContext();
    const target = useAssistTarget(rpcClient);
    const close = target.close ?? onClose;
    const schema = nodeAssistSchema(node);
    const fillable = useMemo(() => hasNodeFormAssist(node), [node]);
    if (!schema || !fillable) {
        return null;
    }
    const run: RunFormAssist = (instruction, description, requestId, context) =>
        assistFormInForm(rpcClient, location, { requestId, instruction, node: [describeNode(node), target.subject].filter(Boolean).join(", "), agent: target.agent, ...context, ...description });
    const continueInChat = async (request: string, values: string[], context?: string) => {
        const prompt = createMiniChatPrompt(request, {
            autoSubmit: true,
            newThread: true,
            codeContext: stepContext(node, location),
            hiddenContext: [...await target.handoffContext(), stepNote(node, values), context].filter(Boolean).join("\n"),
        });
        if (!requestMiniChatOpen(prompt)) {
            rpcClient.getAiPanelRpcClient().openAIPanel(prompt);
        }
        close?.();
    };
    return (
        <FormAssist
            describe={() => schema.describe(toNode())}
            run={run}
            abort={(requestId) => rpcClient.getAiPanelRpcClient().abortExpressionAssist({ requestId })}
            onApply={(response) => reseed(schema.apply(toNode(), response))}
            formId={`${location.fileName}:${location.startLine?.line}:${node.codedata.node}`}
            onContinueInChat={close ? continueInChat : undefined}
        />
    );
}
