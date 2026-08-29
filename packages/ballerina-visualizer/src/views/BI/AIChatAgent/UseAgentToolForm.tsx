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

import { useEffect, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { ArtifactData, AvailableNode, BISearchRequest, Category, FlowNode, LinePosition, NodePosition, Property,
    RecordTypeField } from "@wso2/ballerina-core";
import { FieldGroup, FormField, FormImports, FormValues } from "@wso2/ballerina-side-panel";
import { Icon } from "@wso2/ui-toolkit";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import ArtifactForm from "../Forms/ArtifactForm";
import { RelativeLoader } from "../../../components/RelativeLoader";
import { ImplementationBadge } from "../../../components/ImplementationBadge";
import { getImportsForProperty } from "../../../utils/bi";
import { INCLUDE_CONTEXT_KEY, RESULT_TYPE_GROUP, buildIncludeContextField, buildToolFormGroups } from "./toolForm";
import { addToolToAgentNode, AgentToolHostClass, buildAgentCallToolNode, buildOAuthFields, fetchAgentRunReturnType, fetchOAuthConfigProperties, refreshAgentNodeLineRange, resolveAgentNodePosition, ZERO_LINE_RANGE } from "./utils";
import { buildAgentToolFields, buildApprovalToolData, buildRequiresApprovalField,
    collectLocalFunctionNames, createRequiresApprovalField, extractRecordTypeFieldsFromEntries,
    stripCodeFencesInline } from "./formUtils";

const LoaderContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

interface UseAgentToolFormProps {
    agentNode?: FlowNode;
    agentVarName: string;
    agentReceiver?: string;
    agentLabel?: string;
    submitText?: string;
    artifactData?: ArtifactData;
    onBeforeSave?: () => Promise<void>;
    onSave?: (agentPosition?: NodePosition) => void;
    onToolSaved?: (toolName: string) => void;
    hostClass?: AgentToolHostClass;
}

export function UseAgentToolForm(props: UseAgentToolFormProps): JSX.Element {
    const { agentNode, agentVarName, agentReceiver, agentLabel = agentVarName, submitText = "Save Tool", onBeforeSave,
        onSave, onToolSaved, hostClass, artifactData } = props;
    const { rpcClient } = useRpcContext();

    const [agentFilePath, setAgentFilePath] = useState<string>("");
    const [ready, setReady] = useState<boolean>(false);
    const [saving, setSaving] = useState<boolean>(false);
    const [oauthProperties, setOauthProperties] = useState<{ key: string; property: Property }[]>([]);
    const [defaultReturnType, setDefaultReturnType] = useState<string>("");
    // null (not []) when the fetch failed, so buildRequiresApprovalField can drop the picker rather
    // than offer an empty one. Consulted at submit to decide whether a free-typed name scaffolds a
    // new predicate. See formUtils.buildApprovalToolData.
    const [approvalCandidates, setApprovalCandidates] = useState<string[] | null>(null);

    // Fetch the project's own module-level functions as approval-predicate candidates. Same shape as
    // the other tool-creation forms; see formUtils.collectLocalFunctionNames for the filtering rules.
    const fetchCompatibleApprovalFunctions = async (
        filePath: string, position: LinePosition
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
            return Array.from(names);
        } catch (error) {
            console.error(">>> Error fetching compatible approval functions", error);
            return null;
        }
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const filePath = hostClass
                ? hostClass.filePath
                : (await rpcClient.getVisualizerRpcClient().joinProjectPath({
                    segments: [agentNode?.codedata?.lineRange?.fileName ?? "agents.bal"],
                })).filePath;
            if (cancelled) return;
            const position = agentNode?.codedata?.lineRange?.startLine ?? { line: 0, offset: 0 };
            const candidates = await fetchCompatibleApprovalFunctions(filePath, position);
            if (cancelled) return;
            setApprovalCandidates(candidates);
            setAgentFilePath(filePath);
            setOauthProperties(await fetchOAuthConfigProperties(rpcClient, filePath));
            setDefaultReturnType(await fetchAgentRunReturnType(rpcClient, filePath, agentVarName,
                hostClass?.className));
            if (cancelled) return;
            setReady(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [agentNode, hostClass, agentVarName, agentLabel]);

    const oauthFields = useMemo<FormField[]>(() => buildOAuthFields(oauthProperties), [oauthProperties]);

    const recordTypeFields = useMemo<RecordTypeField[]>(
        () => extractRecordTypeFieldsFromEntries(oauthProperties),
        [oauthProperties]
    );

    const fields = useMemo<FormField[]>(() => [
        ...buildAgentToolFields(
            `${agentVarName}Tool`,
            `Delegates a query to ${agentLabel === "Agent" ? "the generic agent" : agentLabel}.`
        ),
        buildRequiresApprovalField(createRequiresApprovalField(), approvalCandidates),
        buildIncludeContextField() as FormField,
        ...oauthFields,
        {
            key: "returnType",
            label: "Result Type",
            type: "TYPE",
            optional: true,
            editable: true,
            documentation: "The data type this tool will return to the agent.",
            value: defaultReturnType,
            placeholder: "string",
            types: [{ fieldType: "TYPE", selected: true }],
            group: RESULT_TYPE_GROUP,
            advanced: false,
            enabled: true,
        },
    ], [agentVarName, agentLabel, approvalCandidates, oauthFields, defaultReturnType]);

    const groups = useMemo<FieldGroup[]>(() => buildToolFormGroups(fields), [fields]);

    const overriddenReturnType = (submitted: string): string =>
        submitted.trim() === defaultReturnType.trim() ? "" : submitted;

    const handleSubmit = async (data: FormValues, formImports?: FormImports) => {
        if (saving) {
            return;
        }
        setSaving(true);
        try {
            await onBeforeSave?.();
            const toolName = String(data["name"] ?? "").trim() || `${agentVarName}Tool`;
            const description = stripCodeFencesInline(String(data["description"] ?? ""));
            const toolFilePath = hostClass ? hostClass.filePath : agentFilePath;
            const approvalData = buildApprovalToolData(data, approvalCandidates ?? []);
            const returnType = overriddenReturnType(String(data["returnType"] ?? ""));
            const toolNode = buildAgentCallToolNode(toolName, agentVarName, data[INCLUDE_CONTEXT_KEY] === true,
                description, hostClass, agentReceiver, returnType, approvalData);

            // The LS only registers the import itself when it resolves the type itself.
            const returnTypeImports = returnType ? getImportsForProperty("returnType", formImports) : undefined;
            if (returnTypeImports && Object.keys(returnTypeImports).length > 0) {
                toolNode.codedata.data = {
                    ...toolNode.codedata.data,
                    returnTypeImports: JSON.stringify(returnTypeImports),
                };
            }

            const authConfig: Record<string, string> = {};
            for (const { key } of oauthProperties) {
                const value = data[key];
                if (value !== undefined && value !== "") {
                    authConfig[key] = String(value);
                }
            }
            if (Object.keys(authConfig).length > 0) {
                toolNode.codedata.data = { ...toolNode.codedata.data, auth: JSON.stringify(authConfig) };
            }

            const toolResponse = await rpcClient.getBIDiagramRpcClient().getSourceCode({
                filePath: toolFilePath,
                flowNode: toolNode,
                artifactData,
            });
            let agentPosition: NodePosition | undefined;
            if (!hostClass && agentNode) {
                const updatedAgentNode = await addToolToAgentNode(agentNode, toolName);
                if (updatedAgentNode) {
                    await refreshAgentNodeLineRange(updatedAgentNode, rpcClient, toolResponse?.artifacts);
                    const { filePath: agentFile } = await rpcClient.getVisualizerRpcClient().joinProjectPath({
                        segments: [updatedAgentNode.codedata.lineRange.fileName],
                    });
                    await rpcClient
                        .getBIDiagramRpcClient()
                        .getSourceCode({ filePath: agentFile, flowNode: updatedAgentNode });
                    agentPosition = await resolveAgentNodePosition(updatedAgentNode, rpcClient);
                }
            }
            onToolSaved?.(toolName);
            onSave?.(agentPosition);
        } catch (error) {
            console.error("Failed to add agent as a tool", error);
        } finally {
            setSaving(false);
        }
    };

    if (!ready) {
        return (
            <LoaderContainer>
                <RelativeLoader />
            </LoaderContainer>
        );
    }

    return (
        <ArtifactForm
            preserveFieldOrder={false}
            fileName={agentFilePath}
            targetLineRange={ZERO_LINE_RANGE}
            fields={fields}
            groups={groups}
            opensPrefilled
            recordTypeFields={recordTypeFields}
            onSubmit={handleSubmit}
            submitText={submitText}
            isSaving={saving}
            helperPaneSide="left"
            injectedComponents={[
                {
                    component: (
                        <ImplementationBadge title={agentLabel}>
                            <Icon name="bi-ai-agent" sx={{ width: 14, height: 14, fontSize: 14 }} />
                            {agentLabel}
                        </ImplementationBadge>
                    ),
                    index: 0,
                },
            ]}
        />
    );
}
