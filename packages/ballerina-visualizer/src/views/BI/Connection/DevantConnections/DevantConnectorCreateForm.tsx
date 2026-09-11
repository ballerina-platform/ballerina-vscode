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

import {
    type MarketplaceItem,
    type MarketplaceItemSchema,
    capitalizeFirstLetter,
    getTypeForDisplayType,
} from "@wso2/wso2-platform-core";
import React, { ReactNode, useEffect, useState, type FC } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { FormStyles } from "../../Forms/styles";
import { Dropdown, TextField, Codicon, LinkButton, ThemeColors, CheckBox, CheckBoxGroup } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { usePlatformExtContext } from "../../../../providers/platform-ext-ctx-provider";
import { useMutation } from "@tanstack/react-query";
import { ActionButton, ConnectorContentContainer, ConnectorInfoContainer, FooterContainer } from "../styles";
import { DevantTempConfig } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import {
    DevantConnectionFlow,
    generateInitialConnectionName,
    getInitialVisibility,
    getPossibleSchemas,
    getPossibleVisibilities,
    isValidDevantConnName,
} from "./utils";

const Row = styled.div<{}>`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    width: 100%;
`;

export const ButtonContainer = styled.div<{}>`
    display: flex;
    flex-direction: row;
    flex-grow: 1;
    justify-content: flex-end;
`;

const BoxGroup = styled.div`
    display: flex;
    width: 100%;
    flex-wrap: wrap;
`;

const RowTitle = styled.div`
    display: flex;
    gap: 2px;
    align-items: center;
`;

interface CreateConnectionForm {
    name?: string;
    visibility?: string;
    schemaId?: string;
    isProjectLevel?: boolean;
    envKeys?: string[];
}

interface DevantConnectorCreateFormProps {
    marketplaceItem: MarketplaceItem | undefined;
    projectPath: string;
    devantConfigs: DevantTempConfig[];
    devantFlow: DevantConnectionFlow;
    existingDevantConnNames?: string[];
    biConnectionNames?: string[];
    createTempConfigsAsync: (params: {item: MarketplaceItem, schema?: MarketplaceItemSchema}) => Promise<DevantTempConfig[]>;
    onSuccess?: (data: { connectionNode?: any; connectionName?: string }) => void;
}

