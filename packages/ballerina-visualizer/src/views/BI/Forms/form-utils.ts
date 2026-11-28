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

import { CodeContext, CodeData, ExpressionAssistAction, ExpressionAssistResponse, FlowNode, FormAssistRequest, FormAssistResponse, Imports, LineRange, LinePosition } from "@wso2/ballerina-core";
import { FormAssistContext, FormAssistDescription, FormExpressionEditorProps, FormImports, FormValues, configLiteral } from "@wso2/ballerina-side-panel";
import { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";
import { RemoveEmptyNodesVisitor, traverseNode } from "@wso2/bi-diagram";
import { URI, Utils } from "vscode-uri";

import { updateNodeProperties } from "../../../utils/bi";
import { createMiniChatPrompt } from "../../../components/AgentStatusOrb/promptHandoff";
import { requestMiniChatOpen } from "../../../components/AgentStatusOrb/shared";

export function createNodeWithUpdatedLineRange(node: FlowNode, targetLineRange: LineRange): FlowNode {
    return {
        ...node,
        codedata: {
            ...node.codedata,
            lineRange: {
                ...node.codedata.lineRange,
                startLine: targetLineRange.startLine,
                endLine: targetLineRange.endLine,
            },
        }
    }
}

export function processFormData(data: FormValues): FormValues {
    if ("update-variable" in data) {
        data["variable"] = data["update-variable"];
        data["type"] = "";
    }
    return data;
}

export function updateNodeWithProperties(
    node: FlowNode,
    updatedNode: FlowNode,
    data: FormValues,
    formImports: FormImports,
    dirtyFields?: any
): FlowNode {
    const newNode = { ...updatedNode };

    if (node.branches?.at(0)?.properties) {
        // branch properties
        newNode.branches[0].properties = updateNodeProperties(data, node.branches[0].properties, formImports, dirtyFields);
    } else if (node.properties) {
        // node properties
        newNode.properties = updateNodeProperties(data, node.properties, formImports, dirtyFields);
    } else {
        console.error(">>> Error updating source code. No properties found");
    }

    return newNode;
}

export function removeEmptyNodes(updatedNode: FlowNode): FlowNode {
    const removeEmptyNodeVisitor = new RemoveEmptyNodesVisitor(updatedNode);
    traverseNode(updatedNode, removeEmptyNodeVisitor);
    return removeEmptyNodeVisitor.getNode();
}

function extractInterpolations(backtickStr: string): string {
    const inner = backtickStr.slice(1, -1); // strip surrounding backticks
    let result = '`';
    let i = 0;
    while (i < inner.length) {
        if (inner[i] === '$' && inner[i + 1] === '{') {
            // depth-track to find the real matching }
            let depth = 1, j = i + 2;
            while (j < inner.length && depth > 0) {
                if (inner[j] === '{') depth++;
                else if (inner[j] === '}') depth--;
                j++;
            }
            const interp = inner.slice(i + 2, j - 1);
            result += '${' + deserializeForDiagnosticsAPI(interp) + '}';
            i = j;
        } else {
            result += inner[i++];
        }
    }
    return result + '`';
}

export const deserializeForDiagnosticsAPI = (expr: string): string => {
    return expr.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`|\$\d+/g, (match) => {
        if (match.startsWith('"') || match.startsWith("'")) return match;
        if (match.startsWith('`')) return extractInterpolations(match);
        return "";
    });
};

export type AssistInput = Parameters<NonNullable<FormExpressionEditorProps["assistExpression"]>>[0];

export interface AssistLocation {
    fileName: string;
    startLine: LinePosition;
    codedata?: CodeData;
    imports?: Imports;
}

const LIBRARY_ORGS = new Set(["ballerina", "ballerinax"]);

// A library node's own module, e.g. ballerina/ai for an agent call, which the file may not import until the node is saved.
function nodeImports(codedata?: CodeData): Imports {
    if (!codedata?.org || !codedata.module || !LIBRARY_ORGS.has(codedata.org)) {
        return {};
    }
    return { [codedata.module.split(".").pop()]: `${codedata.org}/${codedata.module}` };
}

const withImports = <T extends { imports?: Imports }>(property: T, imports: Imports): T =>
    Object.keys(imports).length ? { ...property, imports: { ...imports, ...(property.imports ?? {}) } } : property;

async function signedIn(ai: ReturnType<BallerinaRpcClient["getAiPanelRpcClient"]>): Promise<boolean> {
    if (await ai.isUserAuthenticated()) {
        return true;
    }
    ai.promptForLogin();
    return false;
}

// Builds the in-field AI helper's request the way the form builds its diagnostics request, so both see one context.
export async function assistExpressionInForm(
    rpcClient: BallerinaRpcClient,
    { fileName, startLine, codedata, imports }: AssistLocation,
    { key, property, value, variableType, ...input }: AssistInput
): Promise<ExpressionAssistResponse> {
    const ai = rpcClient.getAiPanelRpcClient();
    if (!(await signedIn(ai))) {
        return { error: "Sign in to use AI." };
    }
    const typed = variableType ? { ...property, types: property.types.map((type) => ({ ...type, ballerinaType: variableType })) } : property;
    return ai.assistExpression({
        ...input,
        filePath: fileName,
        field: { label: property.metadata?.label ?? key, description: property.metadata?.description },
        context: {
            expression: deserializeForDiagnosticsAPI(value),
            startLine,
            lineOffset: 0,
            offset: 0,
            codedata,
            property: withImports(typed, { ...nodeImports(codedata), ...(imports ?? {}) }),
        },
    });
}

