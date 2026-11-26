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

import React, { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { debounce } from "lodash";
import { Button, Codicon, ThemeColors, Typography, TextField, Dropdown, OptionProps, Icon, SearchBox, ProgressRing, ProgressIndicator } from "@wso2/ui-toolkit";
import { Stepper } from "@wso2/ui-toolkit";
import {
    ConnectorWizardAPI,
    DIRECTORY_MAP,
    IntrospectDatabaseResponse,
    TableInfo,
    LinePosition,
    ParentPopupData,
    IntrospectCredentialsResponse,
} from "@wso2/ballerina-core";
import { PropertyModel } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import {
    PopupOverlay,
    PopupContainer,
    PopupHeader,
    BackButton,
    HeaderTitleContainer,
    PopupTitle,
    PopupSubtitle,
    CloseButton,
    FormSection,
    FormField,
    TablesGrid as BaseTablesGrid,
    TableCard,
    TableCheckbox,
    TableName,
    ErrorContainer as BaseErrorContainer,
    ErrorHeader,
    ErrorTitle,
    ErrorDetailsSection,
    ErrorDetailsHeader,
    ErrorDetailsChevronIcon,
    ErrorDetailsContent,
    ErrorDetailsText,
} from "../styles";
import { URI, Utils } from "vscode-uri";
import { CONNECTIONS_FILE } from "../../../../constants";
import { isDatabaseSystemProperty, isPasswordProperty, formatDatabaseTypeDisplay } from "../utils";
import { removeDuplicateDiagnostics } from "../../../../utils/bi";

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
    padding-bottom: ${(props: { hasFooterButton?: boolean }) => props.hasFooterButton ? "0" : "24px"};
    min-height: 0;
`;

const StepContent = styled.div<{ fillHeight?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: 24px;
    ${(props: { fillHeight?: boolean }) => props.fillHeight && `
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

const ReadonlyValue = styled.div`
    padding: 5px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 2px;
    background: ${ThemeColors.SURFACE_CONTAINER};
    color: ${ThemeColors.ON_SURFACE};
    font-size: 14px;
    line-height: 20px;
    user-select: text;
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

const TablesGrid = styled(BaseTablesGrid)`
    margin-top: 16px;
    position: relative;
`;

const SelectAllButton = styled(Button)`
    align-self: flex-end;
    white-space: nowrap;
    flex-shrink: 0;
    min-width: fit-content;
`;

const SelectionInfo = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const SearchRow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
`;

const ConfigurablesPanel = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_DIM};
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    margin-top: 16px;
`;

const ConfigurablesDescription = styled(Typography)`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin: 0;
    line-height: 1.5;
`;

const ErrorContainer = styled(BaseErrorContainer)`
    margin-top: 16px;
`;

const SeparatorLine = styled.div`
    width: 100%;
    height: 1px;
    background-color: ${ThemeColors.OUTLINE_VARIANT};
    opacity: 0.5;
