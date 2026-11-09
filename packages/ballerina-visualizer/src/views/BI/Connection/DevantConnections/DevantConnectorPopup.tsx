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

import { AvailableNode, ConfigVariable, DIRECTORY_MAP, LinePosition, ParentPopupData } from "@wso2/ballerina-core";
import { Codicon, ProgressRing, Stepper, ThemeColors } from "@wso2/ui-toolkit";
import {
    PopupOverlay,
    PopupContainer,
    PopupHeader,
    PopupTitle,
    CloseButton,
    BackButton,
    HeaderTitleContainer,
    PopupSubtitle,
} from "../styles";
import { PopupContent, StepperContainer } from "../AddConnectionPopup/styles";
import { DevantConnectorList } from "./DevantConnectorList";
import React, { useEffect, useState } from "react";
import { DevantConnectorMarketplaceInfo } from "./DevantConnectorMarketplaceInfo";
import { ConnectionListItem, MarketplaceItem, MarketplaceItemSchema, ServiceInfoVisibilityEnum } from "@wso2/wso2-platform-core";
import { DevantConnectorCreateForm } from "./DevantConnectorCreateForm";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { usePlatformExtContext } from "../../../../providers/platform-ext-ctx-provider";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DevantTempConfig } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { DevantBIConnectorCreateForm } from "./DevantBIConnectorInitForm";
import { DevantBIConnectorSelect } from "./DevantBIConnectorSelect";
import { AddConnectionPopupContent } from "../AddConnectionPopup/AddConnectionPopupContent";
import { APIConnectionForm } from "../APIConnectionPopup";
import {
    DEVANT_CONNECTION_FLOWS_STEPS,
    DevantConnectionFlow,
    DevantConnectionFlowStep,
    DevantConnectionFlowSubTitles,
    DevantConnectionFlowTitles,
    generateInitialConnectionName,
    getKnownAvailableNode,
    ProgressWrap,
    securityTypeOf,
} from "./utils";
import { ModulePart, STKindChecker } from "@wso2/syntax-tree";
import { URI } from "vscode-uri";
import { DevantDatabaseCredentials } from "./DevantDatabaseCredentials";

interface DevantConnectorPopupProps {
    onClose?: (parent?: ParentPopupData) => void;
    onNavigateToOverview: () => void;
    isPopup?: boolean;
    fileName: string;
    target?: LinePosition;
    projectPath: string;
}