// The form-level helper's request, with the same context the in-field helper sends.
export async function assistFormInForm(
    rpcClient: BallerinaRpcClient,
    { fileName, startLine, codedata }: AssistLocation,
    request: Pick<FormAssistRequest, "requestId" | "instruction" | "node" | "agent" | "subjectRange" | "shown"> & FormAssistContext & FormAssistDescription
): Promise<FormAssistResponse> {
    const ai = rpcClient.getAiPanelRpcClient();
    if (!(await signedIn(ai))) {
        return { error: "Sign in to use AI." };
    }
    const library = nodeImports(codedata);
    return ai.assistForm({
        ...request,
        slots: request.slots.map((slot) => ({ ...slot, property: withImports(slot.property, library) })),
        groups: request.groups.map((group) => ({ ...group, item: group.item.map((field) => ({ ...field, property: withImports(field.property, library) })) })),
        filePath: fileName,
        // Lookups such as a value's methods run at the form's position; the language server needs a type there.
        context: { expression: "", startLine, lineOffset: 0, offset: 0, codedata, property: { metadata: { label: "", description: "" }, value: "", optional: true, editable: true, types: [{ fieldType: "EXPRESSION", ballerinaType: "any", selected: true }] } },
    });
}

// Closing the form loses what the user typed, so a value that differs from the source is kept as their edit.
const FORM_VALUES = "The form's current values follow. A value that differs from the source is an edit the user made in the form and has not saved yet: keep it as part of this change.";

export const formValuesNote = (values: string[]): string =>
    values.length ? `${FORM_VALUES}\n${values.map((value) => `- ${value}`).join("\n")}` : "";

// Hands a form Copilot's request to the chat with the form's context, then closes the form.
export function continueInChat(rpcClient: BallerinaRpcClient, request: string, hidden: (string | undefined)[], close?: () => void, codeContext?: CodeContext): void {
    const prompt = createMiniChatPrompt(request, { autoSubmit: true, newThread: true, ...(codeContext && { codeContext }), hiddenContext: hidden.filter(Boolean).join("\n") });
    if (!requestMiniChatOpen(prompt)) {
        rpcClient.getAiPanelRpcClient().openAIPanel(prompt);
    }
    close?.();
}

// Declares the configurables an accepted AI suggestion needs, here so a moved secret never leaves the editor; resolves to their undo.
export async function runAssistActions(
    rpcClient: BallerinaRpcClient,
    fileName: string,
    actions: ExpressionAssistAction[],
    fieldValue: string
): Promise<() => Promise<void>> {
    const diagram = rpcClient.getBIDiagramRpcClient();
    const { projectPath } = await rpcClient.getVisualizerLocation();
    const toml = await rpcClient.getCommonRpcClient().getCurrentProjectTomlValues();
    const packageName = `${toml?.package?.org}/${toml?.package?.name}`;
    for (const { name, type, documentation, useFieldValue } of actions) {
        const { flowNode: node } = await diagram.getConfigVariableNodeTemplate({ isNew: true, isEnvVariable: false });
        // One created from a test file belongs to that file.
        if (/[\\/]tests[\\/]/.test(fileName)) {
            node.codedata.data = { ...node.codedata.data, filePath: fileName };
        }
        setProperty(node, "variable", name);
        setProperty(node, "type", type);
        setProperty(node, "documentation", documentation);
        // A `configValue` also goes to Config.toml, which holds only plain values; an expression would make it invalid.
        setProperty(node, "configValue", useFieldValue && configLiteral(fieldValue) ? fieldValue.trim() : undefined);
        node.properties.defaultValue.modified = true;
        await diagram.updateConfigVariablesV2({
            configFilePath: Utils.joinPath(URI.file(projectPath), "config.bal").fsPath,
            configVariable: node,
            packageName,
            moduleName: "",
        });
    }
    return () => removeConfigurables(rpcClient, projectPath, packageName, actions.map(({ name }) => name));
}

// Deletes configurables the root module declares, with their Config.toml values; each delete moves the rest, so the list is read again.
async function removeConfigurables(rpcClient: BallerinaRpcClient, projectPath: string, packageName: string, names: string[]): Promise<void> {
    const diagram = rpcClient.getBIDiagramRpcClient();
    for (const name of names) {
        const { configVariables } = await diagram.getConfigVariablesV2({ projectPath: "", includeLibraries: false });
        const declared = (configVariables as unknown as Record<string, Record<string, FlowNode[]>>)?.[packageName]?.[""] ?? [];
        const node = declared.find((node) => node.properties?.variable?.value === name);
        if (node) {
            await diagram.deleteConfigVariableV2({
                configFilePath: Utils.joinPath(URI.file(projectPath), "config.bal").fsPath,
                configVariable: node,
                packageName,
                moduleName: "",
            });
        }
    }
}

function setProperty(node: FlowNode, key: string, value: string | undefined) {
    const property = node.properties?.[key as keyof typeof node.properties];
    if (property && value) {
        property.value = value;
        property.modified = true;
    }
}
