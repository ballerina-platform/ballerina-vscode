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

import {
    ConnectionListItem,
    getTypeForDisplayType,
    ServiceInfoVisibilityEnum,
    type MarketplaceItem,
} from "@wso2/wso2-platform-core";
import React, { useEffect, type FC } from "react";
import { usePlatformExtContext } from "../../../../providers/platform-ext-ctx-provider";
import { useMutation } from "@tanstack/react-query";
import { DevantTempConfig } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { ConnectionConfigurationForm, ConnectionConfigurationFormProps } from "../ConnectionConfigurationPopup";
import { DIRECTORY_MAP } from "@wso2/ballerina-core";
import {
    DevantConnectionFlow,
    generateInitialConnectionName,
    getInitialVisibility,
    getPossibleVisibilities,
    isValidDevantConnName,
} from "./utils";

interface Props extends Omit<ConnectionConfigurationFormProps, "devantConfigs"> {
    importedConnection?: ConnectionListItem;
    selectedMarketplaceItem: MarketplaceItem;
    selectedFlow: DevantConnectionFlow;
    devantConfigs: DevantTempConfig[];
    resetDevantConfigs: () => void;
    onAddDevantConfig: (name: string, value: string, isSecret: boolean) => Promise<void>;
    IDLFilePath?: string;
    biConnectionNames: string[];
    existingDevantConnNames: string[];
    onFlowChange: (flow: DevantConnectionFlow | null) => void;
    projectPath: string;
}

