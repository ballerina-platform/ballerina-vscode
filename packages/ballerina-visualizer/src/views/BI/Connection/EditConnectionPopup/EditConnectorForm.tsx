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

import React, { useState, useEffect, useCallback, useMemo } from "react";
import styled from "@emotion/styled";
import { ThemeColors, Typography, Button, TextField, Stepper, Icon, Codicon, SearchBox, ProgressIndicator } from "@wso2/ui-toolkit";
import { IntrospectDatabaseResponse, TableInfo, PropertyModel } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { fetchConnectorCredentials, LSErrorDetails } from "../DatabaseConnectionPopup";
import { isDatabaseSystemProperty, isPasswordProperty, formatDatabaseTypeDisplay } from "../utils";
import {
    FormSection,
    FormField,
    TablesGrid,
    TableCard,
    TableCheckbox,
    TableName,
    ErrorContainer,
    ErrorHeader,
    ErrorTitle,
    ErrorDetailsSection,
    ErrorDetailsHeader,
    ErrorDetailsChevronIcon,
    ErrorDetailsContent,
    ErrorDetailsText,
} from "../styles";
import { ConnectionListItem, DatabaseRequestStatusEnum } from "@wso2/wso2-platform-core";
import { usePlatformExtContext } from "../../../../providers/platform-ext-ctx-provider";
import { dbCredentialsToFieldValues, buildDbPropertiesFromFieldValues, fieldValuesToDbConfig } from "../DevantConnections/utils";
import { LoadingRing } from "../../../../components/Loader";

const StepperContainer = styled.div`
    padding: 24px 32px;
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

const ContentContainer = styled.div<{ hasFooterButton?: boolean }>`
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: auto;
    padding: 24px 32px;
    padding-bottom: ${(props: { hasFooterButton?: boolean }) => (props.hasFooterButton ? "0" : "24px")};
    min-height: 0;
`;

const StepContent = styled.div<{ fillHeight?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 24px;
    ${(props: { fillHeight?: boolean }) =>
        props.fillHeight &&
        `
        flex: 1;
        min-height: 0;
        height: 100%;
    `}
`;

const FooterContainer = styled.div`
    position: sticky;
    bottom: 0;
    padding: 20px 32px;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10;
`;

const SectionTitle = styled(Typography)`
    font-size: 16px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
    margin: 0;
`;

const SectionSubtitle = styled(Typography)`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin: 0;
`;

const SearchRow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const SelectAllButton = styled(Button)`
    align-self: flex-end;
    white-space: nowrap;
    flex-shrink: 0;
    min-width: fit-content;
`;

const WarningContainer = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_DIM};
    border: 1px solid #d97706;
`;

const DeselectedTablesRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
`;

const TableChip = styled.span`
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    font-family: monospace;
    background-color: rgba(217, 119, 6, 0.15);
    color: #d97706;
    border: 1px solid rgba(217, 119, 6, 0.4);
`;

const ActionButton = styled(Button)`
    width: 100% !important;
    min-width: 0 !important;
    max-width: none !important;
    display: flex !important;
    justify-content: center;
    align-items: center;
    align-self: stretch;
    box-sizing: border-box;

    & > div {
        width: 100% !important;
        max-width: 100% !important;
    }
`;

interface ErrorDisplayProps {
    connectionError: string;
    errorMessage: string | null;
    stepIndex: number;
}

function ErrorDisplay({ connectionError, errorMessage, stepIndex }: ErrorDisplayProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <ErrorContainer>
            <ErrorHeader>
                <Icon name="bi-error" sx={{ color: ThemeColors.ERROR, fontSize: "20px", width: "20px", height: "20px" }} />
                <ErrorTitle variant="h4">
                    {stepIndex === 0 ? "Introspection Failed" : "Connector Update Failed"}
                </ErrorTitle>
            </ErrorHeader>
            <Typography variant="body2">{connectionError}</Typography>
            {errorMessage && (
                <ErrorDetailsSection>
                    <ErrorDetailsHeader onClick={() => setIsExpanded((prev) => !prev)}>
                        <ErrorDetailsChevronIcon name={isExpanded ? "chevron-down" : "chevron-right"} />
                        <Typography variant="body2" sx={{ color: ThemeColors.ON_SURFACE_VARIANT, fontSize: "12px", margin: 0 }}>
                            Error Details
                        </Typography>
                    </ErrorDetailsHeader>
                    <ErrorDetailsContent expanded={isExpanded}>
                        <ErrorDetailsText>{errorMessage}</ErrorDetailsText>
                    </ErrorDetailsContent>
                </ErrorDetailsSection>
            )}
        </ErrorContainer>
    );
}

