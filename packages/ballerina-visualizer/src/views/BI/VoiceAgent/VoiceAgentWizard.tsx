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

import { useEffect, useRef, useState } from 'react';
import { cloneDeep } from 'lodash';
import { CDModel, EVENT_TYPE, FlowNode, LineRange, ListenerModel, Property, RecordTypeField, ServiceInitModel, isDefaultModelProviderExpr } from '@wso2/ballerina-core';
import { Button, View, ViewContent } from '@wso2/ui-toolkit';
import { FormField, FormImports, FormValues } from '@wso2/ballerina-side-panel';
import styled from '@emotion/styled';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { TitleBar } from '../../../components/TitleBar';
import { TopNavigationBar } from '../../../components/TopNavigationBar';
import { RelativeLoader } from '../../../components/RelativeLoader';
import { FormHeader } from '../../../components/FormHeader';
import { FlowNodeForm } from '../Forms/FlowNodeForm';
import ArtifactForm from '../Forms/ArtifactForm';
import { fetchAgentNodeTemplate, getEndOfFileLineRange } from '../AIChatAgent/utils';
import { sanitizedHttpPath } from '../ServiceDesigner/utils';
import { applyFormValuesToModel, collectRecordTypeFields, mapPropertiesToFormFields } from '../ServiceDesigner/serviceInitModelUtils';

const Container = styled.div`
    display: flex;
    flex-direction: column;
    max-width: 600px;
    gap: 20px;

    .side-panel-body {
        height: auto;
        overflow: visible;
    }
`;

const LoaderContainer = styled.div`
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
`;

export interface VoiceAgentWizardProps {
    initialName?: string;
}

const VOICE_AGENT_LISTENER = "voiceListener";
const VOICE_AGENT_ORG = "vinoth";
const VOICE_AGENT_MODULE = "ai.wso2.integration";
const VOICE_AGENT_VERSION = "1.0.3";
const VOICE_AGENT_LISTENER_TYPE = "CloudVoiceListener";
const DEFAULT_AGENT_VAR_NAME = "voiceAgent";
const AGENT_FILE_NAME = "agents.bal";
const BASE_PATH_KEY = "basePath";

type WizardPhase = "loading" | "listener" | "agent";

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