`;


const BrowseMoreButton = styled(Button)`
    margin-top: 0;
    width: 100% !important;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: var(--vscode-button-secondaryBackground, #3c3c3c) !important;
    color: var(--vscode-button-secondaryForeground, #ffffff) !important;
    border-radius: 4px;

    &:hover {
        background-color: var(--vscode-button-secondaryHoverBackground, #4a4a4a) !important;
    }

    & > span {
        color: var(--vscode-button-secondaryForeground, #ffffff) !important;
    }
`;

interface DatabaseConnectionPopupProps {
    fileName: string;
    target?: LinePosition;
    onClose?: (data?: ParentPopupData) => void;
    onBack?: () => void;
    onBrowseConnectors?: () => void;
}

export interface LSErrorDetails {
    errorMessage: string | null;
}

export interface ConnectionErrorDisplayProps {
    connectionError: string;
    lsErrorDetails: LSErrorDetails;
    onBrowseMoreConnectors?: () => void;
}

/**
 * Reusable connection error display with expandable details and optional "Browse Pre-built Connectors" CTA.
 * Use when connection/introspection fails and you want to show a consistent error UI.
 */
export function ConnectionErrorDisplay(props: ConnectionErrorDisplayProps) {
    const { connectionError, lsErrorDetails, onBrowseMoreConnectors } = props;
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <ErrorContainer>
            <ErrorHeader>
                <Icon name="bi-error" sx={{ color: ThemeColors.ERROR, fontSize: "20px", width: "20px", height: "20px" }} />
                <ErrorTitle variant="h4">Connection Failed</ErrorTitle>
            </ErrorHeader>
            <Typography variant="body2">{connectionError}</Typography>
            {lsErrorDetails.errorMessage && (
                <ErrorDetailsSection>
                    <ErrorDetailsHeader onClick={() => setIsExpanded((prev) => !prev)}>
                        <ErrorDetailsChevronIcon name={isExpanded ? "chevron-down" : "chevron-right"} />
                        <Typography variant="body2" sx={{ color: ThemeColors.ON_SURFACE_VARIANT, fontSize: "12px", margin: 0 }}>
                            Error Details
                        </Typography>
                    </ErrorDetailsHeader>
                    <ErrorDetailsContent expanded={isExpanded}>
                        <ErrorDetailsText>{lsErrorDetails.errorMessage}</ErrorDetailsText>
                    </ErrorDetailsContent>
                </ErrorDetailsSection>
            )}
            {onBrowseMoreConnectors && (
                <>
                    <SeparatorLine />
                    <Typography variant="body2">Need an alternative solution?</Typography>
                    <Typography variant="body2" sx={{ fontSize: "12px", color: ThemeColors.ON_SURFACE_VARIANT }}>
                        You can use a pre-built connector from the connector catalog instead.
                    </Typography>
                    <BrowseMoreButton appearance="secondary" onClick={onBrowseMoreConnectors} buttonSx={{ width: "100%" }}>
                        Browse Pre-built Connectors
                    </BrowseMoreButton>
                </>
            )}
        </ErrorContainer>
    );
}

export interface FetchConnectorCredentialsParams {
    connectorWizardRpcClient: ConnectorWizardAPI;
    projectPath: string;
}

export interface FetchConnectorCredentialsResult {
    success: boolean;
    connectorCredentials?: NonNullable<IntrospectCredentialsResponse["data"]>;
    initialFieldValues?: Record<string, string>;
    error?: string;
}

/**
 * Fetches connector credentials template from the connector wizard RPC. Can be used from any component
 * that needs to load database connection form fields.
 */
export async function fetchConnectorCredentials(
    params: FetchConnectorCredentialsParams
): Promise<FetchConnectorCredentialsResult> {
    const { connectorWizardRpcClient, projectPath } = params;

    try {
        const response = await connectorWizardRpcClient.introspectCredentials({
            projectPath,
        });

        if (!response?.data?.properties || Object.keys(response.data.properties).length === 0) {
            return { success: false };
        }

        const initial: Record<string, string> = {};
        let dbSystemLabel: string | undefined;

        Object.values(response.data.properties).forEach((prop) => {
            const label = prop.metadata?.label || "";
            if (label) {
                if (isPasswordProperty(prop)) {
                    initial[label] = "";
                } else if (isDatabaseSystemProperty(prop)) {
                    dbSystemLabel = label;
                    initial[label] = (prop.value as string)?.trim() || "mysql";
                } else if (label.toLowerCase() === "port") {
                    initial[label] = (prop.value as string) ?? "3306";
                } else {
                    initial[label] = (prop.value as string) ?? "";
                }
            }
        });

        if (dbSystemLabel && !initial[dbSystemLabel]?.trim()) {
            initial[dbSystemLabel] = "mysql";
        }

        return {
            success: true,
            connectorCredentials: response.data,
            initialFieldValues: initial,
        };
    } catch (err) {
        console.error(">>> Error fetching connector credentials template", err);
        return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

export interface IntrospectDatabaseParams {
    connectorWizardRpcClient: ConnectorWizardAPI;
    projectPath: string;
    connectorCredentials: NonNullable<IntrospectCredentialsResponse["data"]>;
    properties: { [key: string]: PropertyModel };
}

export interface IntrospectDatabaseResult {
    success: boolean;
    introspectResponse?: IntrospectDatabaseResponse;
    connectionError?: string;
    lsErrorDetails?: LSErrorDetails;
    clearPasswordLabel?: string;
}

/**
 * Introspects a database using the connector wizard RPC. Can be used from any component
 * that has access to the RPC client and connector credentials.
 */
export async function introspectDatabase(params: IntrospectDatabaseParams): Promise<IntrospectDatabaseResult> {
    const { connectorWizardRpcClient, projectPath, connectorCredentials, properties } = params;

    try {
        const response = await connectorWizardRpcClient.introspectDatabase({
            projectPath,
            metadata: {
                label: connectorCredentials.metadata?.label,
                description: connectorCredentials.metadata?.description,
            },
            properties,
        });

        if (response?.errorMsg) {
            console.error(">>> Error introspecting database", response.errorMsg);
            const errorMsg = response.errorMsg.toLowerCase();
            const connectionError = errorMsg.includes("no tables found")
                ? "No tables were found in the database. Currently, connection creation requires at least one table."
                : "Unable to connect to the database. Please verify your credentials and ensure the database server is accessible.";
            const pwdLabel = Object.values(connectorCredentials.properties).find((p) => isPasswordProperty(p))?.metadata?.label;
            return {
                success: false,
                connectionError,
                lsErrorDetails: { errorMessage: response.errorMsg },
                clearPasswordLabel: pwdLabel ?? undefined,
            };
        }

        if (response.tables && response.tables.length > 0) {
            const normalizedTables: TableInfo[] = response.tables.map((tableInfo) =>
                typeof tableInfo === "string"
                    ? { table: tableInfo, selected: false, existing: false }
                    : tableInfo
            );
            return {
                success: true,
                introspectResponse: { ...response, tables: normalizedTables },
            };
        }

        console.warn(">>> No tables found in database");
        const pwdLabel = Object.values(connectorCredentials.properties).find((p) => isPasswordProperty(p))?.metadata?.label;
        return {
            success: false,
            connectionError:
                "No tables found in the database. We cannot continue with connection creation. Please use a pre-built connector.",
            lsErrorDetails: { errorMessage: null },
            clearPasswordLabel: pwdLabel ?? undefined,
        };
    } catch (error) {
        console.error(">>> Error introspecting database", error);
        const pwdLabel = Object.values(connectorCredentials.properties).find((p) => isPasswordProperty(p))?.metadata?.label;
        return {
            success: false,
            connectionError:
                "Unable to connect to the database. Please verify your credentials and ensure the database server is accessible.",
            lsErrorDetails: { errorMessage: null },
            clearPasswordLabel: pwdLabel ?? undefined,
        };
    }
}

export interface PersistConnectionParams {
    connectorWizardRpcClient: ConnectorWizardAPI;
    projectPath: string;
    connectionName: string;
    properties: { [key: string]: PropertyModel };
    tables: TableInfo[];
}

export interface PersistConnectionResult {
    success: boolean;
    connectionError?: string;
    lsErrorDetails?: LSErrorDetails;
    recentIdentifier?: string;
}

/**
 * Persists a database connection using the connector wizard RPC. Can be used from any component
 * that has access to the RPC client and connection details.
 */
export async function persistConnection(params: PersistConnectionParams): Promise<PersistConnectionResult> {
    const { connectorWizardRpcClient, projectPath, connectionName, properties, tables } = params;

    try {
        const response = await connectorWizardRpcClient.persistClientGenerate({
            projectPath,
            connection: connectionName || undefined,
            properties,
            tables,
        });

        if (response.errorMsg) {
            console.error(">>> Error creating connection", response.errorMsg);
            return {
                success: false,
                connectionError: "Unable to create the connection. Please check the error details below.",
                lsErrorDetails: { errorMessage: response.errorMsg },
            };
        }

        if (response.source?.textEditsMap) {
            console.log(">>> Connection created successfully with text edits", Object.keys(response.source.textEditsMap));
        }
        if (response.source?.isModuleExists !== undefined) {
            console.log(">>> Module exists:", response.source.isModuleExists);
        }

        return {
            success: true,
            recentIdentifier: connectionName,
        };
    } catch (error) {
        console.error(">>> Error creating connection", error);
        return {
            success: false,
            connectionError:
                "An unexpected error occurred while creating the connection. Please check the error details below.",
            lsErrorDetails: {
                errorMessage: error instanceof Error ? error.message : String(error),
            },
        };
    }
}

export const DATABASE_TYPES: OptionProps[] = [
    { id: "postgresql", value: "PostgreSQL", content: "PostgreSQL" },
    { id: "mysql", value: "MySQL", content: "MySQL" },
    { id: "mssql", value: "MSSQL", content: "MSSQL" },
];

export const DB_SYSTEM_TO_VALUE: Record<string, string> = {
    PostgreSQL: "postgresql",
    MySQL: "mysql",
    MSSQL: "mssql",
};

export const DEFAULT_PORTS: Record<string, number> = {
    postgresql: 5432,
    mysql: 3306,
    mssql: 1433,
};

export interface IntrospectDatabaseStepFormProps {
    connectorCredentials: IntrospectCredentialsResponse["data"] | null;
    fieldValues: Record<string, string>;
    onFieldValueChange: (propKey: string, value: string) => void;
    onDbTypeChange: (label: string, value: string) => void;
    isIntrospecting: boolean;
}

export function IntrospectDatabaseStepForm(props: IntrospectDatabaseStepFormProps) {
    const { connectorCredentials, fieldValues, onFieldValueChange, onDbTypeChange, isIntrospecting } = props;
    const properties = connectorCredentials?.properties || {};
    const propertyList = Object.values(properties).filter((p) => !p.hidden);

    return (
        <FormSection>
            {propertyList.map((prop) => {
                if (isDatabaseSystemProperty(prop)) {
                    const label = prop.metadata?.label;
                    const dbVal = fieldValues[label] ?? (prop.value as string) ?? "mysql";
                    const displayValue = formatDatabaseTypeDisplay(dbVal);
                    return (
                        <FormField key={label}>
                            <Dropdown
                                id="database-system"
                                label={label}
                                items={DATABASE_TYPES}
                                value={displayValue}
                                onValueChange={(value) => onDbTypeChange(label, value)}
                                disabled={isIntrospecting}
                            />
                        </FormField>
                    );
                }
                if (prop.editable === false) return null;

                const label = prop.metadata?.label;
                const placeholder = prop.placeholder || prop.metadata?.description || "";
                const isPassword = isPasswordProperty(prop);
                const value = fieldValues[label] ?? (isPassword ? "" : (prop.value as string) ?? "");

                return (
                    <FormField key={label}>
                        <TextField
                            id={label.replace(/\s+/g, "-").toLowerCase()}
                            label={label}
                            placeholder={placeholder}
                            type={isPassword ? "password" : "text"}
                            value={value}
                            onTextChange={(v) => onFieldValueChange(label, v)}
                            {...(isIntrospecting ? { readonly: true } : {})}
                        />
                    </FormField>
                );
            })}
        </FormSection>
    )
}

export interface IntrospectDatabaseStepProps {
    isLoadingCredentials: boolean;
    connectorCredentials: IntrospectCredentialsResponse["data"] | null;
    fieldValues: Record<string, string>;
    connectionError: string | null;
    lsErrorDetails: LSErrorDetails;
    onBrowseMoreConnectors?: () => void;
    onIntrospect: () => void;
    isIntrospecting: boolean;
    showTitle?: boolean;
    form?: ReactNode;
}

export function IntrospectDatabaseStep(props: IntrospectDatabaseStepProps) {
    const {
        isLoadingCredentials,
        connectorCredentials,
        fieldValues,
        connectionError,
        lsErrorDetails,
        onBrowseMoreConnectors,
        onIntrospect,
        isIntrospecting,
        showTitle = true,
        form,
    } = props;

    if (isLoadingCredentials) {
        return (
            <>
                <ContentContainer hasFooterButton={true}>
                    <StepContent fillHeight={true}>
                        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}>
                            <ProgressRing />
                        </div>
                    </StepContent>
                </ContentContainer>
            </>
        );
    }

    const canIntrospect =
        connectorCredentials &&
        (fieldValues["Host"]?.trim()) &&
        (fieldValues["Database"]?.trim() || fieldValues["Database Name"]?.trim()) &&
        (fieldValues["User"]?.trim() || fieldValues["Username"]?.trim()) &&
        !isIntrospecting &&
        !connectionError;

    return (
        <>
            <ContentContainer hasFooterButton={true}>
                <StepContent fillHeight={true}>
                    {showTitle && (
                        <div>
                            <SectionTitle variant="h3">Database Credentials</SectionTitle>
                            <SectionSubtitle variant="body2">
                                Enter credentials to connect and introspect the database
                            </SectionSubtitle>
                        </div>
                    )}
                    {connectionError && (
                        <ConnectionErrorDisplay
                            connectionError={connectionError}
                            lsErrorDetails={lsErrorDetails}
                            onBrowseMoreConnectors={onBrowseMoreConnectors}
                        />
                    )}
                    {form}
                </StepContent>
            </ContentContainer>
            <FooterContainer>
                <ActionButton
                    appearance="primary"
                    onClick={onIntrospect}
                    disabled={!canIntrospect}
                    buttonSx={{ width: "100%", height: "35px" }}
                >
                    {isIntrospecting ? "Connecting..." : "Connect & Introspect Database"}
                </ActionButton>
            </FooterContainer>
        </>
    );
}

export interface SelectPersistTablesStepProps {
    tableSearch: string;
    onTableSearchChange: (value: string) => void;
    selectedTablesCount: number;
    totalTablesCount: number;
    filteredTables: TableInfo[];
    onTableToggle: (name: string) => void;
    onSelectAll: () => void;
    onContinue: () => void;
    connectionError: string | null;
    isIntrospecting?: boolean;
}

export function SelectPersistTablesStep(props: SelectPersistTablesStepProps) {
    const {
        tableSearch,
        onTableSearchChange,
        selectedTablesCount,
        totalTablesCount,
        filteredTables,
        onTableToggle,
        onSelectAll,
        onContinue,
        connectionError,
        isIntrospecting,
    } = props;

    return (
        <>
            <ContentContainer hasFooterButton={true}>
                <StepContent fillHeight={true} style={{ gap: "16px" }}>
                    <SelectionInfo>
                        <div>
                            <SectionTitle variant="h3">Select Tables</SectionTitle>
                            <SectionSubtitle variant="body2">
                                Choose which tables to include in this connector
                            </SectionSubtitle>
                        </div>
                        <Typography variant="body2" sx={{ color: ThemeColors.ON_SURFACE_VARIANT }}>
                            {selectedTablesCount} of {totalTablesCount} selected
                        </Typography>
                    </SelectionInfo>
                    <SearchRow>
                        <SearchBox
                            value={tableSearch}
                            placeholder="Search tables..."
                            onChange={onTableSearchChange}
                            sx={{ flex: 1 }}
                        />
                        <SelectAllButton appearance="secondary" onClick={onSelectAll}>
                            {selectedTablesCount === totalTablesCount && totalTablesCount > 0 ? "Deselect All" : "Select All"}
                        </SelectAllButton>
                    </SearchRow>
                    <TablesGrid>
                        {isIntrospecting && <ProgressIndicator />}
                        {filteredTables.map((t) => (
                            <TableCard key={t.table} selected={t.selected} onClick={() => onTableToggle(t.table)}>
                                <TableCheckbox
                                    type="checkbox"
                                    checked={t.selected}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        onTableToggle(t.table);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <TableName variant="body1">{t.table}</TableName>
                            </TableCard>
                        ))}
                    </TablesGrid>
                </StepContent>
            </ContentContainer>
            <FooterContainer>
                <ActionButton
                    appearance="primary"
                    onClick={onContinue}
                    disabled={selectedTablesCount === 0 || !!connectionError}
                    buttonSx={{ width: "100%", height: "35px" }}
                >
                    Continue to Connection Details
                </ActionButton>
            </FooterContainer>
        </>
    );
}

export interface CreatePersistConnectionStepProps {
    connectionName: string;
    onConnectionNameChange: (value: string) => void;
    connectionNameError?: string | null;
    connectorCredentials: IntrospectCredentialsResponse["data"] | null;
    fieldValues: Record<string, string>;
    connectionError: string | null;
    lsErrorDetails: LSErrorDetails;
    onBrowseMoreConnectors?: () => void;
    onSave: () => void;
    isSaving: boolean;
    additionalFields?: ReactNode;
    showConfigurablesPanel?: boolean;
    readOnlyConnectionName?: boolean;
}

export function CreatePersistConnectionStep(props: CreatePersistConnectionStepProps) {
    const {
        connectionName,
        onConnectionNameChange,
        connectionNameError,
        connectorCredentials,
        fieldValues,
        connectionError,
        lsErrorDetails,
        onBrowseMoreConnectors,
        onSave,
        isSaving,
        additionalFields,
        showConfigurablesPanel = true,
        readOnlyConnectionName = false,
    } = props;

    return (
        <>
            <ContentContainer hasFooterButton={true}>
                <StepContent fillHeight={true} style={{ gap: "16px" }}>
                    <div>
                        <SectionTitle variant="h3">Connection Details</SectionTitle>
                        <SectionSubtitle variant="body2">
                            Name your connection and configure default values for configurables
                        </SectionSubtitle>
                    </div>
                    {connectionError && (
                        <ConnectionErrorDisplay
                            connectionError={connectionError}
                            lsErrorDetails={lsErrorDetails}
                            onBrowseMoreConnectors={onBrowseMoreConnectors}
                        />
                    )}
                    <FormSection>
                        <FormField>
                            <TextField
                                id="connection-name"
                                label="Connection Name"
                                placeholder="Database connection name"
                                value={connectionName}
                                onTextChange={onConnectionNameChange}
                                errorMsg={connectionNameError ?? undefined}
                                {...(isSaving || readOnlyConnectionName ? { readonly: true } : {})}
                            />
                        </FormField>
                    </FormSection>
                    {additionalFields}
                    {showConfigurablesPanel && (
                        <ConfigurablesPanel>
                            <div style={{ gap: "4px" }}>
                                <SectionTitle variant="h4">Connection Configurables</SectionTitle>
                                <ConfigurablesDescription>
                                    Configurables will be generated for the connection host, port, username, password, and
                                    database name, with default values specified below.
                                </ConfigurablesDescription>
                            </div>
                            <FormSection>
                                {Object.values(connectorCredentials?.properties || {})
                                    .filter((p) => !p.hidden && !isDatabaseSystemProperty(p) && !isPasswordProperty(p))
                                    .map((prop) => {
                                        const label = prop.metadata?.label || "";
                                        const value = fieldValues[label] ?? (prop.value as string) ?? "";
                                        return (
                                            <FormField key={label}>
                                                <Typography variant="body2" sx={{ color: ThemeColors.ON_SURFACE_VARIANT }}>
                                                    {connectionName ? `${connectionName}${label.replace(/\s+/g, "")}` : label}
                                                </Typography>
                                                <ReadonlyValue>{value}</ReadonlyValue>
                                            </FormField>
                                        );
                                    })}
                            </FormSection>
                        </ConfigurablesPanel>
                    )}
                </StepContent>
            </ContentContainer>
            <FooterContainer>
                <ActionButton
                    appearance="primary"
                    onClick={onSave}
                    disabled={!connectionName || !!connectionNameError || isSaving}
                    buttonSx={{ width: "100%", height: "35px" }}
                >
                    {isSaving ? "Saving..." : "Save Connection"}
                </ActionButton>
            </FooterContainer>
        </>
    );
}

export function DatabaseConnectionPopup(props: DatabaseConnectionPopupProps) {
    const { fileName, target, onClose, onBack, onBrowseConnectors } = props;
    const { rpcClient } = useRpcContext();

    const [currentStep, setCurrentStep] = useState(0);
    const [connectorCredentials, setConnectorCredentials] = useState<IntrospectCredentialsResponse["data"] | null>(null);
    const [isLoadingCredentials, setIsLoadingCredentials] = useState(true);
    const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
    const [introspectDatabaseResponse, setIntrospectDatabaseResponse] = useState<IntrospectDatabaseResponse | null>(null);
    const [isIntrospecting, setIsIntrospecting] = useState(false);
    const [connectionName, setConnectionName] = useState("");
    const [connectionNameError, setConnectionNameError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [lsErrorDetails, setLsErrorDetails] = useState<LSErrorDetails>({
        errorMessage: null,
    });
    const [tableSearch, setTableSearch] = useState("");

    const steps = ["Introspect Database", "Select Tables", "Create Connection"];

    const updateFieldValue = useCallback((propKey: string, value: string) => {
        setFieldValues((prev) => ({ ...prev, [propKey]: value }));
        setConnectionError(null);
        setLsErrorDetails({ errorMessage: null });
    }, []);

    const handleDbTypeChange = useCallback(
        (label: string, value: string) => {
            const backendValue = DB_SYSTEM_TO_VALUE[value] ?? value.toLowerCase();
            const properties = connectorCredentials?.properties ?? {};
            const portProp = Object.values(properties).find((p) => {
                const l = (p.metadata?.label || "").toLowerCase();
                return l === "port";
            });
            setFieldValues((prev) => {
                const next = { ...prev, [label]: backendValue };
                if (portProp?.metadata?.label) {
                    next[portProp.metadata.label] = String(DEFAULT_PORTS[backendValue] ?? 3306);
                }
                return next;
            });
            setConnectionError(null);
            setLsErrorDetails({ errorMessage: null });
        },
        [connectorCredentials?.properties]
    );

    useEffect(() => {
        const loadCredentials = async () => {
            setIsLoadingCredentials(true);
            try {
                const visualizerLocation = await rpcClient.getVisualizerLocation();
                const projectPath = visualizerLocation.projectPath;
                const result = await fetchConnectorCredentials({
                    connectorWizardRpcClient: rpcClient.getConnectorWizardRpcClient(),
                    projectPath,
                });
                if (result.success && result.connectorCredentials && result.initialFieldValues) {
                    setConnectorCredentials(result.connectorCredentials);
                    setFieldValues(result.initialFieldValues);
                    setConnectionError(null);
                } else {
                    setConnectionError(result.error ?? "Failed to load connector credentials");
                }
            } finally {
                setIsLoadingCredentials(false);
            }
        };
        loadCredentials();
    }, [rpcClient]);

    const buildPropertiesFromFieldValues = useCallback((): { [key: string]: PropertyModel } => {
        const props = connectorCredentials?.properties ?? {};
        const result: { [key: string]: PropertyModel } = {};
        for (const [key, prop] of Object.entries(props)) {
            const label = prop.metadata?.label || "";
            const value = label in fieldValues ? fieldValues[label] : (prop.value as string) ?? "";
            result[key] = { ...prop, value };
        }
        return result;
    }, [connectorCredentials?.properties, fieldValues]);

    const handleIntrospect = async () => {
        if (!connectorCredentials) return;
        setIsIntrospecting(true);
        setConnectionError(null);
        try {
            const visualizerLocation = await rpcClient.getVisualizerLocation();
            const projectPath = visualizerLocation.projectPath;
            const propertiesMap = buildPropertiesFromFieldValues();

            const result = await introspectDatabase({
                connectorWizardRpcClient: rpcClient.getConnectorWizardRpcClient(),
                projectPath,
                connectorCredentials,
                properties: propertiesMap,
            });

            if (result.success && result.introspectResponse) {
                setIntrospectDatabaseResponse(result.introspectResponse);
                setConnectionError(null);
                setLsErrorDetails({ errorMessage: null });
                setCurrentStep(1);
            } else {
                if (result.connectionError) setConnectionError(result.connectionError);
                if (result.lsErrorDetails) setLsErrorDetails(result.lsErrorDetails);
                if (result.clearPasswordLabel) {
                    const pwdLabel = result.clearPasswordLabel;
                    setFieldValues((prev) => ({ ...prev, [pwdLabel]: "" }));
                }
            }
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

    const handleContinueToConnectionDetails = () => {
        setCurrentStep(2);
    };

    const handleSaveConnection = async () => {
        const tables = introspectDatabaseResponse?.tables ?? [];
        if (tables.length === 0) return;

        setIsSaving(true);
        setConnectionError(null);
        setLsErrorDetails({ errorMessage: null });
        try {
            const visualizerLocation = await rpcClient.getVisualizerLocation();
            const projectPath = visualizerLocation.projectPath;
            const properties = buildPropertiesFromFieldValues();

            const result = await persistConnection({
                connectorWizardRpcClient: rpcClient.getConnectorWizardRpcClient(),
                projectPath,
                connectionName,
                properties,
                tables,
            });

            if (result.success) {
                onClose?.({ recentIdentifier: result.recentIdentifier, artifactType: DIRECTORY_MAP.CONNECTION });
            } else {
                if (result.connectionError) setConnectionError(result.connectionError);
                if (result.lsErrorDetails) setLsErrorDetails(result.lsErrorDetails);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleBrowseMoreConnectors = () => {
        if (onBrowseConnectors) {
            onBrowseConnectors();
        } else {
            // Fallback: close this popup and let parent handle navigation
            onClose?.();
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

    const validateConnectionName = useCallback(
        debounce(async (value: string) => {
            if (!value) {
                setConnectionNameError(null);
                return;
            }
            try {
                const { projectPath } = await rpcClient.getVisualizerLocation();
                const connectionsFilePath = Utils.joinPath(URI.file(projectPath), CONNECTIONS_FILE).fsPath;
                const endPosition = await rpcClient.getBIDiagramRpcClient().getEndOfFile({
                    filePath: connectionsFilePath,
                });
                const response = await rpcClient.getBIDiagramRpcClient().getExpressionDiagnostics({
                    filePath: connectionsFilePath,
                    context: {
                        expression: value,
                        startLine: {
                            line: endPosition.line,
                            offset: endPosition.offset,
                        },
                        offset: 0,
                        lineOffset: 0,
                        codedata: {
                            node: "VARIABLE",
                            lineRange: {
                                startLine: { line: endPosition.line, offset: endPosition.offset },
                                endLine: { line: endPosition.line, offset: endPosition.offset },
                                fileName: CONNECTIONS_FILE,
                            },
                        },
                        property: {
                            metadata: { label: "", description: "" },
                            value: "",
                            types: [{ fieldType: "IDENTIFIER", scope: "Object", selected: false }],
                            optional: false,
                            editable: true,
                        },
                    },
                });
                const uniqueDiagnostics = removeDuplicateDiagnostics(response.diagnostics || []);
                const errorDiagnostic = uniqueDiagnostics.find((d) => d.severity === 1);
                setConnectionNameError(errorDiagnostic ? errorDiagnostic.message : null);
            } catch (e) {
                setConnectionNameError(null);
            }
        }, 250),
        [rpcClient]
    );

    const handleConnectionNameChange = useCallback(
        (value: string) => {
            setConnectionName(value);
            setConnectionNameError(null);
            validateConnectionName(value);
            if (connectionError) {
                setConnectionError(null);
                setLsErrorDetails({ errorMessage: null });
            }
        },
        [connectionError, validateConnectionName]
    );

    const renderStep = () => {
        switch (currentStep) {
            case 0:
                return (
                    <IntrospectDatabaseStep
                        isLoadingCredentials={isLoadingCredentials}
                        connectorCredentials={connectorCredentials}
                        fieldValues={fieldValues}
                        connectionError={connectionError}
                        lsErrorDetails={lsErrorDetails}
                        onBrowseMoreConnectors={handleBrowseMoreConnectors}
                        onIntrospect={handleIntrospect}
                        isIntrospecting={isIntrospecting}
                        form={<IntrospectDatabaseStepForm
                            connectorCredentials={connectorCredentials}
                            fieldValues={fieldValues}
                            onFieldValueChange={updateFieldValue}
                            onDbTypeChange={handleDbTypeChange}
                            isIntrospecting={isIntrospecting}
                        />}
                    />
                );
            case 1:
                return (
                    <SelectPersistTablesStep
                        tableSearch={tableSearch}
                        onTableSearchChange={setTableSearch}
                        selectedTablesCount={selectedTablesCount}
                        totalTablesCount={totalTablesCount}
                        filteredTables={filteredTables}
                        onTableToggle={handleTableToggleByName}
                        onSelectAll={handleSelectAll}
                        onContinue={handleContinueToConnectionDetails}
                        connectionError={connectionError}
                    />
                );
            case 2:
                return (
                    <CreatePersistConnectionStep
                        connectionName={connectionName}
                        onConnectionNameChange={handleConnectionNameChange}
                        connectionNameError={connectionNameError}
                        connectorCredentials={connectorCredentials}
                        fieldValues={fieldValues}
                        connectionError={connectionError}
                        lsErrorDetails={lsErrorDetails}
                        onBrowseMoreConnectors={handleBrowseMoreConnectors}
                        onSave={handleSaveConnection}
                        isSaving={isSaving}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <>
            <PopupOverlay sx={{ background: `${ThemeColors.SURFACE_CONTAINER}`, opacity: `0.5` }} />
            <PopupContainer>
                <PopupHeader>
                    <BackButton appearance="icon" onClick={onBack}>
                        <Codicon name="chevron-left" />
                    </BackButton>
                    <HeaderTitleContainer>
                        <PopupTitle variant="h2">Connect to a Database</PopupTitle>
                        <PopupSubtitle variant="body2">
                            Enter database credentials to introspect and discover available tables
                        </PopupSubtitle>
                    </HeaderTitleContainer>
                    <CloseButton appearance="icon" onClick={() => onClose?.()}>
                        <Codicon name="close" />
                    </CloseButton>
                </PopupHeader>
                <StepperContainer>
                    <Stepper steps={steps} currentStep={currentStep} alignment="flex-start" />
                </StepperContainer>
                {renderStep()}
            </PopupContainer>
        </>
    );
}

export default DatabaseConnectionPopup;
