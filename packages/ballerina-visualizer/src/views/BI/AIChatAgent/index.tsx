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

import { useEffect, useState } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { NodePosition } from "@wso2/syntax-tree";
import {
    EVENT_TYPE,
    LineRange,
    MACHINE_VIEW,
    ServiceModel,
    FunctionModel,
    DIRECTORY_MAP,
    ProjectStructureArtifactResponse,
    PropertyModel,
    isSamePath,
} from "@wso2/ballerina-core";
import { Codicon, Icon, LinkButton, Typography, View } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { TitleBar } from "../../../components/TitleBar";
import { LoadingRing } from "../../../components/Loader";

const LoadingContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 80vh;
    flex-direction: column;
`;

const InfoContainer = styled.div`
    display: flex;
    gap: 20px;
    padding: 15px;
    //border: 1px solid var(--vscode-editorIndentGuide-background);
`;

const InfoSection = styled.div`
    display: flex;
    align-items: center;
`;

const ServiceContainer = styled.div`
    padding-right: 10px;
    padding-left: 10px;
`;

const FunctionsContainer = styled.div`
    max-height: 550px;
    overflow: scroll;
`;

interface AIAgentDesignerProps {
    projectPath: string;
    filePath: string;
    position: NodePosition;
}

export function AIAgentDesigner(props: AIAgentDesignerProps) {
    const { projectPath, filePath, position } = props;
    const { rpcClient } = useRpcContext();
    const [serviceModel, setServiceModel] = useState<ServiceModel>(undefined);
    const [serviceName, setServiceName] = useState<string>("");

    const [functionModel, setFunctionModel] = useState<FunctionModel>(undefined);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    const [isNew, setIsNew] = useState<boolean>(false);
    const [showForm, setShowForm] = useState<boolean>(false);
    const [showFunctionConfigForm, setShowFunctionConfigForm] = useState<boolean>(false);
    const [projectListeners, setProjectListeners] = useState<ProjectStructureArtifactResponse[]>([]);

    const supportedServiceTypes = ["http", "ai"];

    useEffect(() => {
        fetchService();
    }, [position]);

    const fetchService = () => {
        const lineRange: LineRange = {
            startLine: { line: position.startLine, offset: position.startColumn },
            endLine: { line: position.endLine, offset: position.endColumn },
        };
        rpcClient
            .getServiceDesignerRpcClient()
            .getServiceModelFromCode({ filePath, codedata: { lineRange } })
            .then((res) => {
                console.log("Service Model =======: ", res.service);
                setServiceModel(res.service);
                setIsSaving(false);
                const name = res.service?.properties?.["stringLiteral"]?.value || "";
                setServiceName(name.replace(/^"|"$/g, ""));
            });
        getProjectListeners();
    };

    const getProjectListeners = () => {
        rpcClient.getVisualizerLocation().then((location) => {
            const projectPath = location.projectPath;
            rpcClient.getBIDiagramRpcClient().getProjectStructure().then((res) => {
                const project = res.projects.find(project => isSamePath(project.projectPath, projectPath));
                const listeners = project?.directoryMap[DIRECTORY_MAP.LISTENER];
                if (listeners.length > 0) {
                    setProjectListeners(listeners);
                }
            });
        });
    };

    const handleOpenListener = (value: string) => {
        const listenerValue = projectListeners.find((listener) => listener.name === value);
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.BIListenerConfigView,
                position: listenerValue.position,
                documentUri: listenerValue.path,
            },
        });
    };

    const handleOpenDiagram = async (resource: FunctionModel) => {
        const lineRange: LineRange = resource.codedata.lineRange;
        const nodePosition: NodePosition = {
            startLine: lineRange.startLine.line,
            startColumn: lineRange.startLine.offset,
            endLine: lineRange.endLine.line,
            endColumn: lineRange.endLine.offset,
        };
        await rpcClient
            .getVisualizerRpcClient()
            .openView({ type: EVENT_TYPE.OPEN_VIEW, location: { position: nodePosition, documentUri: filePath } });
    };

    const handleServiceEdit = async () => {
        await rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.BIServiceConfigView,
                position: position,
                documentUri: filePath,
            },
        });
    };

    const handleFunctionEdit = (value: FunctionModel) => {
        console.log("Function Model: ", value);
        setFunctionModel(value);
        setIsNew(false);
        setShowForm(true);
    };

    const handleServiceTryIt = () => {
        const basePath = serviceModel.properties?.basePath?.value?.trim() ?? "";
        const listener = serviceModel.properties?.listener?.value?.trim();
        const commands = ["ballerina.tryIt", false, undefined, { basePath, listener }];
        rpcClient.getCommonRpcClient().executeCommand({ commands });
    };

    const findIcon = (label: string) => {
        label = label.toLowerCase();
        switch (true) {
            case label.includes("listener"):
                return "bell";
            case label.includes("path"):
                return "link";
            default:
                return "info";
        }
    };

    const getAttributeComponent = (component: PropertyModel) => {
        const label = component.metadata.label.toLowerCase();
        switch (true) {
            case label.includes("listener"):
                return component.values?.length > 0 ? (
                    component.values.map((item, index) => (
                        <LinkButton
                            sx={{ fontSize: 12, padding: 8, gap: 4 }}
                            key={`${index}-btn`}
                            onClick={() => handleOpenListener(item)}
                        >
                            {item}
                        </LinkButton>
                    ))
                ) : (
                    <LinkButton
                        sx={{ fontSize: 12, padding: 8, gap: 4 }}
                        onClick={() => handleOpenListener(component.value)}
                    >
                        {component.value}
                    </LinkButton>
                );
            case label.includes("path"):
                return component.value;
            default:
                return component.value;
        }
    };

    return (
        <View>
            <TopNavigationBar projectPath={projectPath} />
            <TitleBar
                title="Chat Agent Service"
                subtitle={serviceName}
                actions={
                    <>
                        <VSCodeButton appearance="secondary" title="Edit Service" onClick={handleServiceEdit}>
                            <Icon name="bi-edit" sx={{ marginRight: 8, fontSize: 16 }} /> Edit
                        </VSCodeButton>
                        {serviceModel && supportedServiceTypes.includes(serviceModel.moduleName) && (
                            <VSCodeButton
                                appearance="secondary"
                                title={serviceModel.moduleName === "ai" ? "Chat with Agent" : "Try Service"}
                                onClick={handleServiceTryIt}
                            >
                                <Icon
                                    name={serviceModel.moduleName === "ai" ? "comment-discussion" : "play"}
                                    isCodicon={true}
                                    sx={{ marginRight: 8, fontSize: 16 }}
                                />{" "}
                                {serviceModel.moduleName === "ai" ? "Chat" : "Try It"}
                            </VSCodeButton>
                        )}
                    </>
                }
            />
            <ServiceContainer>
                {!serviceModel && (
                    <LoadingContainer>
                        <LoadingRing message="Loading Service..." />
                    </LoadingContainer>
                )}
                {isSaving && (
                    <LoadingContainer>
                        <LoadingRing message="Saving..." />
                    </LoadingContainer>
                )}
                {serviceModel && (
                    <>
                        <InfoContainer>
                            {Object.keys(serviceModel.properties).map(
                                (key, index) =>
                                    serviceModel.properties[key].value && (
                                        <InfoSection>
                                            <Icon
                                                name={findIcon(serviceModel.properties[key].metadata.label)}
                                                isCodicon
                                                sx={{ marginRight: "8px" }}
                                            />
                                            <Typography key={`${index}-label`} variant="body3">
                                                {serviceModel.properties[key].metadata.label}:
                                            </Typography>
                                            <Typography key={`${index}-value`} variant="body3">
                                                {getAttributeComponent(serviceModel.properties[key])}
                                            </Typography>
                                        </InfoSection>
                                    )
                            )}

                            {serviceModel.moduleName === "http" &&
                                serviceModel.functions
                                    .filter((func) => func.kind === "DEFAULT" && func.enabled)
                                    .map((functionModel, index) => (
                                        <InfoSection>
                                            <Icon name={findIcon("init")} isCodicon sx={{ marginRight: "8px" }} />
                                            <Typography key={`${index}-label`} variant="body3">
                                                Constructor:
                                            </Typography>
                                            <Typography key={`${index}-value`} variant="body3">
                                                <LinkButton
                                                    sx={{ fontSize: 12, padding: 8, gap: 4 }}
                                                    onClick={() => handleOpenDiagram(functionModel)}
                                                >
                                                    {functionModel.name.value}
                                                </LinkButton>
                                            </Typography>
                                        </InfoSection>
                                    ))}

                            {serviceModel.functions.map((functionModel, index) => (
                                <VSCodeButton
                                    appearance="icon"
                                    onClick={() => {
                                        handleFunctionEdit(functionModel);
                                    }}
                                >
                                    <Codicon name="edit" sx={{ marginRight: 8, fontSize: 16 }} />
                                    Configure Chat Flow
                                </VSCodeButton>
                            ))}
                        </InfoContainer>
                    </>
                )}
            </ServiceContainer>
        </View>
    );
}