export interface EditConnectorFormProps {
    properties: { [key: string]: PropertyModel };
    metadata?: { label?: string; description?: string };
    connectionName?: string;
    targetModule?: string;
    modelFilePath?: string;
    handleClosePopup: () => void;
}

export function EditConnectorForm(props: EditConnectorFormProps) {
    const { properties, metadata, connectionName, targetModule, modelFilePath, handleClosePopup } = props;
    const { rpcClient } = useRpcContext();

    const [currentStep, setCurrentStep] = useState(0);
    const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
    const [introspectDatabaseResponse, setIntrospectDatabaseResponse] = useState<IntrospectDatabaseResponse | null>(null);
    const [isIntrospecting, setIsIntrospecting] = useState(false);
    const [isDevantDb, setIsDevantDb] = useState(false);
    const [isFetchingDevantCreds, setIsFetchingDevantCreds] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [lsErrorDetails, setLsErrorDetails] = useState<LSErrorDetails>({
        errorMessage: null,
    });
    const [tableSearch, setTableSearch] = useState("");
    const { platformExtState, platformRpcClient } = usePlatformExtContext();

    const steps = ["Introspect Database", "Select Tables"];

    const getDevantDbCredentials = async (devantConnection: ConnectionListItem) => {
        try {
            setIsFetchingDevantCreds(true)
            const visualizerLocation = await rpcClient.getVisualizerLocation();
            const connectorCredentialsResp = await fetchConnectorCredentials({
                connectorWizardRpcClient: rpcClient.getConnectorWizardRpcClient(),
                projectPath: visualizerLocation?.projectPath,
            });
            const orgId = platformExtState?.session?.org.handle || "";
            let credsToUse: Record<string, string> = {}
            if (devantConnection?.resourceType === "DATABASE") {
                 const marketplaceItem = await platformRpcClient.getMarketplaceDatabaseItem({
                    orgId,
                    resourceId: devantConnection.serviceId,
                })

                if(marketplaceItem?.resourceDetails?.status !== DatabaseRequestStatusEnum.Active) {
                    throw new Error("Selected WSO2 Cloud database is not active. Please select an active database to proceed.");
                }

                const serverId = marketplaceItem?.resourceDetails?.databaseServerId;
                const [server, adminCredential] = await Promise.all([
                    platformRpcClient.getDatabaseServer({ orgId, databaseServerId: serverId }),
                    platformRpcClient.getDatabaseAdminCredential({ orgId, databaseServerId: serverId }),
                ]);
                const dbTypeMap: Record<string, string> = {
                    postgres: "PostgreSQL",
                    mysql: "MySQL",
                };
                credsToUse = dbCredentialsToFieldValues(connectorCredentialsResp.connectorCredentials, {
                    databaseType: dbTypeMap[marketplaceItem.resourceDetails?.databaseType] ?? "PostgreSQL",
                    host: server.connection_params.host,
                    port: Number(server.connection_params.port),
                    databaseName: marketplaceItem?.name || server.connection_params.database,
                    username: server.connection_params.user,
                    password: adminCredential.password,
                });
            } else {
                let unresolvedSecrets: string[] = [];
                const connectionItem = await platformRpcClient.getConnection({ connectionGroupId: devantConnection.groupUuid, orgId });
                const matchingConfig = connectionItem.configurations[platformExtState?.selectedEnv?.id]
                if(matchingConfig){
                    const kv: Record<string, string> = {};
                    const secretValuesRefs: {key: string; valueRef: string}[] = []
                    for(const key of Object.keys(matchingConfig.entries)){
                        const entry = matchingConfig.entries[key];
                            if(entry.value){
                                kv[key] = entry.value;
                            }else if(entry.isSensitive && !entry.isFile){
                                secretValuesRefs.push({ key, valueRef: entry.valueRef })
                            }
                    }
                    if(secretValuesRefs.length > 0){
                        const secretsResp = await platformRpcClient.resolveConnectionSecrets({
                            orgId,
                            componentId: platformExtState?.selectedIntegration?.integration.id || "",
                            projectId: platformExtState?.selectedContext?.projectName || "",
                            groupId: devantConnection.groupUuid,
                            envTemplateId: platformExtState?.selectedEnv?.id || "",
                            secrets: secretValuesRefs
                        })
                        for(const secret of secretsResp.secrets){
                            kv[secret.key] = secret.value;
                        }
                        unresolvedSecrets = secretValuesRefs.map((ref) => ref.key).filter((key) => !kv[key]);
                    }

                    let databaseType = "mysql"
                    Object.entries(properties).forEach(([propKey, prop]) => {
                        if(isDatabaseSystemProperty(prop)){
                            databaseType = prop.value;
                        }
                    })

                    credsToUse = dbCredentialsToFieldValues(connectorCredentialsResp.connectorCredentials, {
                        ...fieldValuesToDbConfig(kv),
                        databaseType
                    });
                }

                const dbProperties = buildDbPropertiesFromFieldValues(connectorCredentialsResp.connectorCredentials, credsToUse);
                const newFieldValues: Record<string, string> = {};
                Object.values(dbProperties || {}).forEach((prop) => {
                    const key = prop.metadata?.label || "";
                    newFieldValues[key] = (prop.value as string) ?? "";
                });
                setFieldValues(newFieldValues);
                if (unresolvedSecrets.length > 0) {
                    // WSO2 Cloud does not hand secret values back; connecting with them blank would only fail.
                    // The credentials step and its connect action are shown instead, prefilled with the rest.
                    setIsDevantDb(false);
                    setConnectionError(`WSO2 Cloud does not return secret values. Enter ${unresolvedSecrets.join(", ")} here to connect.`);
                    return;
                }
                handleConnectAndIntrospect(dbProperties);
            }
        } catch (error) {
            console.error(">>> Error fetching WSO2 Cloud database credentials", error);
            setConnectionError("Unable to fetch database credentials from WSO2 Cloud connection. Please try again.");
            setLsErrorDetails({ errorMessage: error instanceof Error ? error.message : String(error) });
        } finally {
            setIsFetchingDevantCreds(false)
        }
    }

    useEffect(() => {
        const matchingDevantConnection = platformExtState?.devantConns?.list?.find(item=>item.name?.replaceAll("-", "_").replaceAll(" ", "_") === connectionName);
        if (platformExtState?.isLoggedIn && platformExtState?.selectedContext?.project && matchingDevantConnection){
            setIsDevantDb(true);
            getDevantDbCredentials(matchingDevantConnection);
        }
    },[connectionName])

    const updateFieldValue = useCallback((propKey: string, value: string) => {
        setFieldValues((prev) => ({ ...prev, [propKey]: value }));
        setConnectionError(null);
        setLsErrorDetails({ errorMessage: null });
    }, []);

    useEffect(() => {
        const initial: Record<string, string> = {};
        Object.values(properties || {}).forEach((prop) => {
            const key = prop.metadata?.label || "";
            if (key && !isPasswordProperty(prop)) {
                initial[key] = (prop.value as string) ?? "";
            } else if (key && isPasswordProperty(prop)) {
                initial[key] = "";
            }
        });
        setFieldValues(initial);
    }, [properties]);

    const buildPropertiesFromFieldValues = useCallback((): { [key: string]: PropertyModel } => {
        const result: { [key: string]: PropertyModel } = {};
        for (const [key, prop] of Object.entries(properties || {})) {
            const label = prop.metadata?.label || "";
            const value = label in fieldValues ? fieldValues[label] : (prop.value as string) ?? "";
            result[key] = { ...prop, value };
        }
        return result;
    }, [properties, fieldValues]);

    const handleConnectAndIntrospect = async (propertiesMap = buildPropertiesFromFieldValues()) => {
        setIsIntrospecting(true);
        setConnectionError(null);
        setLsErrorDetails({ errorMessage: null });
        try {
            const visualizerLocation = await rpcClient.getVisualizerLocation();
            const projectPath = visualizerLocation.projectPath;

            const response = await rpcClient.getConnectorWizardRpcClient().introspectDatabase({
                projectPath,
                metadata: {
                    label: metadata?.label ?? connectionName,
                    description: metadata?.description,
                },
                properties: propertiesMap,
                targetModule,
                modelFilePath,
            });

            if (!response) {
                setConnectionError("Unable to connect to the database. Please try again.");
                setLsErrorDetails({ errorMessage: "No response received from database introspection." });
                return;
            }

            if (response?.errorMsg) {
                const errorMsg = response.errorMsg.toLowerCase();
                if (errorMsg.includes("no tables found")) {
                    setConnectionError("No tables were found in the database.");
                } else {
                    setConnectionError("Unable to connect to the database. Please verify your credentials.");
                }
                setLsErrorDetails({ errorMessage: response.errorMsg });
                const pwdLabel = Object.values(properties || {}).find((p) => isPasswordProperty(p))?.metadata?.label;
                if (pwdLabel) setFieldValues((prev) => ({ ...prev, [pwdLabel]: "" }));
                return;
            }

            if (response.tables && response.tables.length > 0) {
                const normalizedTables: TableInfo[] = response.tables.map((tableInfo) =>
                    typeof tableInfo === "string"
                        ? { table: tableInfo, selected: false, existing: false }
                        : tableInfo
                );
                setIntrospectDatabaseResponse({ ...response, tables: normalizedTables });
                setConnectionError(null);
                setLsErrorDetails({ errorMessage: null });
                setCurrentStep(1);
            } else {
                setConnectionError("No tables found in the database.");
                setLsErrorDetails({ errorMessage: null });
                const pwdLabel = Object.values(properties || {}).find((p) => isPasswordProperty(p))?.metadata?.label;
                if (pwdLabel) setFieldValues((prev) => ({ ...prev, [pwdLabel]: "" }));
            }
        } catch (error) {
            console.error(">>> Error introspecting database", error);
            setConnectionError("Unable to connect to the database. Please verify your credentials.");
            setLsErrorDetails({ errorMessage: error instanceof Error ? error.message : String(error) });
            const pwdLabel = Object.values(properties || {}).find((p) => isPasswordProperty(p))?.metadata?.label;
            if (pwdLabel) setFieldValues((prev) => ({ ...prev, [pwdLabel]: "" }));
        } finally {
            setIsIntrospecting(false);
        }
    };

    const handleTableToggleByName = (name: string) => {
        setIntrospectDatabaseResponse((prev) =>
            prev?.tables
                ? { ...prev, tables: prev.tables.map((t) => (t.table === name ? { ...t, selected: !t.selected } : t)) }
                : prev
        );
    };

    const handleSelectAll = () => {
        setIntrospectDatabaseResponse((prev) => {
            if (!prev?.tables?.length) return prev;
            const allSelected = prev.tables.every((t) => t.selected);
            return { ...prev, tables: prev.tables.map((t) => ({ ...t, selected: !allSelected })) };
        });
    };

    const handleUpdateConnector = async () => {
        if (!connectionName || !introspectDatabaseResponse?.tables?.length) return;
        setIsSaving(true);
        setConnectionError(null);
        setLsErrorDetails({ errorMessage: null });
        try {
            const visualizerLocation = await rpcClient.getVisualizerLocation();
            const projectPath = visualizerLocation.projectPath;
            const propertiesMap = buildPropertiesFromFieldValues();

            const response = await rpcClient.getConnectorWizardRpcClient().persistClientGenerate({
                projectPath,
                targetModule: introspectDatabaseResponse.targetModule ?? targetModule,
                modelFilePath: introspectDatabaseResponse.modelFilePath ?? modelFilePath,
                connection: connectionName,
                properties: propertiesMap,
                tables: introspectDatabaseResponse.tables,
            });

            if (!response) {
                setConnectionError("Unable to update the connector. Please try again.");
                setLsErrorDetails({ errorMessage: "No response received from connector update." });
                return;
            }

            if (response?.errorMsg) {
                setConnectionError("Unable to update the connector. Please check the error details below.");
                setLsErrorDetails({ errorMessage: response.errorMsg });
                return;
            }

            handleClosePopup();
        } catch (error) {
            console.error(">>> Error updating connector", error);
            setConnectionError("Unable to update the connector. Please try again.");
            setLsErrorDetails({ errorMessage: error instanceof Error ? error.message : String(error) });
        } finally {
            setIsSaving(false);
        }
    };

    const tables = introspectDatabaseResponse?.tables ?? [];
    const selectedTablesCount = tables.filter((t) => t.selected).length;
    const totalTablesCount = tables.length;
    const filteredTables = useMemo(
        () =>
            tables.filter((t) =>
                t.table.toLowerCase().includes(tableSearch.trim().toLowerCase())
            ),
        [tables, tableSearch]
    );

    const deselectedExistingTables = useMemo(
        () => tables.filter((t) => t.existing && !t.selected),
        [tables]
    );

    const renderStepContent = (defaultStep = currentStep) => {
        switch (defaultStep) {
            case 0:
                return (
                    <StepContent fillHeight={true}>
                        <div>
                            <SectionTitle variant="h3">Database Credentials</SectionTitle>
                            <SectionSubtitle variant="body2">
                                Enter credentials to connect and introspect the database
                            </SectionSubtitle>
                        </div>
                        {connectionError && <ErrorDisplay connectionError={connectionError} errorMessage={lsErrorDetails.errorMessage} stepIndex={currentStep} />}
                        <FormSection>
                            {Object.values(properties || {}).filter((p) => !p.hidden).map((prop) => {
                                if (isDatabaseSystemProperty(prop)) {
                                    return (
                                        <FormField key={prop.metadata?.label || "db-system"}>
                                            <TextField
                                                id="database-system"
                                                label={prop.metadata?.label}
                                                value={formatDatabaseTypeDisplay(prop.value as string)}
                                                readonly
                                            />
                                        </FormField>
                                    );
                                }
                                if (prop.editable === false) return null;

                                const label = prop.metadata?.label || "";
                                const placeholder = prop.placeholder || prop.metadata?.description || "";
                                const isPassword = isPasswordProperty(prop);
                                const value =
                                    fieldValues[label] ?? (isPassword ? "" : (prop.value as string) ?? "");

                                return (
                                    <FormField key={label}>
                                        <TextField
                                            id={label.replace(/\s+/g, "-").toLowerCase()}
                                            label={label}
                                            placeholder={placeholder}
                                            type={isPassword ? "password" : "text"}
                                            value={value}
                                            onTextChange={(v) => updateFieldValue(label, v)}
                                            {...(isIntrospecting ? { readonly: true } : {})}
                                        />
                                    </FormField>
                                );
                            })}
                        </FormSection>
                    </StepContent>
                );

            case 1:
                return (
                    <StepContent fillHeight={true} style={{ gap: "16px" }}>
                        {connectionError && <ErrorDisplay connectionError={connectionError} errorMessage={lsErrorDetails.errorMessage} stepIndex={currentStep} />}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div>
                                <SectionTitle variant="h3">Select Tables</SectionTitle>
                                <SectionSubtitle variant="body2">
                                    Choose which tables to include in this connector
                                </SectionSubtitle>
                            </div>
                            <Typography variant="body2" sx={{ color: ThemeColors.ON_SURFACE_VARIANT }}>
                                {selectedTablesCount} of {totalTablesCount} selected
                            </Typography>
                        </div>
                        <SearchRow>
                            <SearchBox
                                value={tableSearch}
                                placeholder="Search tables..."
                                onChange={setTableSearch}
                                sx={{ flex: 1 }}
                            />
                            <SelectAllButton appearance="secondary" onClick={handleSelectAll}>
                                {selectedTablesCount === totalTablesCount && totalTablesCount > 0 ? "Deselect All" : "Select All"}
                            </SelectAllButton>
                        </SearchRow>
                        {deselectedExistingTables.length > 0 && (
                            <WarningContainer>
                                <Codicon
                                    name="warning"
                                    sx={{ color: "#d97706", fontSize: "20px", width: "20px", height: "20px", flexShrink: 0 }}
                                />
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1, minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ color: ThemeColors.ON_SURFACE, margin: 0, lineHeight: 1.5 }}>
                                        You have deselected {deselectedExistingTables.length} table{deselectedExistingTables.length === 1 ? "" : "s"} that
                                        {deselectedExistingTables.length === 1 ? " is" : " are"} already in the connector. Removing these may break existing code that references them.
                                    </Typography>
                                    <DeselectedTablesRow>
                                        <Typography variant="caption" sx={{ color: ThemeColors.ON_SURFACE_VARIANT, margin: 0, flexShrink: 0 }}>
                                            Deselected tables:
                                        </Typography>
                                        {deselectedExistingTables.map((t) => (
                                            <TableChip key={t.table}>{t.table}</TableChip>
                                        ))}
                                    </DeselectedTablesRow>
                                </div>
                            </WarningContainer>
                        )}
                        <TablesGrid>
                            {isIntrospecting && <ProgressIndicator />}
                            {filteredTables.map((t) => (
                                <TableCard
                                    key={t.table}
                                    selected={t.selected}
                                    onClick={() => handleTableToggleByName(t.table)}
                                >
                                    <TableCheckbox
                                        type="checkbox"
                                        checked={t.selected}
                                        onChange={(e) => {
                                            e.stopPropagation();
                                            handleTableToggleByName(t.table);
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                    <TableName variant="body1">{t.table}</TableName>
                                </TableCard>
                            ))}
                        </TablesGrid>
                    </StepContent>
                );

            default:
                return null;
        }
    };

    if (isDevantDb){
        return (
            <>
                <ContentContainer hasFooterButton={true}>
                    {isFetchingDevantCreds ? <LoadingRing message="Loading WSO2 Cloud Database Credentials..." />: renderStepContent(1)}
                </ContentContainer>
                <FooterContainer>
                    <ActionButton
                        appearance="primary"
                        onClick={handleUpdateConnector}
                        disabled={selectedTablesCount === 0 || isSaving}
                        buttonSx={{ width: "100%", height: "35px" }}
                        tooltip="Update connector with selected tables"
                    >
                        {isSaving ? "Updating..." : "Update Connector"}
                    </ActionButton>
                </FooterContainer>
            </>
        )
    }

    return (
        <>
            <StepperContainer>
                <Stepper steps={steps} currentStep={currentStep} alignment="center" />
            </StepperContainer>
            <ContentContainer hasFooterButton={true}>{renderStepContent()}</ContentContainer>
            {currentStep === 0 && (
                <FooterContainer>
                    <ActionButton
                        appearance="primary"
                        onClick={() => handleConnectAndIntrospect()}
                        disabled={isIntrospecting}
                        buttonSx={{ width: "100%", height: "35px" }}
                        tooltip="Connect to database and discover available tables"
                    >
                        {isIntrospecting ? "Connecting..." : "Connect & Introspect Database"}
                    </ActionButton>
                </FooterContainer>
            )}
            {currentStep === 1 && (
                <FooterContainer>
                    <ActionButton
                        appearance="primary"
                        onClick={handleUpdateConnector}
                        disabled={selectedTablesCount === 0 || isSaving}
                        buttonSx={{ width: "100%", height: "35px" }}
                        tooltip="Update connector with selected tables"
                    >
                        {isSaving ? "Updating..." : "Update Connector"}
                    </ActionButton>
                </FooterContainer>
            )}
        </>
    );
}

export default EditConnectorForm;
