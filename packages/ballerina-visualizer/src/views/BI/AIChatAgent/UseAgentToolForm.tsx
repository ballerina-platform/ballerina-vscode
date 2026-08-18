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

import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { ArtifactData, AvailableNode, BISearchRequest, Category, FlowNode, LinePosition, NodePosition } from "@wso2/ballerina-core";
import { FormField, FormValues } from "@wso2/ballerina-side-panel";
import { Icon } from "@wso2/ui-toolkit";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import ArtifactForm from "../Forms/ArtifactForm";
import { RelativeLoader } from "../../../components/RelativeLoader";
import { ImplementationBadge } from "../../../components/ImplementationBadge";
import { addToolToAgentNode, AgentToolHostClass, buildAgentCallToolNode, refreshAgentNodeLineRange, resolveAgentNodePosition } from "./utils";
import { buildAgentToolFields, buildApprovalToolData, buildRequiresApprovalField, collectLocalFunctionNames, createRequiresApprovalField, stripCodeFencesInline } from "./formUtils";

const LoaderContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

const ContextOption = styled.label`
    display: flex;
    align-items: flex-start;
    gap: 8px;
    cursor: pointer;
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    margin-top: 4px;
`;

const ContextHint = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-top: 2px;
    line-height: 1.4;
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
    const [includeContext, setIncludeContext] = useState<boolean>(false);
    const [fields, setFields] = useState<FormField[]>([]);
    // Candidate list backing the approval-predicate picker; consulted at submit to decide whether a
    // free-typed name should scaffold a new predicate stub. See formUtils.buildApprovalToolData.
    const compatibleApprovalFunctionsRef = useRef<string[]>([]);

    // Fetch the project's own module-level functions as approval-predicate candidates. Same shape as
    // the other tool-creation forms; see formUtils.collectLocalFunctionNames for the filtering rules.
    // Returns `null` (not `[]`) on fetch failure, so it can be told apart from a project with no
    // eligible functions — see formUtils.buildRequiresApprovalField for why the create flow below
    // needs that distinction (an empty-by-failure list plus allowCreate=true risks a re-picked
    // existing function silently generating a duplicate/broken predicate).
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
            const approvalCandidates = await fetchCompatibleApprovalFunctions(filePath, position);
            if (cancelled) return;
            compatibleApprovalFunctionsRef.current = approvalCandidates ?? [];

            setAgentFilePath(filePath);
            setFields([
                ...buildAgentToolFields(
                    `${agentVarName}Tool`,
                    `Delegates a query to ${agentLabel === "Agent" ? "the generic agent" : agentLabel}.`
                ),
                buildRequiresApprovalField(createRequiresApprovalField(), approvalCandidates),
            ]);
            setReady(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [agentNode, hostClass, agentVarName, agentLabel]);

    const handleSubmit = async (data: FormValues) => {
        if (saving) {
            return;
        }
        setSaving(true);
        try {
            await onBeforeSave?.();
            const toolName = String(data["name"] ?? "").trim() || `${agentVarName}Tool`;
            const description = stripCodeFencesInline(String(data["description"] ?? ""));
            const toolFilePath = hostClass ? hostClass.filePath : agentFilePath;
            const approvalData = buildApprovalToolData(data, compatibleApprovalFunctionsRef.current);
            const toolResponse = await rpcClient.getBIDiagramRpcClient().getSourceCode({
                filePath: toolFilePath,
                flowNode: buildAgentCallToolNode(toolName, agentVarName, includeContext, description,
                    hostClass, agentReceiver, approvalData),
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
            targetLineRange={{ startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } }}
            fields={fields}
            recordTypeFields={[]}
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
                {
                    component: (
                        <ContextOption>
                            <input
                                type="checkbox"
                                checked={includeContext}
                                onChange={(e) => setIncludeContext(e.target.checked)}
                            />
                            <div>
                                Pass agent context
                                <ContextHint>
                                    Adds ai:Context ctx as the first parameter so this tool can access the invoking
                                    agent's context.
                                </ContextHint>
                            </div>
                        </ContextOption>
                    ),
                    index: 2,
                    advanced: true,
                },
            ]}
        />
    );
}
