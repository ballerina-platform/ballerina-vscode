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

import { useEffect, useRef, useState } from 'react';
import { cloneDeep } from 'lodash';
import { CDModel, EVENT_TYPE, FlowNode, LineRange, Property } from '@wso2/ballerina-core';
import { View, ViewContent } from '@wso2/ui-toolkit';
import styled from '@emotion/styled';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { TitleBar } from '../../../components/TitleBar';
import { TopNavigationBar } from '../../../components/TopNavigationBar';
import { RelativeLoader } from '../../../components/RelativeLoader';
import { FormHeader } from '../../../components/FormHeader';
import { FlowNodeForm } from '../Forms/FlowNodeForm';
import { fetchAgentNodeTemplate, getAiModuleOrg, getEndOfFileLineRange } from './utils';
import { sanitizedHttpPath } from '../ServiceDesigner/utils';
import { AI_COMPONENT_PROGRESS_MESSAGE_TIMEOUT } from '../../../constants';

const Container = styled.div`
    display: flex;
    flex-direction: column;
    max-width: 600px;
    gap: 20px;
`;

const LoaderContainer = styled.div`
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
`;

export interface AIChatAgentWizardProps { }

const AI_CHAT_AGENT_LISTENER = "chatAgentListener";
const AGENT_FILE_NAME = "agents.bal";
const BASE_PATH_KEY = "basePath";

function toKebabCase(varName: string): string {
    return varName
        .replace(/_/g, '-')
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
        .replace(/([a-zA-Z])(\d)/g, '$1-$2')
        .replace(/(\d)([a-zA-Z])/g, '$1-$2')
        .toLowerCase();
}

function deriveBasePath(agentVarName: string): string {
    return "/" + toKebabCase(agentVarName);
}

