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

import { useEffect, useMemo, useState } from "react";
import { Button } from "@wso2/ui-toolkit";
import {
    AvailableNode,
    EVENT_TYPE,
    FlowNode,
    LineRange,
    ProjectStructureArtifactResponse,
    isDefaultModelProviderExpr,
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { cloneDeep } from "lodash";
import { RelativeLoader } from "../../../../components/RelativeLoader";
import { FlowNodeForm } from "../../Forms/FlowNodeForm";
import { fetchAgentNodeTemplate, getEndOfFileLineRange, getNodeTemplate } from "../utils";
import { AgentInfoCard } from "./AgentInfoCard";
import { FormContainer, LoaderWrapper } from "./styles";

const AGENT_FILE_NAME = "agents.bal";

const FIELD_OVERRIDES = {
    type: { hidden: true },
    variable: { label: "Agent Name", documentation: "Name of the agent" },
};

export interface AgentFormViewProps {
    projectPath: string;
    pendingAgent?: AvailableNode;
    inFlow?: boolean;
    onAgentCreated?: (agentVarName: string) => void;
    onClose?: () => void;
}

export function AgentFormView(props: AgentFormViewProps) {
    const { projectPath, pendingAgent, inFlow, onAgentCreated, onClose } = props;
    const { rpcClient } = useRpcContext();
    const [agentNode, setAgentNode] = useState<FlowNode>();
    const [agentFilePath, setAgentFilePath] = useState("");
    const [targetLineRange, setTargetLineRange] = useState<LineRange>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadError, setLoadError] = useState<string>();
    const [loadAttempt, setLoadAttempt] = useState(0);

    const isConfiguring = Boolean(pendingAgent);

    // A new node object on re-render would wipe what the user has typed.
    const formNode = useMemo(() => {
        if (!agentNode) {
            return undefined;
        }
        const node = cloneDeep(agentNode);
        if (isConfiguring && node.metadata?.description) {
            delete node.metadata.description;
        }
        return node;
    }, [agentNode, isConfiguring]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoadError(undefined);
                const endOfFile = await getEndOfFileLineRange(AGENT_FILE_NAME, rpcClient);
                const template = isConfiguring
                    ? await getNodeTemplate(rpcClient, pendingAgent.codedata, endOfFile.fileName, endOfFile.startLine)
                    : await fetchAgentNodeTemplate(rpcClient, projectPath, endOfFile.fileName, endOfFile.startLine);
                if (!template) {
                    throw new Error("No agent node template returned");
                }
                template.codedata.lineRange = endOfFile;
                if (cancelled) return;
                setAgentFilePath(endOfFile.fileName);
                setTargetLineRange(endOfFile);
                setAgentNode(template);
            } catch (error) {
                console.error("Error loading agent node template:", error);
                if (!cancelled) {
                    setLoadError("Unable to load the agent template.");
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isConfiguring, pendingAgent, rpcClient, projectPath, loadAttempt]);

    const findAgentArtifact = (artifacts: ProjectStructureArtifactResponse[] = [], name: string) =>
        artifacts.find((artifact) => artifact.isNew && artifact.name === name) ||
        artifacts.find((artifact) => artifact.name === name);

    const openCreatedAgent = async (artifact: ProjectStructureArtifactResponse, name: string) => {
        if (!artifact?.path || !artifact?.position) {
            onClose?.();
            return;
        }
        await rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: { documentUri: artifact.path, position: artifact.position, identifier: name },
        });
    };

    const handleCreateAgent = async (updatedNode?: FlowNode) => {
        if (!updatedNode) {
            return;
        }
        setIsSubmitting(true);
        try {
            const node = cloneDeep(updatedNode);
            const endOfFile = await getEndOfFileLineRange(AGENT_FILE_NAME, rpcClient);
            node.codedata.lineRange = endOfFile;

            const sourceResponse = await rpcClient
                .getBIDiagramRpcClient()
                .getSourceCode({ filePath: endOfFile.fileName, flowNode: node });

            if (isDefaultModelProviderExpr(node.properties?.model?.value)) {
                await rpcClient.getAIAgentRpcClient().configureDefaultModelProvider("model");
            }

            const agentVarName = String(node.properties?.variable?.value ?? "");
            if (inFlow) {
                onAgentCreated?.(agentVarName);
                return;
            }
            await openCreatedAgent(findAgentArtifact(sourceResponse?.artifacts, agentVarName), agentVarName);
        } catch (error) {
            console.error("Error creating custom agent:", error);
            rpcClient.getCommonRpcClient().showErrorMessage({
                message: "Failed to create the agent. Please try again.",
            });
            setIsSubmitting(false);
        }
    };

    if (loadError) {
        return (
            <LoaderWrapper>
                <div role="alert">
                    <p>{loadError}</p>
                    <Button appearance="secondary" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
                        Retry
                    </Button>
                </div>
            </LoaderWrapper>
        );
    }

    if (!formNode || !targetLineRange) {
        return (
            <LoaderWrapper>
                <RelativeLoader />
            </LoaderWrapper>
        );
    }

    const submitText = isConfiguring ? "Add Agent" : "Create Agent";

    return (
        <FormContainer>
            {isConfiguring && (
                <AgentInfoCard
                    label={pendingAgent?.metadata?.label || ""}
                    description={pendingAgent?.metadata?.description || agentNode?.metadata?.description}
                    icon={pendingAgent?.metadata?.icon}
                />
            )}
            <FlowNodeForm
                fileName={agentFilePath}
                node={formNode}
                nodeFormTemplate={formNode}
                targetLineRange={targetLineRange}
                onSubmit={handleCreateAgent}
                submitText={isSubmitting ? (isConfiguring ? "Adding..." : "Creating...") : submitText}
                showProgressIndicator={isSubmitting}
                disableSaveButton={isSubmitting}
                footerActionButton
                fieldOverrides={FIELD_OVERRIDES}
            />
        </FormContainer>
    );
}

export default AgentFormView;
