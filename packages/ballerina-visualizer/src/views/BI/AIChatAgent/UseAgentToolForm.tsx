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
import { FlowNode } from "@wso2/ballerina-core";
import { FormField, FormValues } from "@wso2/ballerina-side-panel";
import { Icon } from "@wso2/ui-toolkit";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import ArtifactForm from "../Forms/ArtifactForm";
import { RelativeLoader } from "../../../components/RelativeLoader";
import { addToolToAgentNode } from "./utils";

const LoaderContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

// Mirrors the tool-source pill used by the function/connection tool form (AIAgentSidePanel).
const ImplementationBadge = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background-color: var(--vscode-input-background);
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 12px;
    color: var(--vscode-foreground);
    margin-bottom: 4px;
    max-width: 100%;
    overflow: hidden;
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
    agentNode: FlowNode;
    agentVarName: string;
    onSave?: () => void;
}

export function UseAgentToolForm(props: UseAgentToolFormProps): JSX.Element {
    const { agentNode, agentVarName, onSave } = props;
    const { rpcClient } = useRpcContext();

    const [agentFilePath, setAgentFilePath] = useState<string>("");
    const [ready, setReady] = useState<boolean>(false);
    const [saving, setSaving] = useState<boolean>(false);
    const [includeContext, setIncludeContext] = useState<boolean>(false);
    const includeContextRef = useRef<boolean>(false);

    useEffect(() => {
        (async () => {
            const fileName = agentNode?.codedata?.lineRange?.fileName ?? "agents.bal";
            const { filePath } = await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [fileName] });
            setAgentFilePath(filePath);
            setReady(true);
        })();
    }, [agentNode]);

    const fields: FormField[] = [
        {
            key: "name",
            label: "Tool Name",
            type: "IDENTIFIER",
            optional: false,
            editable: true,
            documentation: "Enter a unique name for the tool.",
            value: `${agentVarName}Tool`,
            types: [{ fieldType: "IDENTIFIER", scope: "Global", selected: false }],
            enabled: true,
        },
        {
            key: "description",
            label: "Description",
            type: "TEXTAREA",
            optional: true,
            editable: true,
            documentation: "Describe what this tool does. The agent uses this to decide when to invoke the tool.",
            value: `Delegates a query to the ${agentVarName} agent.`,
            types: [{ fieldType: "STRING", selected: false }],
            enabled: true,
        },
    ];

    const handleSubmit = async (data: FormValues) => {
        if (saving) {
            return;
        }
        setSaving(true);
        try {
            const toolName = String(data["name"] ?? "").trim() || `${agentVarName}Tool`;
            const description = String(data["description"] ?? "")
                .replace(/```[\s\S]*?```/g, "")
                .replace(/\n/g, " ")
                .trim();
            await rpcClient.getAIAgentRpcClient().genAgentTool({
                filePath: agentFilePath,
                agentVarName,
                includeContext: includeContextRef.current,
                toolName,
                description,
            });
            const updatedAgentNode = await addToolToAgentNode(agentNode, toolName);
            if (updatedAgentNode) {
                const { filePath: agentFile } = await rpcClient.getVisualizerRpcClient().joinProjectPath({
                    segments: [updatedAgentNode.codedata.lineRange.fileName],
                });
                await rpcClient
                    .getBIDiagramRpcClient()
                    .getSourceCode({ filePath: agentFile, flowNode: updatedAgentNode });
            }
            onSave?.();
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
            submitText={"Save Tool"}
            isSaving={saving}
            helperPaneSide="left"
            injectedComponents={[
                {
                    component: (
                        <ImplementationBadge title={agentVarName}>
                            <Icon name="bi-ai-agent" sx={{ width: 14, height: 14, fontSize: 14 }} />
                            {agentVarName}
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
                                onChange={(e) => {
                                    includeContextRef.current = e.target.checked;
                                    setIncludeContext(e.target.checked);
                                }}
                            />
                            <div>
                                Pass context to {agentVarName}
                                <ContextHint>
                                    Forwards the calling agent's context to {agentVarName} when the tool runs.
                                </ContextHint>
                            </div>
                        </ContextOption>
                    ),
                    index: 2,
                },
            ]}
        />
    );
}