export const DevantBIConnectorCreateForm: FC<Props> = (props) => {
    const {
        selectedMarketplaceItem,
        selectedFlow,
        devantConfigs,
        onAddDevantConfig,
        IDLFilePath,
        biConnectionNames,
        onClose,
        resetDevantConfigs,
        onFlowChange,
        importedConnection,
        projectPath,
        existingDevantConnNames,
    } = props;
    const { platformExtState, platformRpcClient } = usePlatformExtContext();

    let initialNameCandidate =
        selectedMarketplaceItem?.name?.replaceAll(" ", "_")?.replaceAll("-", "_") || "my_connection";
    if (
        [
            DevantConnectionFlow.REGISTER_CREATE_THIRD_PARTY_FROM_BI_CONNECTOR,
            DevantConnectionFlow.REGISTER_CREATE_THIRD_PARTY_FROM_OAS,
        ].includes(selectedFlow)
    ) {
        initialNameCandidate = props.selectedConnector?.codedata?.module;
    }
    if (importedConnection) {
        initialNameCandidate = importedConnection?.name?.replaceAll(" ", "_")?.replaceAll("-", "_") || "my_connection";
    }

    useEffect(() => {
        if (selectedMarketplaceItem && !props.selectedConnector) {
            if (importedConnection) {
                onFlowChange(
                    selectedMarketplaceItem.isThirdParty
                        ? DevantConnectionFlow.IMPORT_THIRD_PARTY_OTHER_SELECT_BI_CONNECTOR
                        : DevantConnectionFlow.IMPORT_INTERNAL_OTHER_SELECT_BI_CONNECTOR,
                );
            } else {
                onFlowChange(
                    selectedMarketplaceItem.isThirdParty
                        ? DevantConnectionFlow.CREATE_THIRD_PARTY_OTHER_SELECT_BI_CONNECTOR
                        : DevantConnectionFlow.CREATE_INTERNAL_OTHER_SELECT_BI_CONNECTOR,
                );
            }
        }
    }, [props.selectedConnector]);

    const { mutate: createDevantInternalConnNonOAS, isPending: isCreating } = useMutation({
        mutationFn: async ({ recentIdentifier }: { recentIdentifier: string }) => {
            if (importedConnection) {
                const connectionDetailed = await platformRpcClient.getConnection({
                    connectionGroupId: importedConnection.groupUuid,
                    orgId: platformExtState?.selectedContext?.org?.id?.toString(),
                });
                await platformRpcClient.replaceDevantTempConfigValues({
                    configs: devantConfigs,
                    createdConnection: connectionDetailed,
                });

                let visibility: ServiceInfoVisibilityEnum = ServiceInfoVisibilityEnum.Public;
                if (connectionDetailed?.schemaName?.toLowerCase()?.includes("organization")) {
                    visibility = ServiceInfoVisibilityEnum.Organization;
                } else if (connectionDetailed?.schemaName?.toLowerCase()?.includes("project")) {
                    visibility = ServiceInfoVisibilityEnum.Project;
                }

                await platformRpcClient.createConnectionConfig({
                    marketplaceItem: selectedMarketplaceItem,
                    name: importedConnection.name,
                    visibility,
                    componentDir: projectPath,
                });
            } else if (
                [
                    DevantConnectionFlow.REGISTER_CREATE_THIRD_PARTY_FROM_BI_CONNECTOR,
                    DevantConnectionFlow.REGISTER_CREATE_THIRD_PARTY_FROM_OAS,
                ].includes(selectedFlow) &&
                devantConfigs?.length > 0
            ) {
                const marketplaceService = await platformRpcClient.registerDevantMarketplaceService({
                    name: recentIdentifier,
                    configs: devantConfigs?.map((item) => ({ ...item, id: item.name })) || [],
                    idlFilePath: IDLFilePath || "",
                    idlType:
                        selectedFlow === DevantConnectionFlow.REGISTER_CREATE_THIRD_PARTY_FROM_OAS ? "OpenAPI" : "TCP",
                    serviceType: "REST",
                });

                const isProjectLevel = !!!platformExtState?.selectedComponent?.metadata?.id;

                const createdConnection = await platformRpcClient?.createThirdPartyConnection({
                    componentId: isProjectLevel ? "" : platformExtState?.selectedComponent?.metadata?.id,
                    name: recentIdentifier,
                    orgId: platformExtState?.selectedContext?.org.id?.toString(),
                    orgUuid: platformExtState?.selectedContext?.org?.uuid,
                    projectId: platformExtState?.selectedContext?.project.id,
                    serviceSchemaId: marketplaceService.connectionSchemas[0]?.id,
                    serviceId: marketplaceService.serviceId,
                    endpointRefs: marketplaceService.endpointRefs,
                    sensitiveKeys: marketplaceService.connectionSchemas[0].entries
                        ?.filter((item) => item.isSensitive)
                        .map((item) => item.name),
                });

                await platformRpcClient.replaceDevantTempConfigValues({
                    configs: devantConfigs,
                    createdConnection: createdConnection,
                });

                await platformRpcClient.createConnectionConfig({
                    marketplaceItem: marketplaceService,
                    name: recentIdentifier,
                    visibility: "PUBLIC",
                    componentDir: projectPath,
                });
            } else if (
                [
                    DevantConnectionFlow.CREATE_THIRD_PARTY_OAS,
                    DevantConnectionFlow.CREATE_THIRD_PARTY_OTHER,
                    DevantConnectionFlow.CREATE_THIRD_PARTY_OTHER_SELECT_BI_CONNECTOR,
                ].includes(selectedFlow)
            ) {
                const isProjectLevel = !!!platformExtState?.selectedComponent?.metadata?.id;
                const createdConnection = await platformRpcClient?.createThirdPartyConnection({
                    componentId: isProjectLevel ? "" : platformExtState?.selectedComponent?.metadata?.id,
                    name: recentIdentifier,
                    orgId: platformExtState?.selectedContext?.org.id?.toString(),
                    orgUuid: platformExtState?.selectedContext?.org?.uuid,
                    projectId: platformExtState?.selectedContext?.project.id,
                    serviceSchemaId: selectedMarketplaceItem.connectionSchemas[0]?.id,
                    serviceId: selectedMarketplaceItem.serviceId,
                    endpointRefs: selectedMarketplaceItem.endpointRefs,
                    sensitiveKeys: selectedMarketplaceItem.connectionSchemas[0].entries
                        ?.filter((item) => item.isSensitive)
                        .map((item) => item.name),
                });

                await platformRpcClient.replaceDevantTempConfigValues({
                    configs: devantConfigs,
                    createdConnection: createdConnection,
                });

                await platformRpcClient.createConnectionConfig({
                    marketplaceItem: selectedMarketplaceItem,
                    name: recentIdentifier,
                    visibility: "PUBLIC",
                    componentDir: projectPath,
                });
            } else if (
                [
                    DevantConnectionFlow.CREATE_INTERNAL_OTHER,
                    DevantConnectionFlow.CREATE_INTERNAL_OTHER_SELECT_BI_CONNECTOR,
                ].includes(selectedFlow)
            ) {
                const isProjectLevel = !!!platformExtState?.selectedComponent?.metadata?.id;
                const visibilities = getPossibleVisibilities(
                    selectedMarketplaceItem,
                    platformExtState?.selectedContext?.project,
                );
                const createdConnection = await platformRpcClient?.createInternalConnection({
                    componentId: isProjectLevel ? "" : platformExtState.selectedComponent?.metadata?.id,
                    name: recentIdentifier,
                    orgId: platformExtState.selectedContext?.org.id?.toString(),
                    orgUuid: platformExtState.selectedContext?.org?.uuid,
                    projectId: platformExtState.selectedContext?.project.id,
                    serviceSchemaId: selectedMarketplaceItem.connectionSchemas[0]?.id || "",
                    serviceId: selectedMarketplaceItem.serviceId,
                    serviceVisibility: getInitialVisibility(selectedMarketplaceItem, visibilities),
                    componentType: isProjectLevel
                        ? "non-component"
                        : getTypeForDisplayType(platformExtState.selectedComponent?.spec?.type),
                    componentPath: projectPath,
                    generateCreds: true,
                });

                await platformRpcClient.replaceDevantTempConfigValues({
                    configs: devantConfigs,
                    createdConnection: createdConnection,
                });

                await platformRpcClient.createConnectionConfig({
                    marketplaceItem: selectedMarketplaceItem,
                    name: recentIdentifier,
                    visibility: getInitialVisibility(selectedMarketplaceItem, visibilities),
                    componentDir: projectPath,
                });
            }
        },
        onError: (error) => {
            console.error(">>> Error creating WSO2 Cloud connection", error);
        },
        onSuccess: (_, { recentIdentifier }) => {
            platformRpcClient.refreshConnectionList();
            resetDevantConfigs();
            onClose({ recentIdentifier, artifactType: DIRECTORY_MAP.CONNECTION });
        },
    });

    if (!props.selectedConnector) {
        return null;
    }

    if (!platformExtState?.isLoggedIn) {
        return <ConnectionConfigurationForm {...props} />;
    }

    return (
        <ConnectionConfigurationForm
            {...props}
            devantExpressionEditor={{
                devantConfigs: devantConfigs.map((config) => config.name),
                onAddDevantConfig: [
                    // Only allow users to create devant configs via these flows
                    DevantConnectionFlow.REGISTER_CREATE_THIRD_PARTY_FROM_BI_CONNECTOR,
                    DevantConnectionFlow.REGISTER_CREATE_THIRD_PARTY_FROM_OAS,
                ].includes(selectedFlow)
                    ? onAddDevantConfig
                    : undefined,
            }}
            onClose={(params) => {
                if (params.recentIdentifier) {
                    createDevantInternalConnNonOAS({ recentIdentifier: params.recentIdentifier });
                } else {
                    onClose();
                }
            }}
            loading={isCreating}
            customValidator={(fieldKey, value) => {
                if (fieldKey === "variable") {
                    return isValidDevantConnName(value, existingDevantConnNames, biConnectionNames, !!importedConnection);
                }
                return undefined;
            }}
            overrideFlowNode={(node) => {
                if (node.properties.variable) {
                    node.properties.variable.value = importedConnection
                        ? initialNameCandidate
                        : generateInitialConnectionName(
                              biConnectionNames,
                              existingDevantConnNames,
                              initialNameCandidate,
                          );
                    if (importedConnection) {
                        node.properties.variable.editable = false;
                    }
                }
                return node;
            }}
        />
    );
};