export function VoiceAgentWizard(props: VoiceAgentWizardProps) {
    const { rpcClient } = useRpcContext();
    const [phase, setPhase] = useState<WizardPhase>("loading");
    const [agentNode, setAgentNode] = useState<FlowNode | undefined>(undefined);
    const [agentFilePath, setAgentFilePath] = useState<string>('');
    const [targetLineRange, setTargetLineRange] = useState<LineRange | undefined>(undefined);
    const [isCreating, setIsCreating] = useState<boolean>(false);
    const [currentStep, setCurrentStep] = useState<number>(0);
    const [loadError, setLoadError] = useState<string>();
    const [loadAttempt, setLoadAttempt] = useState(0);

    const [listenerModel, setListenerModel] = useState<ListenerModel | undefined>(undefined);
    const [listenerFormFields, setListenerFormFields] = useState<FormField[]>([]);
    const [listenerRecordTypeFields, setListenerRecordTypeFields] = useState<RecordTypeField[]>([]);
    const [mainBalFilePath, setMainBalFilePath] = useState<string>('');
    const [mainBalTargetLineRange, setMainBalTargetLineRange] = useState<LineRange | undefined>(undefined);

    const steps = [
        { label: "Creating Listener", description: "Configuring the service listener" },
        { label: "Creating Agent", description: "Creating the voice agent" },
        { label: "Creating Model Provider", description: "Creating the model provider for the voice agent service" },
        { label: "Creating Service", description: "Setting up the voice agent service" },
        { label: "Completing", description: "Finalizing the voice agent service setup" }
    ];

    const projectPath = useRef<string>("");
    const designModelRef = useRef<CDModel>(null);

    const loadAgentForm = async () => {
        const template = await fetchAgentNodeTemplate(rpcClient, projectPath.current);

        template.metadata.description = "Configure your voice agent's model, role, and instructions.";
        template.properties.variable.value = DEFAULT_AGENT_VAR_NAME;

        const initialAgentName = String(template.properties?.variable?.value ?? "");
        (template.properties as Record<string, Property>)[BASE_PATH_KEY] = {
            metadata: {
                label: "Service Base Path",
                description: "The path where this voice service is exposed (e.g. /voiceagent).",
            },
            value: deriveBasePath(initialAgentName),
            optional: false,
            editable: true,
            types: [{ fieldType: "SERVICE_PATH", selected: true }],
        } as Property;

        const endOfFile = await getEndOfFileLineRange(AGENT_FILE_NAME, rpcClient);

        template.codedata.lineRange = endOfFile;
        setAgentFilePath(endOfFile.fileName);
        setTargetLineRange(endOfFile);
        setAgentNode(template);
        setPhase("agent");
    };

    const loadListenerForm = async () => {
        const mainBalFile = `${projectPath.current}/main.bal`;
        const listenerResponse = await rpcClient.getServiceDesignerRpcClient().getListenerModel({
            codedata: {
                orgName: VOICE_AGENT_ORG,
                packageName: VOICE_AGENT_MODULE,
                moduleName: VOICE_AGENT_MODULE,
                version: VOICE_AGENT_VERSION,
                type: VOICE_AGENT_LISTENER_TYPE,
            },
            filePath: mainBalFile
        });
        const listenerConfiguration = listenerResponse.listener;
        listenerConfiguration.properties['variableNameKey'].value = VOICE_AGENT_LISTENER;
        if (listenerConfiguration.properties['listenOn']) {
            listenerConfiguration.properties['listenOn'].advanced = false;
        }

        const endOfMainBal = await rpcClient.getBIDiagramRpcClient().getEndOfFile({ filePath: mainBalFile });

        setMainBalFilePath(mainBalFile);
        setMainBalTargetLineRange({ startLine: endOfMainBal, endLine: endOfMainBal });
        setListenerModel(listenerConfiguration);
        setListenerFormFields(mapPropertiesToFormFields(listenerConfiguration.properties));
        setListenerRecordTypeFields(collectRecordTypeFields(listenerConfiguration.properties));
        setPhase("listener");
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoadError(undefined);
                setPhase("loading");
                const visualizerLocation = await rpcClient.getVisualizerLocation();
                if (cancelled) return;
                projectPath.current = visualizerLocation.projectPath;

                const designModelResponse = await rpcClient.getBIDiagramRpcClient().getDesignModel({});
                if (cancelled) return;
                designModelRef.current = designModelResponse.designModel;

                const listenerExists = designModelRef.current?.listeners.some(
                    listener => listener.symbol.toLowerCase() === VOICE_AGENT_LISTENER.toLowerCase()
                );

                if (listenerExists) {
                    await loadAgentForm();
                } else {
                    await loadListenerForm();
                }
                if (cancelled) return;
            } catch (error) {
                console.error("Error initializing VoiceAgentWizard:", error);
                if (!cancelled) {
                    setLoadError("Unable to load the Voice Agent Service wizard.");
                }
            }
        })();
        return () => { cancelled = true; };
    }, [loadAttempt, rpcClient]);

    const handleCreateListener = async (data: FormValues, formImports: FormImports) => {
        if (!listenerModel) return;

        setIsCreating(true);
        setCurrentStep(0);

        try {
            const updatedListenerModel = applyFormValuesToModel(
                listenerFormFields,
                listenerModel as unknown as ServiceInitModel,
                data,
                formImports
            ) as unknown as ListenerModel;

            await rpcClient.getServiceDesignerRpcClient().addListenerSourceCode({
                filePath: "",
                listener: updatedListenerModel
            });

            await loadAgentForm();
            setIsCreating(false);
            setCurrentStep(0);
        } catch (error) {
            console.error("Error creating the voice listener:", error);
            rpcClient.getCommonRpcClient().showErrorMessage({
                message: "Failed to create the voice service listener. Please try again.",
            });
            setIsCreating(false);
            setCurrentStep(0);
        }
    };

    const handleCreateAgent = async (updatedNode?: FlowNode) => {
        if (!updatedNode) return;

        const agentVarName = String(updatedNode.properties?.variable?.value ?? "");
        const rawBasePath = String((updatedNode.properties as Record<string, Property>)?.[BASE_PATH_KEY]?.value ?? "").trim();
        const basePathSegment = rawBasePath.replace(/^\/+/, "") || toKebabCase(agentVarName);
        const servicePath = sanitizedHttpPath(basePathSegment);

        setIsCreating(true);
        setCurrentStep(1);

        try {
            const endOfFile = await getEndOfFileLineRange(AGENT_FILE_NAME, rpcClient);
            const node = cloneDeep(updatedNode);
            delete (node.properties as Record<string, Property>)[BASE_PATH_KEY];
            node.codedata.lineRange = endOfFile;
            await rpcClient.getBIDiagramRpcClient().getSourceCode({
                filePath: endOfFile.fileName,
                flowNode: node,
            });

            setCurrentStep(2);

            if (isDefaultModelProviderExpr(node.properties?.model?.value)) {
                await rpcClient.getAIAgentRpcClient().configureDefaultModelProvider("model");
            }

            setCurrentStep(3);

            const serviceResponse = await rpcClient.getServiceDesignerRpcClient().getServiceModel({
                filePath: "",
                moduleName: VOICE_AGENT_MODULE,
                listenerName: VOICE_AGENT_LISTENER,
                orgName: VOICE_AGENT_ORG,
            });

            const serviceConfiguration = serviceResponse.service;
            serviceConfiguration.properties["listener"].editable = true;
            serviceConfiguration.properties["listener"].items = [VOICE_AGENT_LISTENER];
            serviceConfiguration.properties["listener"].value = VOICE_AGENT_LISTENER;
            serviceConfiguration.properties["basePath"].value = `/${servicePath}`;
            serviceConfiguration.properties["agentName"].value = agentVarName;

            const serviceSourceCodeResult = await rpcClient.getServiceDesignerRpcClient().addServiceSourceCode({
                filePath: "",
                service: serviceConfiguration
            });

            const newServiceArtifact = serviceSourceCodeResult.artifacts.find(artifact => artifact.isNew);

            setCurrentStep(4);

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
            console.error("Error creating Voice Agent Service:", error);
            rpcClient.getCommonRpcClient().showErrorMessage({
                message: "Failed to create the Voice Agent Service. Please try again.",
            });
            setIsCreating(false);
            setCurrentStep(0);
        }
    };

    return (
        <View>
            <TopNavigationBar projectPath={projectPath.current} />
            <TitleBar
                title="Voice Agent Service"
                subtitle="Create a conversational AI agent reachable over a voice connection."
            />
            <ViewContent padding>
                {isCreating ? (
                    <LoaderContainer>
                        <RelativeLoader message={steps[currentStep].description} />
                    </LoaderContainer>
                ) : loadError ? (
                    <LoaderContainer>
                        <div role="alert">
                            <p>{loadError}</p>
                            <Button appearance="secondary" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
                                Retry
                            </Button>
                        </div>
                    </LoaderContainer>
                ) : phase === "listener" && listenerFormFields.length > 0 && mainBalFilePath && mainBalTargetLineRange ? (
                    <Container>
                        <FormHeader
                            title="Configure Voice Service Listener"
                            subtitle="Review and update how the voice service is exposed before creating the agent."
                        />
                        <ArtifactForm
                            fileName={mainBalFilePath}
                            fields={listenerFormFields}
                            targetLineRange={mainBalTargetLineRange}
                            nestedForm={true}
                            recordTypeFields={listenerRecordTypeFields}
                            onSubmit={handleCreateListener}
                            submitText="Next"
                        />
                    </Container>
                ) : phase === "agent" && agentNode && targetLineRange ? (
                    <Container>
                        <FormHeader title="Create Voice Agent Service" />
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
