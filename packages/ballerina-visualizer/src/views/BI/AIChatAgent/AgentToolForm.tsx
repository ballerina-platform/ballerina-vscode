/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import {
    AgentToolHostClass,
    DIRECTORY_MAP,
    FlowNode,
    FunctionModel,
    LineRange,
    NodeProperties,
    Property,
    RecordTypeField,
    getPrimaryInputType,
    isTemplateType,
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { FormField, FormImports, FormValues } from "@wso2/ballerina-side-panel";
import { cloneDeep } from "lodash";
import { RelativeLoader } from "../../../components/RelativeLoader";
import { convertConfig, convertNodePropertyToFormField, getImportsForProperty } from "../../../utils/bi";
import ArtifactForm from "../Forms/ArtifactForm";
import { fetchOAuthConfigProperties } from "./utils";
import {
    convertParameterToParamValue,
    convertSchemaToFormFields,
    getFunctionParametersList,
    handleParamChange,
} from "../ServiceFunctionForm/utils";

export interface AgentToolEditContext {
    functionName: string;
    inClass: boolean;
    lineRange?: LineRange;
}

const LoaderContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

const SectionHeader = styled.div`
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 20px;
    margin-top: -4px;
    border-top: 1px solid var(--vscode-editorWidget-border);
`;

const SectionDescription = styled.span`
    color: var(--vscode-list-deemphasizedForeground);
`;

interface AgentToolFormProps {
    filePath: string;
    projectPath: string;
    hostClass?: AgentToolHostClass;
    targetLineRange?: LineRange;
    editContext?: AgentToolEditContext;
    nestedForm?: boolean;
    onSave: (toolName: string) => void | Promise<void>;
    onBack?: () => void;
}

interface ParsedConfigValue {
    value: string;
    isExpression: boolean;
}

function matchBraced(str: string, re: RegExp): { start: number; end: number; body: string } | null {
    const m = re.exec(str);
    if (!m) return null;
    const open = m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < str.length; i++) {
        if (str[i] === "{") depth++;
        else if (str[i] === "}" && --depth === 0) {
            return { start: m.index, end: i + 1, body: str.substring(open + 1, i) };
        }
    }
    return null;
}