export const DevantConnectorCreateForm: FC<DevantConnectorCreateFormProps> = ({
    biConnectionNames,
    marketplaceItem,
    existingDevantConnNames = [],
    projectPath,
    onSuccess,
    devantConfigs = [],
    createTempConfigsAsync,
}) => {
    const { platformExtState, platformRpcClient } = usePlatformExtContext();
    const [showAdvancedSection, setShowAdvancedSection] = useState(false);

    const visibilities = getPossibleVisibilities(marketplaceItem, platformExtState?.selectedContext?.project);

    const form = useForm<CreateConnectionForm>({
        mode: "all",
        defaultValues: {
            name: generateInitialConnectionName(
                biConnectionNames,
                existingDevantConnNames,
                marketplaceItem?.name || "",
            ),
            visibility: getInitialVisibility(marketplaceItem, visibilities),
            schemaId: "",
            isProjectLevel: false,
            envKeys: [],
        },
    });

    useEffect(() => {
        form.reset({
            name: generateInitialConnectionName(
                biConnectionNames,
                existingDevantConnNames,
                marketplaceItem?.name || "",
            ),
            visibility: getInitialVisibility(marketplaceItem, visibilities),
            schemaId: "",
            isProjectLevel: false,
        });
    }, [marketplaceItem]);

    const { mutate: createConnection, isPending: isCreatingConnection } = useMutation({
        mutationFn: async (data: CreateConnectionForm) => {
            const createdConnection = await platformRpcClient?.createInternalConnection({
                componentId: isProjectLevel ? "" : platformExtState.selectedComponent?.metadata?.id,
                name: data.name,
                orgId: platformExtState.selectedContext?.org.id?.toString(),
                orgUuid: platformExtState.selectedContext?.org?.uuid,
                projectId: platformExtState.selectedContext?.project.id,
                serviceSchemaId: marketplaceItem?.connectionSchemas?.find(item=> item.id === data.schemaId)?.id || "",
                serviceId: marketplaceItem?.serviceId,
                serviceVisibility: data.visibility || "PUBLIC",
                componentType: isProjectLevel
                    ? "non-component"
                    : getTypeForDisplayType(platformExtState.selectedComponent?.spec?.type),
                componentPath: projectPath,
                generateCreds: true,
            });

            const securityType = createdConnection?.schemaName?.toLowerCase()?.includes("oauth") ? "oauth" : "apikey";

            let tempDevantConfigs = devantConfigs
            const matchingSchema = marketplaceItem?.connectionSchemas?.find((schema) => schema.id === createdConnection?.schemaReference);
            if (matchingSchema) {
                tempDevantConfigs = await createTempConfigsAsync({ item: marketplaceItem!, schema: matchingSchema });
            }

            const initializeResp = await platformRpcClient?.initializeDevantOASConnection({
                devantConfigs: tempDevantConfigs,
                marketplaceItem: marketplaceItem!,
                configurations: createdConnection.configurations,
                name: data.name,
                securityType,
                visibility: data.visibility,
            });

            await platformRpcClient.createConnectionConfig({
                marketplaceItem: marketplaceItem,
                name: createdConnection.name,
                visibility: data.visibility,
                componentDir: projectPath,
            });

            return initializeResp;
        },
        onSuccess: (data) => {
            platformRpcClient.refreshConnectionList();
            if (onSuccess) {
                onSuccess(data);
            }
        },
    });

    const createDevantConnection: SubmitHandler<CreateConnectionForm> = (data) => createConnection(data);

    const selectedVisibility = form.watch("visibility");

    const schemas = getPossibleSchemas(marketplaceItem, selectedVisibility, marketplaceItem?.connectionSchemas);

    useEffect(() => {
        if (!schemas.some((item) => item.id === form.getValues("schemaId")) && schemas.length > 0) {
            form.setValue("schemaId", schemas[0].id);
        }
    }, [schemas]);

    const isProjectLevel = form.watch("isProjectLevel");
    const selectedSchemaId = form.watch("schemaId");
    const selectedKeys = form.watch("envKeys");
    const selectedSchema = schemas?.find((schema) => schema.id === selectedSchemaId);

    useEffect(() => {
        form.setValue("envKeys", selectedSchema?.entries?.map((entry) => entry.name) || []);
    }, [selectedSchema]);

    const advancedConfigItems: ReactNode[] = [];
    if (!marketplaceItem.isThirdParty) {
        advancedConfigItems.push(
            <FormStyles.Row>
                <Dropdown
                    id="visibility"
                    label="Access Mode"
                    containerSx={{ width: "100%" }}
                    items={visibilities?.map((item) => ({
                        value: item,
                        content: capitalizeFirstLetter(item.toLowerCase()),
                    }))}
                    {...form.register("visibility", {
                        validate: (value) => {
                            if (!value) {
                                return "Required";
                            }
                        },
                    })}
                    required
                    disabled={visibilities?.length === 0}
                    errorMsg={form.formState.errors.visibility?.message}
                />
            </FormStyles.Row>,
            <FormStyles.Row>
                <Dropdown
                    id="schemaId"
                    label="Authentication Scheme"
                    containerSx={{ width: "100%" }}
                    items={schemas.map((item) => ({ value: item.id, content: item.name }))}
                    {...form.register("schemaId", {
                        validate: (value) => {
                            if (!value) {
                                return "Required";
                            }
                        },
                    })}
                    required
                    disabled={schemas?.length === 0}
                    errorMsg={form.formState.errors.schemaId?.message}
                />
            </FormStyles.Row>,
        );
    }

    if (platformExtState.selectedComponent) {
        advancedConfigItems.push(
            <FormStyles.Row>
                <CheckBox
                    label="Connection available to all integrations within your WSO2 Cloud project"
                    checked={isProjectLevel}
                    onChange={(checked: boolean) => {
                        form.setValue("isProjectLevel", checked);
                    }}
                />
            </FormStyles.Row>,
        );
    }

    return (
        <ConnectorInfoContainer>
            <ConnectorContentContainer hasFooterButton>
                <FormStyles.Container style={{ padding: 0 }}>
                    <FormStyles.Row>
                        <TextField
                            label="Name"
                            required
                            name="name"
                            placeholder="connection-name"
                            sx={{ width: "100%" }}
                            {...form.register("name", {
                                validate: (value) =>
                                    isValidDevantConnName(value, existingDevantConnNames, biConnectionNames, false),
                            })}
                            errorMsg={form.formState.errors.name?.message}
                        />
                    </FormStyles.Row>

                    {advancedConfigItems.length > 0 && (
                        <Row>
                            Advanced Configurations
                            <ButtonContainer>
                                {!showAdvancedSection && (
                                    <LinkButton
                                        onClick={() => setShowAdvancedSection(true)}
                                        sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4 }}
                                    >
                                        <Codicon name={"chevron-down"} iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
                                        Expand
                                    </LinkButton>
                                )}
                                {showAdvancedSection && (
                                    <LinkButton
                                        onClick={() => setShowAdvancedSection(false)}
                                        sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4 }}
                                    >
                                        <Codicon name={"chevron-up"} iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
                                        Collapsed
                                    </LinkButton>
                                )}
                            </ButtonContainer>
                        </Row>
                    )}

                    {showAdvancedSection && advancedConfigItems}

                    {marketplaceItem?.isThirdParty && selectedSchema && (
                        <FormStyles.Row>
                            <CheckBoxGroup>
                                <RowTitle>
                                    Environment Variables{" "}
                                    <Codicon
                                        name="info"
                                        tooltip="Following variables will need to be used when initializing the connector."
                                    />
                                </RowTitle>
                                <BoxGroup>
                                    {selectedSchema?.entries?.map((entry) => (
                                        <CheckBox
                                            key={entry.name}
                                            label={entry.name}
                                            checked={selectedKeys?.includes(entry.name)}
                                            onChange={(checked: boolean) => {
                                                form.setValue(
                                                    "envKeys",
                                                    checked
                                                        ? [...selectedKeys, entry.name]
                                                        : selectedKeys.filter((key) => key !== entry.name),
                                                );
                                            }}
                                        />
                                    ))}
                                </BoxGroup>
                            </CheckBoxGroup>
                        </FormStyles.Row>
                    )}
                </FormStyles.Container>
            </ConnectorContentContainer>
            <FooterContainer>
                <ActionButton
                    appearance="primary"
                    onClick={form.handleSubmit(createDevantConnection)}
                    disabled={isCreatingConnection}
                    buttonSx={{ width: "100%", height: "35px" }}
                >
                    {isCreatingConnection ? "Creating..." : "Create Connection"}
                </ActionButton>
            </FooterContainer>
        </ConnectorInfoContainer>
    );
};