export function DevantConnectorPopup(props: DevantConnectorPopupProps) {
    const { onClose, onNavigateToOverview, isPopup, fileName, target, projectPath } = props;
    const { platformRpcClient, platformExtState, importConnection } = usePlatformExtContext();
    const [isCreating, setIsCreating] = useState<boolean>(true);
    const { rpcClient } = useRpcContext();
    const [selectedFlow, setSelectedFlow] = useState<DevantConnectionFlow | null>(null);
    const [selectedMarketplaceItem, setSelectedMarketplaceItem] = useState<MarketplaceItem | null>(null);
    const [steps, setSteps] = useState<DevantConnectionFlowStep[]>([]);
    const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
    const [devantConfigs, setDevantConfigs] = useState<DevantTempConfig[]>([]);
    const [availableNode, setAvailableNode] = useState<AvailableNode>();
    const [IDLFilePath, setIDLFilePath] = useState<string>("");
    const [oasConnectorName, setOasConnectorName] = useState<string>("");
    const [importingConn, setImportingConn] = useState<ConnectionListItem>();

    const goToNextStep = () => {
        if (currentStepIndex < steps.length - 1) {
            setCurrentStepIndex((prev) => prev + 1);
        }
    };

    const goToPreviousStep = () => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex((prev) => prev - 1);
        }
    };

    useEffect(() => {
        if (importConnection?.connection) {
            setImportingConn(importConnection.connection);
            handleInitImportConnector(importConnection.connection);
            importConnection.setConnection(undefined);
            setIsCreating(false);
        }
    }, [importConnection]);

    const { mutate: handleInitImportConnector, isPending: isLoadingImportConnectorData } = useMutation({
        mutationFn: async (connection: ConnectionListItem) => {
            const balOrgConnectors = await rpcClient
                .getBIDiagramRpcClient()
                .search({ filePath: fileName, queryMap: { limit: 60, orgName: "ballerina" }, searchKind: "CONNECTOR" });
            const service =
                connection.resourceType === "DATABASE"
                    ? await platformRpcClient.getMarketplaceDatabaseItem({
                          orgId: platformExtState?.session?.org.handle,
                          resourceId: connection.serviceId,
                      })
                    : await platformRpcClient.getMarketplaceItem({
                          orgId: platformExtState?.session?.org.handle,
                          serviceId: connection.serviceId,
                      });

            let availableNode: AvailableNode | undefined;
            if (service.serviceType === "REST") {
                availableNode = getKnownAvailableNode(balOrgConnectors?.categories, "ballerina", "http");
            } else if (service.serviceType === "GRAPHQL") {
                availableNode = getKnownAvailableNode(balOrgConnectors?.categories, "ballerina", "graphql");
            } else if (service.serviceType === "SOAP") {
                availableNode = getKnownAvailableNode(balOrgConnectors?.categories, "ballerina", "soap");
            } else if (service.serviceType === "GRPC") {
                availableNode = getKnownAvailableNode(balOrgConnectors?.categories, "ballerina", "grpc");
            } else if (service.resourceDetails?.databaseType === "postgres") {
                availableNode = getKnownAvailableNode(balOrgConnectors?.categories, "ballerinax", "postgresql");
            } else if (service.resourceDetails?.databaseType === "mysql") {
                availableNode = getKnownAvailableNode(balOrgConnectors?.categories, "ballerinax", "mysql");
            } else if (service.resourceDetails?.databaseType === "redis") {
                availableNode = getKnownAvailableNode(balOrgConnectors?.categories, "ballerinax", "redis");
            } else if (service.resourceDetails?.databaseType === "kafka") {
                availableNode = getKnownAvailableNode(balOrgConnectors?.categories, "ballerinax", "kafka");
            }

            setSelectedMarketplaceItem(service);
            setAvailableNode(availableNode);

            if (service.resourceType === "DATABASE") {
                if (["postgres", "mysql"].includes(service.resourceDetails?.databaseType)) {
                    setSelectedFlow(DevantConnectionFlow.IMPORT_DATABASE_PERSIST);
                } else {
                    console.error(
                        `Connection import from type ${service.resourceDetails?.databaseType} is not supported yet.`,
                    );
                    return;
                }
            } else if (service.isThirdParty) {
                if (service.serviceType === "REST") {
                    setSelectedFlow(DevantConnectionFlow.IMPORT_THIRD_PARTY_OAS);
                } else if (availableNode) {
                    setSelectedFlow(DevantConnectionFlow.IMPORT_THIRD_PARTY_OTHER);
                } else {
                    setSelectedFlow(DevantConnectionFlow.IMPORT_THIRD_PARTY_OTHER_SELECT_BI_CONNECTOR);
                }
            } else {
                // internal
                if (service.serviceType === "REST") {
                    setSelectedFlow(DevantConnectionFlow.IMPORT_INTERNAL_OAS);
                } else if (availableNode) {
                    setSelectedFlow(DevantConnectionFlow.IMPORT_INTERNAL_OTHER);
                } else {
                    setSelectedFlow(DevantConnectionFlow.IMPORT_INTERNAL_OTHER_SELECT_BI_CONNECTOR);
                }
            }
        },
    });

    useEffect(() => {
        if (selectedFlow) {
            const flowSteps = DEVANT_CONNECTION_FLOWS_STEPS[selectedFlow] || [];
            setSteps(flowSteps);
        } else {
            setSteps([]);
        }
    }, [selectedFlow]);

    const { mutate: createTempConfigs, mutateAsync: createTempConfigsAsync } = useMutation({
        mutationFn: async (params: {item: MarketplaceItem, schema?: MarketplaceItemSchema}) => {
            await deleteTempConfigAsync();
            const configResp = await rpcClient.getBIDiagramRpcClient().getConfigVariablesV2({
                projectPath,
                includeLibraries: false,
            });
            const existingConfigs = new Set<string>();

            const projectToml = await rpcClient.getCommonRpcClient().getCurrentProjectTomlValues();
            const configVars = (configResp.configVariables as any)?.[
                `${projectToml?.package?.org}/${projectToml?.package?.name}`
            ]?.[""] as ConfigVariable[];
            configVars?.forEach((configVar) =>
                existingConfigs.add(configVar?.properties?.variable?.value?.toString() || ""),
            );

            const allEntries = params?.schema?.entries || params.item.connectionSchemas?.[0]?.entries || [];
            const configs: DevantTempConfig[] = allEntries.map((entry) => {
                let uniqueName = entry.name;
                let counter = 1;

                // Check if name conflicts with existing configs or already used names
                while (existingConfigs.has(uniqueName)) {
                    uniqueName = `${entry.name}${counter}`;
                    counter++;
                }

                return {
                    id: entry.name,
                    name: uniqueName,
                    value: "",
                    isSecret: entry.isSensitive,
                    description: entry.description,
                    type: entry.type as "string" | "int",
                    selected: true,
                };
            });
            for (const [index, config] of configs.entries()) {
                const resp = await platformRpcClient.addDevantTempConfig({ name: config.name, newLine: index === 0 });
                config.node = resp.configNode;
            }
            setDevantConfigs(configs);
            return configs;
        },
    });

    useEffect(() => {
        const ignoredFlows = [DevantConnectionFlow.CREATE_INTERNAL_OAS, DevantConnectionFlow.IMPORT_INTERNAL_OAS];
        if (selectedMarketplaceItem && !ignoredFlows.includes(selectedFlow)) {
            createTempConfigs({ item: selectedMarketplaceItem });
        }
    }, [selectedMarketplaceItem, selectedFlow]);

    const handleClosePopup = () => {
        deleteTempConfig();
        if (isPopup) {
            onClose?.();
        } else {
            onNavigateToOverview();
        }
    };

    const handleBackButtonClick = () => {
        if (currentStepIndex > 0) {
            goToPreviousStep();
        } else if (currentStepIndex === 0) {
            setSelectedFlow(null);
            setSelectedMarketplaceItem(null);
            deleteTempConfig();
            setAvailableNode(undefined);
            setOasConnectorName("");
            setIDLFilePath("");

            // if (showDevantMarketplace && !selectedFlow) {
            //     setShowDevantMarketplace(false);
            // }
        }
    };

    const { data: biConnectionNames = [] } = useQuery({
        queryKey: ["bi-connectionNames", projectPath],
        queryFn: async () => {
            const biConnectionNames = new Set<string>();
            const joinedPath = await rpcClient
                .getVisualizerRpcClient()
                .joinProjectPath({ segments: ["connections.bal"] });
            const stResp = await rpcClient.getLangClientRpcClient().getST({
                documentIdentifier: { uri: URI.file(joinedPath.filePath).toString() },
            });

            for (const member of (stResp?.syntaxTree as ModulePart)?.members) {
                if (STKindChecker.isModuleVarDecl(member)) {
                    if (STKindChecker.isCaptureBindingPattern(member.typedBindingPattern?.bindingPattern)) {
                        if (STKindChecker.isIdentifierToken(member.typedBindingPattern?.bindingPattern.variableName)) {
                            biConnectionNames.add(member.typedBindingPattern?.bindingPattern.variableName.value);
                        }
                    }
                }
            }
            return Array.from(biConnectionNames);
        },
    });

    const { data: existingDevantConnNames = devantConfigs?.map((conn) => conn.name) || [] } = useQuery({
        queryKey: ["devant-connection-names-in-project", platformExtState?.selectedContext?.projectName],
        queryFn: async () => {
            const allConnNamesSet = new Set<string>();
            const connections = await platformRpcClient?.getConnections({
                projectId: platformExtState?.selectedContext?.projectName,
                orgId: platformExtState?.session?.org.handle,
                componentId: "",
            });
            if (connections && connections.length > 0) {
                connections.forEach((conn) => allConnNamesSet.add(conn.name));
            }
            const components = await platformRpcClient?.getIntegrationList({
                projectId: platformExtState?.selectedContext?.projectName,
                orgId: platformExtState?.session?.org.handle,
                orgHandle: platformExtState?.session?.org.handle || "",
                projectHandle: platformExtState?.selectedContext?.projectName || "",
            });
            const allConns = await Promise.all(
                components.map((comp) =>
                    platformRpcClient.getConnections({
                        projectId: platformExtState?.selectedContext?.projectName,
                        orgId: platformExtState?.session?.org.handle,
                        componentId: comp.id,
                    }),
                ),
            );
            allConns.forEach((conns) => conns.forEach((conn) => allConnNamesSet.add(conn.name)));
            return Array.from(allConnNamesSet);
        },
        enabled: !!platformExtState?.selectedContext?.projectName,
    });

    const { mutateAsync: importInternalOASConnection, isPending: initializingOASConn } = useMutation({
        mutationFn: async () => {
            const connectionDetailed = await platformRpcClient.getConnection({
                connectionGroupId: importingConn?.groupUuid,
                orgId: platformExtState?.session?.org.handle,
            });

            let tempDevantConfigs = devantConfigs
            const matchingSchema = selectedMarketplaceItem?.connectionSchemas?.find((schema) => schema.id === connectionDetailed?.schemaReference);
            if (matchingSchema) {
                tempDevantConfigs = await createTempConfigsAsync({ item: selectedMarketplaceItem!, schema: matchingSchema });
            }

            let visibility: ServiceInfoVisibilityEnum = ServiceInfoVisibilityEnum.Public;
            if (connectionDetailed?.schemaName?.toLowerCase()?.includes("organization")) {
                visibility = ServiceInfoVisibilityEnum.Organization;
            } else if (connectionDetailed?.schemaName?.toLowerCase()?.includes("project")) {
                visibility = ServiceInfoVisibilityEnum.Project;
            }

            await platformRpcClient.createConnectionConfig({
                marketplaceItem: selectedMarketplaceItem,
                name: connectionDetailed.name,
                visibility: visibility,
                componentDir: projectPath,
            });

            const securityType = securityTypeOf(connectionDetailed);
            const configurations = connectionDetailed?.configurations;

            const resp = await platformRpcClient.initializeDevantOASConnection({
                name: connectionDetailed.name,
                marketplaceItem: selectedMarketplaceItem,
                visibility,
                configurations,
                securityType,
                devantConfigs: tempDevantConfigs,
            });
            return resp;
        },
        onSuccess: (data) => {
            platformRpcClient.refreshConnectionList();
            if (onClose) {
                onClose({
                    recentIdentifier: data.connectionName,
                    artifactType: DIRECTORY_MAP.CONNECTION,
                });
            }
        },
    });

    const { mutate: generateCustomConnectorFromOAS, isPending: generatingCustomConnectorFromOAS } = useMutation({
        mutationFn: async () => {
            if (selectedFlow === DevantConnectionFlow.IMPORT_INTERNAL_OAS) {
                await importInternalOASConnection();
            } else {
                const resp = await platformRpcClient?.generateCustomConnectorFromOAS({
                    marketplaceItem: selectedMarketplaceItem!,
                    connectionName: generateInitialConnectionName(
                        biConnectionNames,
                        existingDevantConnNames,
                        selectedMarketplaceItem?.name,
                    ),
                });
                return resp;
            }
        },
        onSuccess: (data) => {
            setAvailableNode(data?.connectionNode);
            goToNextStep();
        },
    });

    const { mutate: deleteTempConfig, mutateAsync: deleteTempConfigAsync } = useMutation({
        mutationFn: async () => {
            if (devantConfigs.length > 0) {
                await platformRpcClient?.deleteDevantTempConfigs({
                    nodes: devantConfigs.map((config) => config.node!),
                });
            }
        },
        onSettled: () => setDevantConfigs([]),
    });

    let title: string = isCreating ? "Add Connection" : "Import Connection";

    let subTitle: string = "";
    if (selectedFlow && DevantConnectionFlowTitles[selectedFlow]) {
        title = DevantConnectionFlowTitles[selectedFlow];
        subTitle = DevantConnectionFlowSubTitles[selectedFlow] || "";
    }

    const isRootLoading = isLoadingImportConnectorData;

    const hidePadding = [DevantConnectionFlow.CREATE_DATABASE_PERSIST, DevantConnectionFlow.IMPORT_DATABASE_PERSIST, DevantConnectionFlow.CREATE_THIRD_PARTY_PERSIST, DevantConnectionFlow.IMPORT_THIRD_PARTY_PERSIST, DevantConnectionFlow.CREATE_DATABASE_PERSIST_DB_SELECTED].includes(selectedFlow)

    return (
        <>
            <PopupOverlay sx={{ background: `${ThemeColors.SURFACE_CONTAINER}`, opacity: `0.5` }} />
            <PopupContainer>
                <PopupHeader>
                    {(isCreating ? selectedFlow : currentStepIndex > 0) && (
                        <BackButton appearance="icon" onClick={handleBackButtonClick}>
                            <Codicon name="chevron-left" />
                        </BackButton>
                    )}
                    <HeaderTitleContainer>
                        <PopupTitle variant="h2">{title}</PopupTitle>
                        {subTitle && <PopupSubtitle variant="body2">{subTitle}</PopupSubtitle>}
                    </HeaderTitleContainer>
                    <CloseButton appearance="icon" onClick={() => handleClosePopup()}>
                        <Codicon name="close" />
                    </CloseButton>
                </PopupHeader>
                {selectedFlow && steps.length > 1 && (
                    <StepperContainer>
                        <Stepper steps={steps} currentStep={currentStepIndex} alignment="center" />
                    </StepperContainer>
                )}
                <PopupContent style={ hidePadding ? { padding: 0 } : {padding:"16px 20px"}}>
                    {isRootLoading ? (
                        <ProgressWrap>
                            <ProgressRing />
                        </ProgressWrap>
                    ) : (
                        <>
                            {selectedFlow ? (
                                <>
                                    {steps.length > 0 && steps[currentStepIndex].length > 0 && (
                                        <>
                                            {steps[currentStepIndex] === DevantConnectionFlowStep.VIEW_SWAGGER && (
                                                <DevantConnectorMarketplaceInfo
                                                    item={selectedMarketplaceItem}
                                                    onNextClick={() => {
                                                        if (
                                                            [
                                                                DevantConnectionFlow.IMPORT_INTERNAL_OAS,
                                                                DevantConnectionFlow.CREATE_THIRD_PARTY_OAS,
                                                                DevantConnectionFlow.IMPORT_THIRD_PARTY_OAS,
                                                            ].includes(selectedFlow)
                                                        ) {
                                                            generateCustomConnectorFromOAS();
                                                        } else {
                                                            goToNextStep();
                                                        }
                                                    }}
                                                    onFlowChange={(flow) => setSelectedFlow(flow)}
                                                    loading={generatingCustomConnectorFromOAS || initializingOASConn}
                                                    importedConnection={importingConn}
                                                    saveButtonText={
                                                        selectedFlow === DevantConnectionFlow.IMPORT_INTERNAL_OAS
                                                            ? "Save"
                                                            : "Continue"
                                                    }
                                                />
                                            )}
                                            {steps[currentStepIndex] ===
                                                DevantConnectionFlowStep.INIT_DEVANT_INTERNAL_OAS_CONNECTOR && (
                                                <DevantConnectorCreateForm
                                                    biConnectionNames={biConnectionNames}
                                                    projectPath={projectPath}
                                                    marketplaceItem={selectedMarketplaceItem}
                                                    existingDevantConnNames={existingDevantConnNames}
                                                    devantFlow={selectedFlow!}
                                                    devantConfigs={devantConfigs}
                                                    createTempConfigsAsync={createTempConfigsAsync}
                                                    onSuccess={(data) => {
                                                        if (data.connectionName && onClose) {
                                                            onClose({
                                                                recentIdentifier: data.connectionName,
                                                                artifactType: DIRECTORY_MAP.CONNECTION,
                                                            });
                                                        }
                                                    }}
                                                />
                                            )}
                                            {steps[currentStepIndex] === DevantConnectionFlowStep.INIT_CONNECTOR && (
                                                <DevantBIConnectorCreateForm
                                                    fileName={fileName}
                                                    onClose={onClose}
                                                    devantConfigs={devantConfigs}
                                                    resetDevantConfigs={() => setDevantConfigs([])}
                                                    selectedFlow={selectedFlow}
                                                    selectedMarketplaceItem={selectedMarketplaceItem}
                                                    selectedConnector={availableNode}
                                                    IDLFilePath={IDLFilePath}
                                                    biConnectionNames={biConnectionNames}
                                                    existingDevantConnNames={existingDevantConnNames}
                                                    onFlowChange={(flow) => setSelectedFlow(flow)}
                                                    importedConnection={importingConn}
                                                    projectPath={projectPath}
                                                    onAddDevantConfig={async (name, value, isSecret) => {
                                                        const resp = await platformRpcClient.addDevantTempConfig({
                                                            name,
                                                            newLine: devantConfigs.length === 0,
                                                        });
                                                        const newDevantConfig: DevantTempConfig = {
                                                            id: name,
                                                            name: name,
                                                            value: value,
                                                            isSecret: isSecret,
                                                            type: "string",
                                                            node: resp.configNode,
                                                        };
                                                        setDevantConfigs([...devantConfigs, newDevantConfig]);
                                                    }}
                                                />
                                            )}
                                            {steps[currentStepIndex] ===
                                                DevantConnectionFlowStep.SELECT_BI_CONNECTOR && (
                                                <DevantBIConnectorSelect
                                                    fileName={fileName}
                                                    target={target}
                                                    onItemSelect={(availableNode) => {
                                                        setAvailableNode(availableNode);
                                                        goToNextStep();
                                                    }}
                                                />
                                            )}
                                            {steps[currentStepIndex] === DevantConnectionFlowStep.UPLOAD_OAS && (
                                                <APIConnectionForm
                                                    fileName={fileName}
                                                    projectPath={projectPath}
                                                    target={target}
                                                    initialFilePath={IDLFilePath}
                                                    initialName={oasConnectorName}
                                                    disabled={!!IDLFilePath}
                                                    apiSpecOptions={[
                                                        { id: "openapi", value: "OpenAPI", content: "OpenAPI" },
                                                    ]}
                                                    actionButtonText="Continue"
                                                    availableNode={availableNode}
                                                    onSave={(availableNode, _flowNode, _type, name, filePath) => {
                                                        setAvailableNode(availableNode);
                                                        goToNextStep();
                                                        setOasConnectorName(name);
                                                        setIDLFilePath(filePath);
                                                    }}
                                                />
                                            )}
                                            {[
                                                DevantConnectionFlow.CREATE_DATABASE_PERSIST,
                                                DevantConnectionFlow.CREATE_DATABASE_PERSIST_DB_SELECTED,
                                                DevantConnectionFlow.CREATE_THIRD_PARTY_PERSIST,
                                                DevantConnectionFlow.IMPORT_DATABASE_PERSIST,
                                                DevantConnectionFlow.IMPORT_THIRD_PARTY_PERSIST,
                                            ].includes(selectedFlow) && (
                                                <DevantDatabaseCredentials
                                                    biConnectionNames={biConnectionNames}
                                                    existingDevantConnNames={existingDevantConnNames}
                                                    projectPath={projectPath}
                                                    onClose={onClose}
                                                    setSelectedMarketplaceItem={setSelectedMarketplaceItem}
                                                    selectedMarketplaceItem={selectedMarketplaceItem}
                                                    importedConnection={importingConn}
                                                    devantConfigs={devantConfigs}
                                                    selectedStep={steps[currentStepIndex]}
                                                    goToNextStep={goToNextStep}
                                                    selectedFlow={selectedFlow}
                                                    setSelectedFlow={setSelectedFlow}
                                                />
                                            )}
                                        </>
                                    )}
                                </>
                            ) : (
                                <AddConnectionPopupContent
                                    {...props}
                                    handleSelectConnector={(availableNode, _) => {
                                        setAvailableNode(availableNode);
                                        setSelectedFlow(
                                            DevantConnectionFlow.REGISTER_CREATE_THIRD_PARTY_FROM_BI_CONNECTOR,
                                        );
                                    }}
                                    handleApiSpecConnection={() => {
                                        setSelectedFlow(DevantConnectionFlow.REGISTER_CREATE_THIRD_PARTY_FROM_OAS);
                                    }}
                                    handleDatabaseConnection={() => {
                                        setSelectedFlow(DevantConnectionFlow.CREATE_THIRD_PARTY_PERSIST);
                                    }}
                                    DevantServicesSection={({ searchText }) => (
                                        <DevantConnectorList
                                            fileName={fileName}
                                            target={target}
                                            onItemSelect={(flow, item, availableNode) => {
                                                setSelectedFlow(flow);
                                                setSelectedMarketplaceItem(item);
                                                setAvailableNode(availableNode);
                                            }}
                                            searchText={searchText}
                                        />
                                    )}
                                />
                            )}
                        </>
                    )}
                </PopupContent>
            </PopupContainer>
        </>
    );
}
