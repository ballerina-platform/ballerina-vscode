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

import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import {
    AvailableNode,
    BISearchRequest,
    Category,
    DIRECTORY_MAP,
    FlowNode,
    FunctionModel,
    LinePosition,
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
import { AgentToolHostClass, fetchOAuthConfigProperties } from "./utils";
import {
    buildApprovalToolData,
    buildRequiresApprovalField,
    collectLocalFunctionNames,
    createRequiresApprovalField,
    ExistingApprovalConfig,
} from "./formUtils";
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

function parseAuthValue(value: string): ParsedConfigValue {
    const literal = value.match(/^string\s*`([^`]*)`$/) ?? value.match(/^"([^"]*)"$/);
    return literal ? { value: literal[1], isExpression: false } : { value, isExpression: true };
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
                const values = items.map(parseAuthValue);
                const allLiteral = values.every((value) => !value.isExpression);
                result.scopes = {
                    value: allLiteral ? JSON.stringify(values.map((value) => value.value)) : `[${items.join(", ")}]`,
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
        result[key] = parseAuthValue(valueMatch[1].trim());
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
            return `[${scopes.map((scope) => JSON.stringify(scope)).join(", ")}]`;
        } catch {
            return text.startsWith("[") ? text : `[${text}]`;
        }
    }
    return JSON.stringify(text);
}

// Parse an existing `requiresApproval: <boolean|identifier>` field out of an @ai:AgentTool
// annotation, to prefill the "Requires Approval" control when editing a custom tool that already
// has the gate set.
function parseRequiresApproval(annotationValue: string): ExistingApprovalConfig | undefined {
    const match = /\brequiresApproval\b\s*:\s*([^,}]+)/.exec(annotationValue);
    if (!match) return undefined;
    const raw = match[1].trim();
    if (raw === "true") return {};
    if (raw === "false") return undefined;
    return { functionName: raw };
}

// Ensure the function the tool currently references is always a selectable candidate, even if the
// module-function fetch didn't surface it. Edit forms use a strict (no-create) picker, so without
// this a referenced-but-unlisted function would be silently dropped on save.
function withExistingCandidate(candidates: string[], existing?: ExistingApprovalConfig): string[] {
    const name = existing?.functionName;
    return name && !candidates.includes(name) ? [...candidates, name] : candidates;
}

// Insert, replace, or remove a scalar `key: value` field (no nested braces, unlike auth's record
// value) inside an @ai:AgentTool annotation string. Mirrors the auth block's matchBraced-based
// upsert in spirit, but auth's value is itself a `{ ... }` record while requiresApproval's value is
// a bare boolean or identifier, so a brace-unaware match up to the next comma/close-brace suffices.
function upsertScalarAnnotationField(annotationStr: string, key: string, source: string | undefined): string {
    const match = new RegExp(`\\b${key}\\b\\s*:\\s*[^,}]+`).exec(annotationStr);
    if (match) {
        let s = match.index;
        let e = match.index + match[0].length;
        if (source) {
            return annotationStr.slice(0, s) + `${key}: ${source}` + annotationStr.slice(e);
        }
        const lead = annotationStr.slice(0, s).match(/,\s*$/);
        // `\s*` after the comma also swallows the removed field's now-blank line (its trailing
        // newline + the next field's leading indentation), so removal doesn't leave an empty line.
        const trail = annotationStr.slice(e).match(/^\s*,\s*/);
        if (lead) s -= lead[0].length;
        else if (trail) e += trail[0].length;
        return (annotationStr.slice(0, s) + annotationStr.slice(e))
            .replace(/@ai:AgentTool\s*\{\s*\}/, "@ai:AgentTool");
    }
    if (!source) {
        return annotationStr;
    }
    if (annotationStr.match(/@ai:AgentTool\s*\{/)) {
        return annotationStr.replace(/@ai:AgentTool\s*\{/, `@ai:AgentTool {\n    ${key}: ${source},`);
    }
    return annotationStr.replace(/@ai:AgentTool/, `@ai:AgentTool {\n    ${key}: ${source}\n}`);
}

// Compute the `requiresApproval` annotation-value source from the form's checkbox + picker state,
// or undefined when the gate is off (signalling removal to upsertScalarAnnotationField / callers
// that build the annotation from scratch).
function resolveApprovalSource(data: FormValues): string | undefined {
    const checked = data["requiresApproval"] === true || data["requiresApproval"] === "true";
    if (!checked) return undefined;
    const approvalFn = typeof data["approvalFunction"] === "string" ? data["approvalFunction"].trim() : "";
    return approvalFn || "true";
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
    // Names of existing module functions offered in the approval-predicate picker. Only consulted
    // on tool creation (see handleSubmit) to decide whether a free-typed name should scaffold a new
    // predicate stub; edits reference the typed name as-is (see the module doc comment on
    // upsertScalarAnnotationField's callers) since annotation-string surgery has no code-gen path.
    const compatibleApprovalFunctionsRef = useRef<string[]>([]);

    const isEdit = Boolean(editContext);
    const isClassEdit = Boolean(editContext?.inClass);

    // Fetch the project's own module-level functions (excluding the tool's own function, when
    // editing one) as approval-predicate candidates. Shared shape with the function/connection
    // tool-creation forms; see formUtils.collectLocalFunctionNames for the filtering rules.
    // Returns `null` (rather than `[]`) when the fetch itself fails, distinguishing "search failed"
    // from "no eligible functions" — see formUtils.buildRequiresApprovalField for why the create
    // flow (below) needs that distinction. The edit flows fold `null` back to `[]` immediately since
    // their strict pick-list (allowCreate=false) plus prefilled existing value is already safe either
    // way: there's no free-typed "create a new predicate" path for a fetch failure to corrupt.
    const fetchCompatibleApprovalFunctions = async (
        position: LinePosition, excludeName?: string
    ): Promise<string[] | null> => {
        try {
            const request: BISearchRequest = {
                position: { startLine: position, endLine: position },
                filePath,
                queryMap: undefined,
                searchKind: "FUNCTION",
            };
            const response = await rpcClient.getBIDiagramRpcClient().search(request);
            const names = new Set<string>();
            collectLocalFunctionNames((response?.categories ?? []) as (Category | AvailableNode)[], names);
            if (excludeName) {
                names.delete(excludeName);
            }
            return Array.from(names);
        } catch (error) {
            console.error(">>> Error fetching compatible approval functions", error);
            return null;
        }
    };

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
                    const [res, oauthProperties, approvalCandidates] = await Promise.all([
                        rpcClient.getBIDiagramRpcClient().getFunctionNode({
                            functionName: editContext.functionName,
                            fileName,
                            projectPath,
                        }),
                        fetchOAuthConfigProperties(rpcClient, filePath, oauthStartLine),
                        fetchCompatibleApprovalFunctions(oauthStartLine, editContext.functionName),
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
                    const existingApproval = parseRequiresApproval(annotationValue);
                    // A failed fetch folds to [] here (not the create flow's hide-the-picker
                    // fallback): allowCreate=false plus the prefilled existing value below already
                    // keep this safe — there's no free-typed "create a new predicate" path to corrupt.
                    const approvalItems = withExistingCandidate(approvalCandidates ?? [], existingApproval);
                    compatibleApprovalFunctionsRef.current = approvalItems;
                    const existingConfig = parseAuth(annotationValue, oauthProperties.map(({ key }) => key));
                    const { oauthFields, oauthRecordFields } = buildOAuthFields(oauthProperties, existingConfig);
                    // Edit restricts the picker to existing functions (allowCreate=false): this path
                    // rewrites the annotation source directly and never reaches AgentToolBuilder, so a
                    // free-typed new name would leave `requiresApproval: <name>` with no such function.
                    const requiresApprovalField = buildRequiresApprovalField(
                        createRequiresApprovalField(existingApproval, false), approvalItems
                    );

                    setToolNode(node);
                    setFields([...baseFields, requiresApprovalField, ...oauthFields]);
                    setRecordTypeFields(oauthRecordFields);
                    setFormRange(node.codedata?.lineRange as LineRange);
                    return;
                }

                if (editContext && editContext.inClass && editContext.lineRange) {
                    const [modelResp, oauthProperties, approvalCandidates] = await Promise.all([
                        rpcClient.getServiceDesignerRpcClient().getFunctionFromSource({
                            filePath,
                            codedata: { lineRange: editContext.lineRange as any },
                        }),
                        fetchOAuthConfigProperties(rpcClient, filePath, oauthStartLine),
                        fetchCompatibleApprovalFunctions(oauthStartLine),
                    ]);
                    if (cancelled) return;
                    const model = modelResp.function;

                    oauthPropertiesRef.current = oauthProperties;
                    const annotationValue = findAgentToolAnnotation(model)?.value ?? "";
                    const existingApproval = parseRequiresApproval(annotationValue);
                    // Same fold-to-[] rationale as the top-level edit branch above.
                    const approvalItems = withExistingCandidate(
                        (approvalCandidates ?? []).filter((name) => name !== String(model.name.value)),
                        existingApproval
                    );
                    compatibleApprovalFunctionsRef.current = approvalItems;
                    const existingConfig = parseAuth(annotationValue, oauthProperties.map(({ key }) => key));
                    const { oauthFields, oauthRecordFields } = buildOAuthFields(oauthProperties, existingConfig);
                    // Edit restricts the picker to existing functions (allowCreate=false) — see the
                    // top-level edit branch; the class-edit save likewise rebuilds annotation text
                    // directly rather than going through AgentToolBuilder's predicate scaffolding.
                    const requiresApprovalField = buildRequiresApprovalField(
                        createRequiresApprovalField(existingApproval, false), approvalItems
                    );

                    setFunctionModel(model);
                    setFields([...buildClassToolFields(model), requiresApprovalField, ...oauthFields]);
                    setRecordTypeFields(oauthRecordFields);
                    setFormRange(editContext.lineRange);
                    return;
                }

                const insertionPosition = targetLineRange?.startLine
                    ?? await rpcClient.getBIDiagramRpcClient().getEndOfFile({ filePath });
                const [templateResponse, oauthProperties, approvalCandidates] = await Promise.all([
                    rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                        position: insertionPosition,
                        filePath,
                        id: { node: "AGENT_TOOL" },
                    }),
                    fetchOAuthConfigProperties(rpcClient, filePath, oauthStartLine),
                    fetchCompatibleApprovalFunctions(insertionPosition),
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
                compatibleApprovalFunctionsRef.current = approvalCandidates ?? [];
                const { oauthFields, oauthRecordFields } = buildOAuthFields(oauthProperties, {});
                // Unlike the edit branches above, this is a create flow (allowCreate=true): on a
                // failed fetch, propagate null through so buildRequiresApprovalField falls back to
                // the plain checkbox rather than offering a free-typed picker over an empty list.
                const requiresApprovalField = buildRequiresApprovalField(createRequiresApprovalField(), approvalCandidates);

                setToolNode(node);
                setFields([...baseFields, requiresApprovalField, ...oauthFields]);
                setRecordTypeFields(oauthRecordFields);
                if (!targetLineRange && !cancelled) {
                    setFormRange({ startLine: insertionPosition, endLine: insertionPosition });
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

    const oauthKeys = new Set(oauthPropertiesRef.current.map(({ key }) => key));

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
                // Compose every annotation field the form knows about (auth, requiresApproval) rather
                // than assuming auth is the only one — otherwise saving without touching the approval
                // gate would silently drop it, since this rebuilds the annotation value from scratch.
                const fragments: string[] = [];
                const authFragment = buildAuthAnnotation(rawAuth, expressionKeys);
                if (authFragment) fragments.push(authFragment);
                const approvalSource = resolveApprovalSource(data);
                if (approvalSource) fragments.push(`requiresApproval: ${approvalSource}`);
                (updatedModel.properties as any)[annotation.key].value = fragments.length > 0
                    ? `{\n    ${fragments.join(",\n    ")}\n}` : "";
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
        } catch {
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
            const rawAuth: Record<string, string> = {};
            const expressionKeys = new Set<string>();
            for (const { key } of oauthPropertiesRef.current) {
                const value = data[key];
                if (value === undefined || value === "") continue;
                const field = fields.find((candidate) => candidate.key === key);
                const isExpression = field?.types?.some(
                    (type) => type.selected && type.fieldType === "EXPRESSION"
                ) ?? false;
                if (isExpression) expressionKeys.add(key);
                rawAuth[key] = String(value);
                const source = toAuthSource(key, value, isExpression);
                if (source) auth[key] = source;
            }
            // Mirrors AIAgentSidePanel's function/connection tool-creation paths: rides along in
            // codedata.data and is rendered into the @ai:AgentTool annotation by the language server
            // (AgentToolBuilder.emitAnnotation / appendApprovalPredicate). Only consulted on create —
            // isEdit rewrites the already-existing annotation text directly below instead.
            updatedNode.codedata.data = {
                ...updatedNode.codedata.data,
                ...(Object.keys(auth).length > 0 ? { auth: JSON.stringify(auth) } : {}),
                ...buildApprovalToolData(data, compatibleApprovalFunctionsRef.current),
            };

            let response;
            if (isEdit) {
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
                        // Edits reference an existing function only (the edit picker is a strict
                        // pick-list — allowCreate=false), so no predicate scaffolding is needed: this
                        // path rewrites already-generated source text directly and never reaches
                        // AgentToolBuilder's codegen where a new predicate stub would be emitted.
                        annotationStr = upsertScalarAnnotationField(
                            annotationStr, "requiresApproval", resolveApprovalSource(data)
                        );
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
        } catch {
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