export function AIChatAgentWizard(props: AIChatAgentWizardProps) {
    const { rpcClient } = useRpcContext();
    const [agentNode, setAgentNode] = useState<FlowNode | undefined>(undefined);
    const [agentFilePath, setAgentFilePath] = useState<string>('');
    const [targetLineRange, setTargetLineRange] = useState<LineRange | undefined>(undefined);
    const [isCreating, setIsCreating] = useState<boolean>(false);
    const [currentStep, setCurrentStep] = useState<number>(0);

    const steps = [
        { label: "Creating Agent", description: "Creating the AI chat agent" },
        { label: "Creating Model Provider", description: "Creating the model provider for the AI chat agent" },
        { label: "Pulling Modules", description: "Pulling the required modules. This may take a few moments." },
        { label: "Creating Listener", description: "Configuring the service listener" },
        { label: "Creating Service", description: "Setting up the AI chat service" },
        { label: "Completing", description: "Finalizing the agent setup" }
    ];

    const projectPath = useRef<string>("");
    const aiModuleOrg = useRef<string>("");
    const progressTimeoutRef = useRef<number | null>(null);
    const designModelRef = useRef<CDModel>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const visualizerLocation = await rpcClient.getVisualizerLocation();
                if (cancelled) return;
                projectPath.current = visualizerLocation.projectPath;

                const [designModelResponse, org] = await Promise.all([
                    rpcClient.getBIDiagramRpcClient().getDesignModel({}),
                    getAiModuleOrg(rpcClient),
                ]);
                if (cancelled) return;
                designModelRef.current = designModelResponse.designModel;
                aiModuleOrg.current = org;

                const template = await fetchAgentNodeTemplate(rpcClient, projectPath.current);
                if (cancelled) return;

                template.metadata.description = "Configure your agent's model, role, and instructions.";

                const initialAgentName = String(template.properties?.variable?.value ?? "");
                (template.properties as Record<string, Property>)[BASE_PATH_KEY] = {
                    metadata: {
                        label: "Service Base Path",
                        description: "The path where this chat service is exposed (e.g. /sales-agent).",
                    },
                    value: deriveBasePath(initialAgentName),
                    optional: false,
                    editable: true,
                    types: [{ fieldType: "SERVICE_PATH", selected: true }],
                } as Property;

                const endOfFile = await getEndOfFileLineRange(AGENT_FILE_NAME, rpcClient);
                if (cancelled) return;

                template.codedata.lineRange = endOfFile as any;
                setAgentFilePath(endOfFile.fileName);
                setTargetLineRange(endOfFile);
                setAgentNode(template);
            } catch (error) {
                console.error("Error initializing AIChatAgentWizard:", error);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const handleCreateAgent = async (updatedNode?: FlowNode) => {
        if (!updatedNode) return;

        const agentVarName = String(updatedNode.properties?.variable?.value ?? "");
        const rawBasePath = String((updatedNode.properties as Record<string, Property>)?.[BASE_PATH_KEY]?.value ?? "").trim();
        const basePathSegment = rawBasePath.replace(/^\/+/, "") || toKebabCase(agentVarName);
        const servicePath = sanitizedHttpPath(basePathSegment);

        setIsCreating(true);
        setCurrentStep(0);

        try {
            // hack: fetching from Central to build module dependency map in LS may take time
            progressTimeoutRef.current = setTimeout(() => {
                setCurrentStep(2);
                progressTimeoutRef.current = null;
            }, AI_COMPONENT_PROGRESS_MESSAGE_TIMEOUT);

            setCurrentStep(1);

            // Write the agent declaration to agents.bal, re-fetching end-of-file in case it
            // shifted since the template was loaded (e.g. a concurrent edit).
            const endOfFile = await getEndOfFileLineRange(AGENT_FILE_NAME, rpcClient);
            const node = cloneDeep(updatedNode);
            delete (node.properties as Record<string, Property>)[BASE_PATH_KEY];
            node.codedata.lineRange = endOfFile as any;
            await rpcClient.getBIDiagramRpcClient().getSourceCode({
                filePath: endOfFile.fileName,
                flowNode: node,
            });

            if (String(node.properties?.model?.value ?? "") === "check ai:getDefaultModelProvider()") {
                await rpcClient.getAIAgentRpcClient().configureDefaultModelProvider("model");
            }

            setCurrentStep(3);

            const listenerExists = designModelRef.current?.listeners.some(
                listener => listener.symbol.toLowerCase() === AI_CHAT_AGENT_LISTENER.toLowerCase()
            );

            if (!listenerExists) {
                const mainBalFile = `${projectPath.current}/main.bal`;
                const payload = {
                    codedata: {
                        orgName: "ballerina",
                        packageName: "ai",
                        moduleName: "ai",
                        version: "1.0.0",
                    },
                    filePath: mainBalFile
                };

                const listenerResponse = await rpcClient.getServiceDesignerRpcClient().getListenerModel(payload);
                const listenerConfiguration = listenerResponse.listener;
                listenerConfiguration.properties['variableNameKey'].value = AI_CHAT_AGENT_LISTENER;
                listenerConfiguration.properties['listenOn'].value = "check http:getDefaultListener()";

                await rpcClient.getServiceDesignerRpcClient().addListenerSourceCode({
                    filePath: "",
                    listener: listenerConfiguration
                });
            }

            setCurrentStep(4);

            const serviceResponse = await rpcClient.getServiceDesignerRpcClient().getServiceModel({
                filePath: "",
                moduleName: "ai",
                listenerName: AI_CHAT_AGENT_LISTENER,
                orgName: aiModuleOrg.current,
            });

            const serviceConfiguration = serviceResponse.service;
            serviceConfiguration.properties["listener"].editable = true;
            serviceConfiguration.properties["listener"].items = [AI_CHAT_AGENT_LISTENER];
            serviceConfiguration.properties["listener"].value = AI_CHAT_AGENT_LISTENER;
            serviceConfiguration.properties["basePath"].value = `/${servicePath}`;
            serviceConfiguration.properties["agentName"].value = agentVarName;

            const serviceSourceCodeResult = await rpcClient.getServiceDesignerRpcClient().addServiceSourceCode({
                filePath: "",
                service: serviceConfiguration
            });

            const newServiceArtifact = serviceSourceCodeResult.artifacts.find(artifact => artifact.isNew);

            setCurrentStep(5);

            if (newServiceArtifact) {
                rpcClient.getVisualizerRpcClient().openView({
                    type: EVENT_TYPE.OPEN_VIEW,
                    location: { documentUri: newServiceArtifact.path, position: newServiceArtifact.position }
                });
            } else {
                setIsCreating(false);
                setCurrentStep(0);
            }
        } catch (error) {
            console.error("Error creating AI Chat Agent:", error);
            setIsCreating(false);
            setCurrentStep(0);
        } finally {
            if (progressTimeoutRef.current) {
                clearTimeout(progressTimeoutRef.current);
                progressTimeoutRef.current = null;
            }
        }
    };

    return (
        <View>
            <TopNavigationBar projectPath={projectPath.current} />
            <TitleBar
                title="Chat Agent Service"
                subtitle="Create a chattable AI agent using an LLM, prompts and tools."
            />
            <ViewContent padding>
                {isCreating ? (
                    <LoaderContainer>
                        <RelativeLoader message={steps[currentStep].description} />
                    </LoaderContainer>
                ) : agentNode && targetLineRange ? (
                    <Container>
                        <FormHeader title="Create Chat Agent Service" />
                        <FlowNodeForm
                            fileName={agentFilePath}
                            node={cloneDeep(agentNode)}
                            nodeFormTemplate={cloneDeep(agentNode)}
                            targetLineRange={targetLineRange}
                            onSubmit={handleCreateAgent}
                            submitText="Create"
                            fieldOverrides={{ type: { hidden: true } }}
                            derivedFields={[{
                                sourceField: "variable",
                                targetField: BASE_PATH_KEY,
                                deriveFn: (agentVarName) => deriveBasePath(String(agentVarName ?? "")),
                                breakOnManualEdit: true,
                            }]}
                            bottomFields={[BASE_PATH_KEY]}
                        />
                    </Container>
                ) : (
                    <LoaderContainer>
                        <RelativeLoader />
                    </LoaderContainer>
                )}
            </ViewContent>
        </View>
    );
}
