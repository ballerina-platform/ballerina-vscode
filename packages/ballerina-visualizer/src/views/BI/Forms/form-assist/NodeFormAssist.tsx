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
import { CodeContext, FlowNode, LineRange, Property, isSensitiveField } from "@wso2/ballerina-core";
import { FormAssist, FormAssistDescription, RunFormAssist, useAssistParts } from "@wso2/ballerina-side-panel";
import { BallerinaRpcClient, useRpcContext } from "@wso2/ballerina-rpc-client";
import { AssistLocation, assistFormInForm, continueInChat, formValuesNote, runAssistActions } from "../form-utils";
import { nodeAssistSchema } from "./schemas";
import { convertNodePropertyToFormField } from "../../../../utils/node-property-utils";
import { CONNECTION_TYPE_CONFIGS } from "../../../../components/ConnectionSelector/config";
import { useAssistTarget } from "../../AIChatAgent/agentScope";

interface NodeFormAssistProps {
    node: FlowNode;
    // The node as saved, when the form shows Copilot's applied values; a hand-off never puts a saved value back over an edit.
    saved?: FlowNode;
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

const NOT_SETTINGS = ["variable", "type", "scope", "checkError"];

// How the connection an action call uses is built, e.g. its base URL, so a path is written relative to it; credentials stay out.
async function connectionNote(rpcClient: BallerinaRpcClient, node: FlowNode): Promise<string> {
    const name = node.properties?.connection?.value;
    if (typeof name !== "string" || !name) {
        return "";
    }
    const response = await rpcClient.getBIDiagramRpcClient().getModuleNodes().catch((): undefined => undefined);
    const connection = response?.flowModel?.connections?.find((known) => known.properties?.variable?.value === name);
    const settings = Object.entries(connection?.properties ?? {})
        .filter(([key, property]) => typeof property?.value === "string" && property.value.trim() && !NOT_SETTINGS.includes(key)
            && !isSensitiveField(key, property.metadata?.label))
        .map(([key, property]) => `${property.metadata?.label || key}: ${property.value}`);
    return settings.length ? `${name} is built with ${settings.join("; ")}` : "";
}

/** Whether the node's form has values or rows the form's Copilot can fill. */
export function hasNodeFormAssist(node: FlowNode): boolean {
    const { slots, groups } = nodeAssistSchema(node).describe(node);
    return groups.length > 0 || slots.length > 0;
}

// The form's own parts beside the node's properties, e.g. a custom toggle; a key the node describes stays the node's.
function withParts(own: FormAssistDescription, parts: Pick<FormAssistDescription, "slots" | "groups">): FormAssistDescription {
    const slots = new Set(own.slots.map((slot) => slot.path));
    const groups = new Set(own.groups.map((group) => group.id));
    return {
        ...own,
        slots: [...own.slots, ...parts.slots.filter((slot) => !slots.has(slot.path))],
        groups: [...own.groups, ...parts.groups.filter((group) => !groups.has(group.id))],
    };
}

// A saved node's own lines, so its Copilot can read it and find where it is used; a form placed elsewhere, e.g. at the file's end, still checks values there.
function savedRange(node: FlowNode, { fileName }: AssistLocation): LineRange | undefined {
    const range = node.codedata.lineRange;
    return range && !node.codedata.isNew && fileName.replace(/\\/g, "/").endsWith(range.fileName) ? range : undefined;
}

// A new node's name still as the form made it up, e.g. aiAgent, so the request names it.
function markGeneratedName(description: FormAssistDescription, node: FlowNode): FormAssistDescription {
    const generated = (path: string, value: string) => {
        const property = node.properties?.[path.replace(/^properties\./, "") as keyof FlowNode["properties"]];
        const type = property?.types?.find((option) => option.selected) ?? property?.types?.[0];
        return type?.fieldType === "IDENTIFIER" && property.value === value;
    };
    return node.codedata.isNew
        ? { ...description, slots: description.slots.map((slot) => generated(slot.path, slot.value) ? { ...slot, generatedName: true } : slot) }
        : description;
}

// The project item a property picks, e.g. a memory store, as its field's selector searches for it.
function pickedKind(key: string, property: Property): string | undefined {
    return convertNodePropertyToFormField(key, property).codedata?.searchNodesKind
        ?? Object.entries(CONNECTION_TYPE_CONFIGS).find(([, config]) => [config.nodePropertyKey].flat().includes(key))?.[0];
}

// A value that picks a project item names its kind, so a new one, or a setting of its own, goes to the main Copilot.
function markPicked(description: FormAssistDescription, node: FlowNode): FormAssistDescription {
    return {
        ...description,
        slots: description.slots.map((slot) => {
            const key = slot.path.replace(/^properties\./, "");
            const property = node.properties?.[key as keyof FlowNode["properties"]] as Property | undefined;
            const kind = property && pickedKind(key, property);
            return kind ? { ...slot, property: { ...slot.property, codedata: { ...slot.property.codedata, searchNodesKind: kind } } } : slot;
        }),
    };
}

// The chat edits the source at the step: the saved node itself, or the spot where a new one goes.
function stepContext(node: FlowNode, { fileName, startLine }: AssistLocation): CodeContext {
    const range = node.codedata.lineRange;
    return range && !node.codedata.isNew
        ? { type: "selection", startPosition: range.startLine, endPosition: range.endLine, filePath: fileName }
        : { type: "addition", position: startLine, filePath: fileName };
}

// Steps a hand-off usually wraps, by the statement the diagram draws them from.
const STATEMENTS: Record<string, string> = { FAIL: "a fail statement", RETURN: "a return statement", PANIC: "a panic statement" };

// What the chat needs to write the step: its kind, whether it exists yet, and the values the form held unsaved.
function stepNote(node: FlowNode, values: string[]): string {
    const kind = node.codedata.node;
    const step = `${node.metadata?.label ?? kind} node${STATEMENTS[kind] ? `, written as ${STATEMENTS[kind]},` : ` (node kind ${kind})`}`;
    const where = node.codedata.isNew
        ? `The ${step} is new and not in the source yet: write it at the given position as part of this change.`
        : `The ${step} is the selected code; keep it as that kind of statement.`;
    return [where, formValuesNote(values)].filter(Boolean).join(" ");
}

// Lets a field's Copilot request reach the whole node form; each form only says how to read its values and how to rebuild.
export function NodeFormAssist({ node, saved = node, location, toNode, reseed, onClose }: NodeFormAssistProps) {
    const { rpcClient } = useRpcContext();
    const target = useAssistTarget(rpcClient);
    const close = target.close ?? onClose;
    const schema = nodeAssistSchema(node);
    const fillable = useMemo(() => hasNodeFormAssist(node), [node]);
    const parts = useAssistParts();
    if (!fillable) {
        return null;
    }
    const run: RunFormAssist = async (instruction, description, requestId, context) =>
        assistFormInForm(rpcClient, location, {
            requestId,
            instruction,
            node: [describeNode(node), target.subject, await connectionNote(rpcClient, node)].filter(Boolean).join(", "),
            agent: target.agent,
            subjectRange: savedRange(node, location),
            ...context,
            ...description,
        });
    const handOff = async (request: string, values: string[], context?: string) =>
        continueInChat(rpcClient, request, [...await target.handoffContext(), stepNote(node, values), context], close, stepContext(node, location));
    return (
        <FormAssist
            describe={() => withParts(markPicked(markGeneratedName(schema.describe(toNode()), node), node), parts.describe())}
            run={run}
            abort={(requestId) => rpcClient.getAiPanelRpcClient().abortExpressionAssist({ requestId })}
            onApply={(response) => reseed(schema.apply(toNode(), { ...response, ...parts.apply(response) }))}
            formId={`${location.fileName}:${location.startLine?.line}:${node.codedata.node}`}
            onContinueInChat={close ? handOff : undefined}
            runAssistActions={(actions, value) => runAssistActions(rpcClient, location.fileName, actions, value)}
            savedValue={(path) => schema.describe(saved).slots.find((slot) => slot.path === path)?.value}
        />
    );
}