function parseAuth(annotationValue: string, oauthKeys: string[]): Record<string, ParsedConfigValue> {
    const result: Record<string, ParsedConfigValue> = {};
    const auth = matchBraced(annotationValue, /auth\s*:\s*\{/);
    if (!auth) return result;
    const configBlock = auth.body;

    for (const key of oauthKeys) {
        if (key === "scopes") {
            const scopesMatch = configBlock.match(/scopes\s*:\s*\[([^\]]*)\]/);
            if (scopesMatch) {
                const items = scopesMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
                const unwrapped = items.map((item) => {
                    const strTemplate = item.match(/^string\s*`([^`]*)`$/);
                    if (strTemplate) return { val: strTemplate[1], isLiteral: true };
                    const quoted = item.match(/^"([^"]*)"$/);
                    if (quoted) return { val: quoted[1], isLiteral: true };
                    return { val: item, isLiteral: false };
                });
                const allLiteral = unwrapped.every((u) => u.isLiteral);
                result.scopes = {
                    value: JSON.stringify(unwrapped.map((u) => u.val)),
                    isExpression: !allLiteral,
                };
            }
            continue;
        }
        if (key === "isPkceEnabled") {
            const boolMatch = configBlock.match(/isPkceEnabled\s*:\s*(true|false)/);
            if (boolMatch) {
                result.isPkceEnabled = { value: boolMatch[1], isExpression: false };
            }
            continue;
        }
        const rec = matchBraced(configBlock, new RegExp(`(?:^|,)\\s*${key}\\s*:\\s*\\{`));
        if (rec) {
            result[key] = { value: `{${rec.body}}`, isExpression: false };
            continue;
        }
        const valueMatch = configBlock.match(new RegExp(`${key}\\s*:\\s*(.+?)\\s*(?:,|$)`, "m"));
        if (!valueMatch) continue;
        const raw = valueMatch[1].trim();
        const strTemplate = raw.match(/^string\s*`([^`]*)`$/);
        if (strTemplate) {
            result[key] = { value: strTemplate[1], isExpression: false };
            continue;
        }
        const quoted = raw.match(/^"([^"]*)"$/);
        if (quoted) {
            result[key] = { value: quoted[1], isExpression: false };
            continue;
        }
        result[key] = { value: raw, isExpression: true };
    }
    return result;
}

function buildAuthAnnotation(config: Record<string, string>, expressionKeys: Set<string>): string {
    const entries = Object.entries(config);
    if (entries.length === 0) {
        return "";
    }
    const parts = entries.map(([key, value]) => `${key}: ${toAuthSource(key, value, expressionKeys.has(key))}`);
    return `auth: {\n        ${parts.join(",\n        ")}\n    }`;
}

function toAuthSource(key: string, value: unknown, isExpression: boolean): string {
    const text = String(value ?? "").trim();
    if (!text) {
        return "";
    }
    if (key === "isPkceEnabled" || isExpression || /^".*"$/.test(text)
        || /^string\s*`[\s\S]*`$/.test(text) || /^\{[\s\S]*\}$/.test(text)) {
        return text;
    }
    if (key === "scopes") {
        try {
            const scopes = JSON.parse(text) as string[];
            return `[${scopes.join(", ")}]`;
        } catch {
            return text.startsWith("[") ? text : `[${text}]`;
        }
    }
    return JSON.stringify(text);
}

function findAgentToolAnnotation(model: FunctionModel): { key: string; value: string } | undefined {
    const props = (model?.properties ?? {}) as Record<string, any>;
    for (const [key, prop] of Object.entries(props)) {
        if (prop?.codedata?.type === "ANNOTATION_ATTACHMENT" && prop?.codedata?.originalName === "AgentTool") {
            return { key, value: typeof prop.value === "string" ? prop.value : "" };
        }
    }
    return undefined;
}

export function AgentToolForm(props: AgentToolFormProps): JSX.Element {
    const { filePath, projectPath, hostClass, targetLineRange, editContext, nestedForm, onSave, onBack } = props;
    const { rpcClient } = useRpcContext();
    const [toolNode, setToolNode] = useState<FlowNode>();
    const [functionModel, setFunctionModel] = useState<FunctionModel>();
    const [fields, setFields] = useState<FormField[]>([]);
    const [formRange, setFormRange] = useState<LineRange | undefined>(targetLineRange ?? editContext?.lineRange);
    const [recordTypeFields, setRecordTypeFields] = useState<RecordTypeField[]>([]);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const oauthPropertiesRef = useRef<{ key: string; property: Property }[]>([]);

    const isEdit = Boolean(editContext);
    const isClassEdit = Boolean(editContext?.inClass);

    const applyToolFieldDocs = (field: FormField) => {
        if (field.key === "functionName") {
            field.documentation = "Name of the agent tool.";
        } else if (field.key === "functionNameDescription") {
            field.documentation = "Describe when and how an AI agent should use this tool.";
        } else if (field.key === "parameters") {
            field.documentation = "Define the inputs the agent supplies when invoking this tool.";
            const primaryType = getPrimaryInputType(field.types);
            if (primaryType && isTemplateType(primaryType)
                && (primaryType.template as any).value?.parameterDescription) {
                (primaryType.template as any).value.parameterDescription.type = "TEXTAREA";
            }
        }
    };

    const buildOAuthFields = (
        oauthProperties: { key: string; property: Property }[],
        existingConfig: Record<string, ParsedConfigValue>
    ): { oauthFields: FormField[]; oauthRecordFields: RecordTypeField[] } => {
        const oauthFields = oauthProperties.map(({ key, property }) => {
            const field = convertNodePropertyToFormField(key, property);
            const parsed = existingConfig[key];
            if (parsed !== undefined) {
                field.value = parsed.value;
                if (field.types) {
                    field.types = field.types.map((t) => ({
                        ...t,
                        selected: parsed.isExpression ? t.fieldType === "EXPRESSION" : t.fieldType !== "EXPRESSION",
                    }));
                }
                if (parsed.isExpression) {
                    field.type = "EXPRESSION";
                }
            }
            return field;
        });
        const oauthRecordFields = oauthProperties
            .filter(({ property }) => getPrimaryInputType(property?.types)?.typeMembers
                ?.some((member) => member.kind === "RECORD_TYPE"))
            .map(({ key, property }) => ({
                key,
                property,
                recordTypeMembers: getPrimaryInputType(property.types)?.typeMembers
                    ?.filter((member) => member.kind === "RECORD_TYPE"),
            }));
        return { oauthFields, oauthRecordFields };
    };

    const buildClassToolFields = (model: FunctionModel): FormField[] => {
        const list: FormField[] = [
            {
                key: "name",
                label: "Name",
                type: "IDENTIFIER",
                optional: model.name.optional,
                editable: model.name.editable,
                advanced: model.name.advanced,
                enabled: model.name.enabled,
                documentation: "Name of the agent tool.",
                value: model.name.value,
                types: model.name.types,
                lineRange: model?.name?.codedata?.lineRange as any,
            },
        ];
        list.push({
            key: "description",
            label: "Description",
            type: "DOC_TEXT",
            optional: true,
            editable: true,
            enabled: true,
            documentation: "Describe when and how an AI agent should use this tool.",
            value: model.documentation?.value || "",
            types: [{ fieldType: "DOC_TEXT", selected: true }],
        });
        list.push({
            key: "parameters",
            label: "Parameters",
            type: "PARAM_MANAGER",
            optional: true,
            editable: true,
            enabled: true,
            documentation: "Define the inputs the agent supplies when invoking this tool.",
            value: model.parameters.map((param, index) => convertParameterToParamValue(param, index)),
            paramManagerProps: {
                paramValues: model.parameters.map((param, index) => convertParameterToParamValue(param, index)),
                formFields: convertSchemaToFormFields(model.schema),
                handleParameter: handleParamChange,
            },
            types: [{ fieldType: "PARAM_MANAGER", selected: false }],
        });
        list.push({
            key: "returnType",
            label: model.returnType.metadata?.label || "Return Type",
            type: "TYPE",
            optional: model.returnType.optional,
            enabled: model.returnType.enabled,
            editable: model.returnType.editable,
            advanced: model.returnType.advanced,
            documentation: "Type of the value the tool returns.",
            value: model.returnType.value,
            types: model.returnType.types,
        });
        const returnDoc = (model.returnType as any)?.documentation;
        list.push({
            key: "returnDescription",
            label: "Return Description",
            type: "DOC_TEXT",
            optional: true,
            editable: true,
            enabled: true,
            documentation: "Describe the value this tool returns.",
            value: returnDoc?.value || "",
            types: [{ fieldType: "DOC_TEXT", selected: true }],
        });
        return list.filter((field) => field.enabled !== false);
    };

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const fileName = filePath.split(/[\\/]/).pop() as string;
                const oauthStartLine = editContext?.lineRange?.startLine
                    ?? targetLineRange?.startLine ?? { line: 0, offset: 0 };

                if (editContext && !editContext.inClass) {
                    const [res, oauthProperties] = await Promise.all([
                        rpcClient.getBIDiagramRpcClient().getFunctionNode({
                            functionName: editContext.functionName,
                            fileName,
                            projectPath,
                        }),
                        fetchOAuthConfigProperties(rpcClient, filePath, oauthStartLine),
                    ]);
                    if (cancelled) return;
                    const node = res.functionDefinition as FlowNode;
                    const annotationValue = typeof node.properties?.annotations?.value === "string"
                        ? (node.properties.annotations.value as string) : "";

                    const baseFields = convertConfig(node.properties);
                    baseFields.forEach((field) => {
                        if (field.key === "isIsolated" || field.key === "annotations" || field.key === "isPublic") {
                            field.hidden = true;
                            field.editable = false;
                        }
                        if (field.key === "functionNameDescription") {
                            field.type = "DOC_TEXT";
                        }
                        applyToolFieldDocs(field);
                    });

                    oauthPropertiesRef.current = oauthProperties;
                    const existingConfig = parseAuth(annotationValue, oauthProperties.map(({ key }) => key));
                    const { oauthFields, oauthRecordFields } = buildOAuthFields(oauthProperties, existingConfig);

                    setToolNode(node);
                    setFields([...baseFields, ...oauthFields]);
                    setRecordTypeFields(oauthRecordFields);
                    setFormRange(node.codedata?.lineRange as LineRange);
                    return;
                }

                if (editContext && editContext.inClass && editContext.lineRange) {
                    const [modelResp, oauthProperties] = await Promise.all([
                        rpcClient.getServiceDesignerRpcClient().getFunctionFromSource({
                            filePath,
                            codedata: { lineRange: editContext.lineRange as any },
                        }),
                        fetchOAuthConfigProperties(rpcClient, filePath, oauthStartLine),
                    ]);
                    if (cancelled) return;
                    const model = modelResp.function;

                    oauthPropertiesRef.current = oauthProperties;
                    const annotationValue = findAgentToolAnnotation(model)?.value ?? "";
                    const existingConfig = parseAuth(annotationValue, oauthProperties.map(({ key }) => key));
                    const { oauthFields, oauthRecordFields } = buildOAuthFields(oauthProperties, existingConfig);

                    setFunctionModel(model);
                    setFields([...buildClassToolFields(model), ...oauthFields]);
                    setRecordTypeFields(oauthRecordFields);
                    setFormRange(editContext.lineRange);
                    return;
                }

                const [templateResponse, oauthProperties] = await Promise.all([
                    rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                        position: targetLineRange?.startLine ?? { line: 0, offset: 0 },
                        filePath,
                        id: { node: "AGENT_TOOL" },
                    }),
                    fetchOAuthConfigProperties(rpcClient, filePath, oauthStartLine),
                ]);
                if (cancelled) return;

                const node = templateResponse.flowNode;
                node.codedata = {
                    ...node.codedata,
                    isNew: true,
                    data: {
                        ...node.codedata?.data,
                        toolKind: "CUSTOM",
                        ...(hostClass
                            ? { hostClassName: hostClass.className, filePath: hostClass.filePath }
                            : {}),
                    },
                };

                if (node.properties?.isPublic) {
                    node.properties.isPublic.hidden = true;
                    node.properties.isPublic.editable = false;
                }

                const baseFields = convertConfig(node.properties);
                baseFields.forEach(applyToolFieldDocs);

                oauthPropertiesRef.current = oauthProperties;
                const { oauthFields, oauthRecordFields } = buildOAuthFields(oauthProperties, {});

                setToolNode(node);
                setFields([...baseFields, ...oauthFields]);
                setRecordTypeFields(oauthRecordFields);
                if (!targetLineRange) {
                    const eof = await rpcClient.getBIDiagramRpcClient().getEndOfFile({ filePath });
                    if (!cancelled) {
                        setFormRange({ startLine: eof, endLine: eof });
                    }
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [filePath, hostClass?.className, hostClass?.filePath, projectPath, rpcClient, targetLineRange,
        editContext?.functionName, editContext?.inClass]);

    const oauthKeys = useMemo(
        () => new Set(oauthPropertiesRef.current.map(({ key }) => key)),
        [fields]
    );

    const handleClassEditSubmit = async (data: FormValues, formImports?: FormImports) => {
        if (!functionModel || saving) return;
        setSaving(true);
        try {
            const updatedModel = cloneDeep(functionModel);
            updatedModel.name.value = String(data.name);
            updatedModel.returnType.value = String(data.returnType);
            updatedModel.returnType.imports = getImportsForProperty("returnType", formImports);
            updatedModel.parameters = data.parameters
                ? getFunctionParametersList(data.parameters as any, updatedModel) : [];
            if (data.description !== undefined) {
                updatedModel.documentation = { ...(updatedModel.documentation ?? {}), value: String(data.description) } as any;
            }
            if (data.returnDescription !== undefined && updatedModel.returnType) {
                (updatedModel.returnType as any).documentation = {
                    ...((updatedModel.returnType as any).documentation ?? {}),
                    value: String(data.returnDescription),
                };
            }

            const annotation = findAgentToolAnnotation(updatedModel);
            if (annotation) {
                const rawAuth: Record<string, string> = {};
                const expressionKeys = new Set<string>();
                for (const { key } of oauthPropertiesRef.current) {
                    const value = data[key];
                    if (value === undefined || value === "") continue;
                    rawAuth[key] = String(value);
                    const field = fields.find((candidate) => candidate.key === key);
                    if (field?.types?.some((type) => type.selected && type.fieldType === "EXPRESSION")) {
                        expressionKeys.add(key);
                    }
                }
                const authFragment = buildAuthAnnotation(rawAuth, expressionKeys);
                (updatedModel.properties as any)[annotation.key].value = authFragment ? `{\n    ${authFragment}\n}` : "";
            }

            const lineRange = functionModel.codedata?.lineRange ?? editContext?.lineRange;
            if (!lineRange) {
                throw new Error("Missing line range for in-class agent tool update");
            }
            await rpcClient.getServiceDesignerRpcClient().updateResourceSourceCode({
                filePath,
                codedata: {
                    lineRange: {
                        startLine: { line: lineRange.startLine.line, offset: lineRange.startLine.offset },
                        endLine: { line: lineRange.endLine.line, offset: lineRange.endLine.offset },
                    },
                },
                function: updatedModel,
                artifactType: DIRECTORY_MAP.TYPE,
            } as any);
            await rpcClient.getAIAgentRpcClient().fixMissingImports();
            await onSave(String(updatedModel.name.value));
        } catch (error) {
            console.error("Failed to update agent tool", error);
            await rpcClient.getCommonRpcClient().showErrorMessage({ message: "Failed to update the agent tool." });
        } finally {
            setSaving(false);
        }
    };

    const handleSubmit = async (data: FormValues, formImports?: FormImports) => {
        if (isClassEdit) {
            return handleClassEditSubmit(data, formImports);
        }
        if (!toolNode || saving) return;
        setSaving(true);
        try {
            const updatedNode = cloneDeep(toolNode);
            const properties = updatedNode.properties as Record<string, Property>;

            for (const [key, value] of Object.entries(data)) {
                if (oauthKeys.has(key) || !properties[key]) continue;
                const property = properties[key];
                const primaryType = getPrimaryInputType(property.types);
                if (primaryType?.fieldType === "REPEATABLE_PROPERTY" && isTemplateType(primaryType)) {
                    property.value = {};
                    for (const repeatValue of Object.values(value ?? {})) {
                        const item = repeatValue as any;
                        const constraint = cloneDeep(primaryType.template);
                        for (const [paramKey, param] of Object.entries((constraint as any).value as NodeProperties)) {
                            param.value = item.formValues[paramKey] || "";
                        }
                        (property.value as any)[item.key] = constraint;
                    }
                } else {
                    property.value = value;
                }
                property.imports = getImportsForProperty(key, formImports);
            }

            const auth: Record<string, string> = {};
            const expressionKeys = new Set<string>();
            for (const { key } of oauthPropertiesRef.current) {
                const value = data[key];
                if (value === undefined || value === "") continue;
                const field = fields.find((candidate) => candidate.key === key);
                const isExpression = field?.types?.some(
                    (type) => type.selected && type.fieldType === "EXPRESSION"
                ) ?? false;
                if (isExpression) expressionKeys.add(key);
                const source = toAuthSource(key, value, isExpression);
                if (source) auth[key] = source;
            }
            updatedNode.codedata.data = {
                ...updatedNode.codedata.data,
                ...(Object.keys(auth).length > 0 ? { auth: JSON.stringify(auth) } : {}),
            };

            let response;
            if (isEdit) {
                const rawAuth: Record<string, string> = {};
                for (const { key } of oauthPropertiesRef.current) {
                    const value = data[key];
                    if (value === undefined || value === "") continue;
                    rawAuth[key] = String(value);
                }
                if (properties.annotations && typeof properties.annotations.value === "string") {
                    let annotationStr = properties.annotations.value as string;
                    if (annotationStr.includes("@ai:AgentTool")) {
                        const configBlock = buildAuthAnnotation(rawAuth, expressionKeys);
                        const authMatch = matchBraced(annotationStr, /auth\s*:\s*\{/);
                        if (authMatch) {
                            let { start: s, end: e } = authMatch;
                            if (configBlock) {
                                annotationStr = annotationStr.slice(0, s) + configBlock + annotationStr.slice(e);
                            } else {
                                const lead = annotationStr.slice(0, s).match(/,\s*$/);
                                const trail = annotationStr.slice(e).match(/^\s*,/);
                                if (lead) s -= lead[0].length;
                                else if (trail) e += trail[0].length;
                                annotationStr = annotationStr.slice(0, s) + annotationStr.slice(e);
                                annotationStr = annotationStr.replace(/@ai:AgentTool\s*\{\s*\}/, "@ai:AgentTool");
                            }
                        } else if (configBlock) {
                            if (annotationStr.match(/@ai:AgentTool\s*\{/)) {
                                annotationStr = annotationStr.replace(/@ai:AgentTool\s*\{/,
                                    `@ai:AgentTool {\n    ${configBlock},`);
                            } else {
                                annotationStr = annotationStr.replace(/@ai:AgentTool/,
                                    `@ai:AgentTool {\n    ${configBlock}\n}`);
                            }
                        }
                        properties.annotations.value = annotationStr.replace(/\s+$/, "\n");
                    }
                }
                response = await rpcClient.getBIDiagramRpcClient().getSourceCode({
                    filePath, flowNode: updatedNode, isFunctionNodeUpdate: true,
                });
            } else {
                response = await rpcClient.getBIDiagramRpcClient().getSourceCode({ filePath, flowNode: updatedNode });
            }
            if (!response?.artifacts?.length) {
                throw new Error("Agent tool source generation returned no artifacts");
            }
            await rpcClient.getAIAgentRpcClient().fixMissingImports();
            await onSave(String(properties.functionName.value));
        } catch (error) {
            console.error("Failed to save custom agent tool", error);
            await rpcClient.getCommonRpcClient().showErrorMessage({
                message: `Failed to ${isEdit ? "update" : "create"} the agent tool.`,
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading || !formRange || (!toolNode && !functionModel)) {
        return (
            <LoaderContainer>
                <RelativeLoader />
            </LoaderContainer>
        );
    }

    const oauthFieldCount = oauthPropertiesRef.current.length;
    const submitText = isEdit ? (saving ? "Saving..." : "Save") : (saving ? "Creating..." : "Create Tool");
    return (
        <ArtifactForm
            fileName={filePath}
            projectPath={projectPath}
            targetLineRange={formRange}
            fields={fields}
            recordTypeFields={recordTypeFields}
            isSaving={saving}
            disableSaveButton={saving}
            onSubmit={handleSubmit}
            onCancel={onBack}
            submitText={submitText}
            selectedNode={toolNode?.codedata?.node}
            nestedForm={nestedForm}
            preserveFieldOrder
            injectedComponents={oauthFieldCount > 0 ? [{
                component: (
                    <SectionHeader>
                        <p style={{ margin: 0, fontWeight: "bold" }}>OAuth Client Configuration</p>
                        <SectionDescription>
                            Configure OAuth 2.0 client authentication for this agent tool.
                        </SectionDescription>
                    </SectionHeader>
                ),
                index: fields.filter((field) => field.advanced && !field.hidden).length - oauthFieldCount,
                advanced: true,
            }] : undefined}
        />
    );
}
