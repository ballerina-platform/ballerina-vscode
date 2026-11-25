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

import { CodeData, ConfigVariable, ExpressionAssistAction, ExpressionAssistResponse, FlowNode, FormAssistRequest, FormAssistResponse, Imports, LineRange, LinePosition } from "@wso2/ballerina-core";
import { ConfigurableSeed, SECRET_VALUE, FormAssistContext, FormAssistDescription, FormExpressionEditorProps, FormImports, FormValues } from "@wso2/ballerina-side-panel";
import { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";
import { RemoveEmptyNodesVisitor, traverseNode } from "@wso2/bi-diagram";
import { URI, Utils } from "vscode-uri";

import { updateNodeProperties } from "../../../utils/bi";

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

// Builds the in-field AI helper's request the way the form builds its diagnostics request, so both see one context.
export async function assistExpressionInForm(
    rpcClient: BallerinaRpcClient,
    { fileName, startLine, codedata, imports }: AssistLocation,
    { key, property, value, variableType, ...input }: AssistInput
): Promise<ExpressionAssistResponse> {
    const ai = rpcClient.getAiPanelRpcClient();
    if (!(await ai.isUserAuthenticated())) {
        ai.promptForLogin();
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
    if (!(await ai.isUserAuthenticated())) {
        ai.promptForLogin();
        return { error: "Sign in to use AI." };
    }
    const library = nodeImports(codedata);
    return ai.assistForm({
        ...request,
        slots: request.slots.map((slot) => ({ ...slot, property: withImports(slot.property, library) })),
        groups: request.groups.map((group) => ({ ...group, item: group.item.map((field) => ({ ...field, property: withImports(field.property, library) })) })),
        filePath: fileName,
        context: { expression: "", startLine, lineOffset: 0, offset: 0, codedata, property: { metadata: { label: "", description: "" }, value: "", optional: true, editable: true, types: [] } },
    });
}

// A new configurable's node; one created from a test file belongs to that file.
export async function configurableTemplate(rpcClient: BallerinaRpcClient, fileName: string): Promise<FlowNode> {
    const { flowNode } = await rpcClient.getBIDiagramRpcClient().getConfigVariableNodeTemplate({ isNew: true, isEnvVariable: false });
    if (fileName.includes("/tests/")) {
        flowNode.codedata.data = { ...flowNode.codedata.data, filePath: fileName };
    }
    return flowNode;
}

// Declares the configurable in config.bal; a `configValue` also goes to Config.toml.
export async function saveConfigurable(rpcClient: BallerinaRpcClient, projectPath: string, node: FlowNode): Promise<void> {
    const toml = await rpcClient.getCommonRpcClient().getCurrentProjectTomlValues();
    node.properties.defaultValue.modified = true;
    const configValue = node.properties.configValue;
    if (configValue?.value) {
        // Config.toml takes a literal; the secret field holds plain text.
        configValue.value = configValue.codedata?.kind === SECRET_VALUE ? JSON.stringify(configValue.value) : configValue.value;
        configValue.modified = true;
    }
    await rpcClient.getBIDiagramRpcClient().updateConfigVariablesV2({
        configFilePath: Utils.joinPath(URI.file(projectPath), "config.bal").fsPath,
        configVariable: node,
        packageName: `${toml?.package?.org}/${toml?.package?.name}`,
        moduleName: "",
    });
}

// Runs what an accepted AI suggestion needs outside its field. Runs here, so a moved secret never leaves the editor.
export async function runAssistActions(
    rpcClient: BallerinaRpcClient,
    fileName: string,
    actions: ExpressionAssistAction[],
    fieldValue: string
): Promise<void> {
    const { projectPath } = await rpcClient.getVisualizerLocation();
    for (const { name, type, documentation, useFieldValue } of actions) {
        const node = await configurableTemplate(rpcClient, fileName);
        setProperty(node, "variable", name);
        setProperty(node, "type", type);
        setProperty(node, "documentation", documentation);
        setProperty(node, "configValue", useFieldValue ? fieldValue.trim() : undefined);
        await saveConfigurable(rpcClient, projectPath, node);
    }
}

// Names of the project's configurables of a type, e.g. the `string` ones for an API key field.
export async function listConfigurables(rpcClient: BallerinaRpcClient, type: string): Promise<string[]> {
    const { projectPath } = await rpcClient.getVisualizerLocation();
    const response = await rpcClient.getBIDiagramRpcClient().getConfigVariablesV2({ includeLibraries: false, projectPath });
    const byModule = Object.values(response?.configVariables ?? {}) as unknown as Record<string, ConfigVariable[]>[];
    const base = type.replace(/\?$/, "");
    return byModule.flatMap((modules) => Object.values(modules).flat())
        .filter((variable) => String(variable.properties?.type?.value ?? "").replace(/\?$/, "") === base)
        .map((variable) => String(variable.properties?.variable?.value));
}

// Fills the New Configurable form for a field: its type is fixed, and the value goes to Config.toml, never to the code.
export function seedConfigurable(node: FlowNode, { name, type, documentation, value }: ConfigurableSeed) {
    setProperty(node, "variable", name);
    setProperty(node, "type", type);
    setProperty(node, "documentation", documentation);
    const { type: typeProperty, defaultValue, documentation: docs, configValue } = node.properties;
    typeProperty.editable = false;
    defaultValue.hidden = true;
    docs.hidden = true;
    Object.assign(configValue, {
        hidden: false,
        value: value ?? "",
        metadata: { label: "Value", description: "Saved in Config.toml." },
        codedata: { ...configValue.codedata, kind: SECRET_VALUE },
    });
}

function setProperty(node: FlowNode, key: string, value: string | undefined) {
    const property = node.properties?.[key as keyof typeof node.properties];
    if (property && value) {
        property.value = value;
        property.modified = true;
    }
}
