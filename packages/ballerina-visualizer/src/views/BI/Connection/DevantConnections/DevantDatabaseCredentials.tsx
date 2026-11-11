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

import { buildConsoleUrl } from "@wso2/wso2-cloud-client/contract";
import React, { useCallback, useEffect, useMemo, useState, type FC } from "react";
import styled from "@emotion/styled";
import { DIRECTORY_MAP, IntrospectCredentialsResponse, ParentPopupData, TableInfo } from "@wso2/ballerina-core";
import { Tabs, ThemeColors, Typography, Button, Dropdown, OptionProps } from "@wso2/ui-toolkit";
import { usePlatformExtContext } from "../../../../providers/platform-ext-ctx-provider";
import { DevantTempConfig } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { PropertyModel } from "@wso2/ballerina-core";
import {
    CreatePersistConnectionStep,
    DB_SYSTEM_TO_VALUE,
    DEFAULT_PORTS,
    fetchConnectorCredentials,
    introspectDatabase,
    IntrospectDatabaseStep,
    IntrospectDatabaseStepForm,
    LSErrorDetails,
    persistConnection,
    SelectPersistTablesStep,
} from "../DatabaseConnectionPopup/index";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
    MarketplaceDatabaseListResp,
    DatabaseRequestStatusEnum,
    MarketplaceItem,
    ConnectionListItem,
    ServiceInfoVisibilityEnum,
} from "@wso2/wso2-platform-core";
import { LoadingRing } from "../../../../components/Loader";
import {
    buildDbPropertiesFromFieldValues,
    dbCredentialsToFieldValues,
    DevantConnectionFlow,
    DevantConnectionFlowStep,
    fieldValuesToDbConfig,
    generateInitialConnectionName,
    isValidDevantConnName,
    ProgressWrap,
} from "./utils";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ConnectorContentContainer, FormField, FormSection } from "../styles";

const TAB_VIEWS = [
    { id: "devantDatabases", name: "WSO2 Cloud Databases" },
    { id: "manual", name: "Other Database Credentials" },
];

const DatabaseListContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
`;

const DatabaseItem = styled.div<{ selected?: boolean; disabled?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border: 1px solid
        ${(props: { selected?: boolean; disabled?: boolean }) =>
            props.selected ? ThemeColors.PRIMARY : ThemeColors.OUTLINE_VARIANT};
    border-radius: 8px;
    background-color: ${(props: { selected?: boolean; disabled?: boolean }) =>
        props.selected ? ThemeColors.PRIMARY_CONTAINER : ThemeColors.SURFACE_DIM};
    cursor: ${(props: { selected?: boolean; disabled?: boolean }) => (props.disabled ? "not-allowed" : "pointer")};
    opacity: ${(props: { selected?: boolean; disabled?: boolean }) => (props.disabled ? 0.6 : 1)};
    transition: all 0.2s ease;

    ${(props: { selected?: boolean; disabled?: boolean }) =>
        !props.disabled &&
        `
        &:hover {
            border-color: ${ThemeColors.PRIMARY};
            background-color: ${ThemeColors.PRIMARY_CONTAINER};
        }
    `}
`;

const DatabaseItemLeft = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const DatabaseItemName = styled(Typography)`
    font-size: 14px;
    font-weight: 500;
    color: ${ThemeColors.ON_SURFACE};
    margin: 0;
`;

const DatabaseItemMeta = styled(Typography)`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin: 0;
`;

const DatabaseTypeBadge = styled.span`
    font-size: 11px;
    font-weight: 500;
    color: ${ThemeColors.PRIMARY};
    background-color: ${ThemeColors.PRIMARY_CONTAINER};
    border-radius: 4px;
    padding: 2px 8px;
    white-space: nowrap;
`;

const DatabaseItemRight = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    flex-shrink: 0;
`;

const DisabledHint = styled(Typography)`
    font-size: 11px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin: 0;
    opacity: 0.8;
    font-style: italic;
`;

const ProvisionSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
`;

const SectionDesc = styled(Typography)`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin-bottom: 10px;
`;

export function getDbServerTypeDisplayName(type: string): string {
    switch (type) {
        case "postgres":
            return "PostgreSQL";
        case "mysql":
            return "MySQL";
        case "redis":
            return "WSO2 Cloud Managed Cache";
        default:
            return type;
    }
}

const tempFieldValues: Record<string, string> = {
    Host: "localhost",
    Port: "3306",
    Database: "root",
    User: "admin",
};

interface DatabaseCredentialsTabsProps {
    devantDatabases?: MarketplaceDatabaseListResp;
    isLoadingDatabases: boolean;
    selectedDb: MarketplaceItem | null;
    onSelectDb: (db: MarketplaceItem) => void;
    onTabChange: (tabId: "devantDatabases" | "manual") => void;
    manualForm: React.ReactNode;
}

const DatabaseCredentialsTabs: FC<DatabaseCredentialsTabsProps> = ({
    manualForm,
    devantDatabases,
    isLoadingDatabases,
    selectedDb,
    onSelectDb,
    onTabChange,
}) => {
    const { devantConsoleUrl, platformExtState } = usePlatformExtContext();
    const { rpcClient } = useRpcContext();
    const [activeTab, setActiveTab] = React.useState<"devantDatabases" | "manual">("devantDatabases");

    const handleTabChange = (tabId: "devantDatabases" | "manual") => {
        setActiveTab(tabId);
        onTabChange(tabId);
    };

    const getStatusDisplayName = (status: string) => {
        switch (status) {
            case DatabaseRequestStatusEnum.Active:
                return "Active";
            case DatabaseRequestStatusEnum.Creating:
                return "Creating";
            case DatabaseRequestStatusEnum.Deleting:
                return "Deleting";
            case DatabaseRequestStatusEnum.Deleted:
                return "Deleted";
            case DatabaseRequestStatusEnum.PoweredOff:
                return "Powered Off";
            case DatabaseRequestStatusEnum.Resuming:
                return "Resuming";
            default:
                return status;
        }
    };

    const onClickCreateDb = async () => {
        if (!devantConsoleUrl) {
            return;
        }
        rpcClient.getCommonRpcClient().openExternalUrl({
            url: buildConsoleUrl(devantConsoleUrl, { orgHandle: platformExtState?.session?.org.handle, section: "admin/databases" }),
        });
    };

    return (
        <Tabs
            views={TAB_VIEWS}
            currentViewId={activeTab}
            onViewChange={(view: string) => handleTabChange(view as "devantDatabases" | "manual")}
            childrenSx={{ paddingTop: "16px" }}
        >
            <div id="devantDatabases">
                <>
                    {isLoadingDatabases ? (
                        <ProgressWrap>
                            <LoadingRing message="Loading WSO2 Cloud Databases..." />
                        </ProgressWrap>
                    ) : (
                        <>
                            {devantDatabases?.count === 0 ? (
                                <>
                                    <Typography variant="body2" sx={{ fontSize: "12px", margin: "10px 0" }}>
                                        You don't have any databases created in WSO2 Cloud yet. Head over to WSO2 Cloud to
                                        create a new database or{" "}
                                        <VSCodeLink onClick={() => handleTabChange("manual")}>
                                            provide credentials
                                        </VSCodeLink>{" "}
                                        of your existing database.
                                    </Typography>
                                    <Button appearance="secondary" onClick={onClickCreateDb}>
                                        Create New Database
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <DatabaseListContainer>
                                        {devantDatabases?.data?.map((db) => {
                                            const isActive =
                                                db.resourceDetails?.status === DatabaseRequestStatusEnum.Active;
                                            const statusDisplayName = getStatusDisplayName(db.resourceDetails?.status);
                                            return (
                                                <DatabaseItem
                                                    key={db.resourceId}
                                                    selected={selectedDb?.resourceId === db.resourceId}
                                                    disabled={!isActive}
                                                    onClick={() => isActive && onSelectDb(db)}
                                                >
                                                    <DatabaseItemLeft>
                                                        <DatabaseItemName variant="body1">{db.name}</DatabaseItemName>
                                                        <DatabaseItemMeta variant="body2">
                                                            Type:{" "}
                                                            {getDbServerTypeDisplayName(
                                                                db.resourceDetails?.databaseType,
                                                            )}
                                                        </DatabaseItemMeta>
                                                        <DatabaseItemMeta variant="body2">
                                                            Server: {db.resourceDetails?.databaseServerName}
                                                        </DatabaseItemMeta>
                                                        {!isActive && (
                                                            <DisabledHint variant="body2">
                                                                Database must be Active to proceed.{" "}
                                                                <VSCodeLink onClick={onClickCreateDb}>
                                                                    Manage in WSO2 Cloud
                                                                </VSCodeLink>
                                                            </DisabledHint>
                                                        )}
                                                    </DatabaseItemLeft>
                                                    <DatabaseItemRight>
                                                        <DatabaseTypeBadge>{statusDisplayName}</DatabaseTypeBadge>
                                                    </DatabaseItemRight>
                                                </DatabaseItem>
                                            );
                                        })}
                                    </DatabaseListContainer>
                                    <ProvisionSection>
                                        <Typography
                                            variant="body2"
                                            sx={{ color: ThemeColors.ON_SURFACE_VARIANT, fontSize: "12px" }}
                                        >
                                            Don't see your database?{" "}
                                            <VSCodeLink onClick={onClickCreateDb}>Create one in WSO2 Cloud</VSCodeLink> or{" "}
                                            <VSCodeLink onClick={() => handleTabChange("manual")}>
                                                provide database credentials
                                            </VSCodeLink>
                                            .
                                        </Typography>
                                    </ProvisionSection>
                                </>
                            )}
                        </>
                    )}
                </>
            </div>
            <div id="manual">{manualForm}</div>
        </Tabs>
    );
};

interface Props {
    projectPath: string;
    biConnectionNames: string[];
    existingDevantConnNames: string[];
    selectedMarketplaceItem?: MarketplaceItem | null;
    importedConnection?: ConnectionListItem;
    devantConfigs: DevantTempConfig[];
    setSelectedMarketplaceItem: (item: MarketplaceItem | null) => void;
    onClose: (parent?: ParentPopupData) => void;
    selectedStep: DevantConnectionFlowStep;
    goToNextStep: () => void;
    selectedFlow: DevantConnectionFlow;
    setSelectedFlow: (flow: DevantConnectionFlow) => void;
}

/** Connects to a WSO2 Cloud database with the credentials of the access picked. */
export const DevantDatabaseCredentials: FC<Props> = (props) => {
    const {
        projectPath,
        biConnectionNames,
        existingDevantConnNames,
        setSelectedMarketplaceItem,
        selectedMarketplaceItem,
        onClose,
        importedConnection,
        devantConfigs,
        selectedStep,
        goToNextStep,
        selectedFlow,
        setSelectedFlow,
    } = props;
    const { platformRpcClient, platformExtState, devantConsoleUrl } = usePlatformExtContext();

    const { rpcClient } = useRpcContext();
    const [activeTab, setActiveTab] = React.useState<"devantDatabases" | "manual">("devantDatabases");

    const [connectorCredentials, setConnectorCredentials] = useState<IntrospectCredentialsResponse["data"] | null>(
        null,
    );
    const [isLoadingCredentials, setIsLoadingCredentials] = useState(true);
    const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
    const [devantFieldValues, setDevantFieldValues] = useState<Record<string, string> | null>(null);
    const [tables, setTables] = useState<TableInfo[]>([]);
    const [connectionName, setConnectionName] = useState("");
    const [selectedUserCredentialId, setSelectedUserCredentialId] = useState<string>("");
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [lsErrorDetails, setLsErrorDetails] = useState<LSErrorDetails>({ errorMessage: null });
    const [tableSearch, setTableSearch] = useState("");

    const updateFieldValue = useCallback((propKey: string, value: string) => {
        setFieldValues((prev) => ({ ...prev, [propKey]: value }));
        setConnectionError(null);
        setLsErrorDetails({ errorMessage: null });
    }, []);

    const handleDbTypeChange = useCallback(
        (label: string, value: string) => {
            const backendValue = DB_SYSTEM_TO_VALUE[value] ?? value.toLowerCase();
            const props = connectorCredentials?.properties ?? {};
            const portProp = Object.values(props).find((p) => (p.metadata?.label || "").toLowerCase() === "port");
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
        [connectorCredentials?.properties],
    );

    useEffect(() => {
        const loadCredentials = async () => {
            setIsLoadingCredentials(true);
            try {
                const visualizerLocation = await rpcClient.getVisualizerLocation();
                const projPath = visualizerLocation.projectPath;
                const result = await fetchConnectorCredentials({
                    connectorWizardRpcClient: rpcClient.getConnectorWizardRpcClient(),
                    projectPath: projPath,
                });
                if (result.success && result.connectorCredentials && result.initialFieldValues) {
                    setConnectorCredentials(result.connectorCredentials);
                    setFieldValues(result.initialFieldValues);
                }
            } finally {
                setIsLoadingCredentials(false);
            }
        };
        loadCredentials();
    }, [rpcClient]);

    const getCredentialsFromSelectedDb = async (
        db: MarketplaceItem | null,
    ): Promise<{
        host: string;
        port: number;
        databaseName: string;
        username: string;
        password: string;
        databaseType: string;
    } | null> => {
        if (!db) {
            throw new Error("No WSO2 Cloud database selected to fetch credentials for introspection");
        }
        const orgId = platformExtState?.session?.org.handle || "";
        const serverId = db.resourceDetails?.databaseServerId;
        const [server, adminCredential] = await Promise.all([
            platformRpcClient.getDatabaseServer({ orgId, databaseServerId: serverId }),
            platformRpcClient.getDatabaseAdminCredential({ orgId, databaseServerId: serverId }),
        ]);
        const dbTypeMap: Record<string, string> = {
            postgres: "PostgreSQL",
            mysql: "MySQL",
        };
        return {
            databaseType: dbTypeMap[db.resourceDetails?.databaseType] ?? "PostgreSQL",
            host: server.connection_params.host,
            port: Number(server.connection_params.port),
            databaseName: db?.name || server.connection_params.database,
            username: server.connection_params.user,
            password: adminCredential.password,
        };
    };

    const { mutate: runIntrospect, isPending: isIntrospecting } = useMutation({
        mutationFn: async (params: { mode: "devantDb" | "thirdParty"; goToNextStep?: boolean }) => {
            if (!connectorCredentials) throw new Error("Connector credentials not loaded");
            const visualizerLocation = await rpcClient.getVisualizerLocation();
            const projPath = visualizerLocation.projectPath;

            let credsToUse: Record<string, string>;
            if (params.mode === "devantDb") {
                if(selectedMarketplaceItem?.resourceDetails?.status !== DatabaseRequestStatusEnum.Active) {
                    throw new Error("Selected WSO2 Cloud database is not active. Please select an active database to proceed.");
                }
                const creds = await getCredentialsFromSelectedDb(selectedMarketplaceItem);
                if (!creds) throw new Error("No WSO2 Cloud database selected");
                credsToUse = dbCredentialsToFieldValues(connectorCredentials, creds);
                setDevantFieldValues(credsToUse);
            } else {
                credsToUse = fieldValues;
            }

            const properties = buildDbPropertiesFromFieldValues(connectorCredentials, credsToUse);
            const result = await introspectDatabase({
                connectorWizardRpcClient: rpcClient.getConnectorWizardRpcClient(),
                projectPath: projPath,
                connectorCredentials,
                properties,
            });

            if (result.success && result.introspectResponse?.tables) {
                return { tables: result.introspectResponse.tables, goToNextStep: params.goToNextStep };
            }
            if (result.connectionError) setConnectionError(result.connectionError);
            if (result.lsErrorDetails) setLsErrorDetails(result.lsErrorDetails);
            if (result.clearPasswordLabel) {
                setFieldValues((prev) => ({ ...prev, [result.clearPasswordLabel!]: "" }));
            }
            throw new Error(result.connectionError || "Introspection failed");
        },
        onSuccess: (data) => {
            if (data?.tables) {
                setTables(data.tables);
                setConnectionError(null);
                setLsErrorDetails({ errorMessage: null });
            }
            if (data?.goToNextStep) {
                goToNextStep();
            }
        },
        onError: (error) => {
            console.error(">>> Error introspecting database", error);
        },
    });

    useEffect(() => {
        if (connectorCredentials) {
            if (
                [
                    DevantConnectionFlow.CREATE_DATABASE_PERSIST_DB_SELECTED,
                    DevantConnectionFlow.IMPORT_DATABASE_PERSIST,
                ].includes(selectedFlow) &&
                selectedMarketplaceItem
            ) {
                runIntrospect({ mode: "devantDb" });
            }
        }
    }, [selectedMarketplaceItem, selectedFlow, connectorCredentials]);

    const {
        mutate: saveDatabaseConnection,
        isPending: isSavingDbConn,
        error: saveDbConnError,
    } = useMutation({
        mutationFn: async () => {
            const connNameDiagnostic = isValidDevantConnName(
                connectionName,
                existingDevantConnNames,
                biConnectionNames,
                !!importedConnection,
            );
            if (connNameDiagnostic) {
                throw new Error(connNameDiagnostic);
            }
            if (selectedMarketplaceItem && !selectedUserCredentialId) {
                throw new Error("Credential is required to proceed");
            }
            if (!connectorCredentials) throw new Error("Connector credentials not loaded");
            // Checked before the connection is written locally, so a refusal leaves nothing half made.
            if (selectedMarketplaceItem && !importedConnection && !platformExtState?.selectedEnv?.id) {
                throw new Error("Select an environment to connect in first.");
            }
            if (selectedMarketplaceItem && !importedConnection && !platformExtState?.selectedIntegration?.integration.id) {
                throw new Error("Select an integration to connect in first.");
            }

            const activeFieldValues = selectedMarketplaceItem && devantFieldValues ? devantFieldValues : fieldValues;
            const properties = buildDbPropertiesFromFieldValues(connectorCredentials, activeFieldValues);

            const visualizerLocation = await rpcClient.getVisualizerLocation();
            const projPath = visualizerLocation.projectPath;

            const persistResult = await persistConnection({
                connectorWizardRpcClient: rpcClient.getConnectorWizardRpcClient(),
                projectPath: projPath,
                connectionName,
                properties,
                tables,
            });

            if (!persistResult.success) {
                if (persistResult.connectionError) setConnectionError(persistResult.connectionError);
                if (persistResult.lsErrorDetails) setLsErrorDetails(persistResult.lsErrorDetails);
                throw new Error(persistResult.connectionError);
            }

            await createDevantConnection();
        },
        onSuccess: (_, vars) => {
            onClose?.({ recentIdentifier: connectionName, artifactType: DIRECTORY_MAP.CONNECTION });
        },
        onError: (error) => {
            console.error(">>> Error saving database connection", error);
        },
    });

    const handleTableToggleByName = (name: string) => {
        setTables((prev) => prev.map((t) => (t.table === name ? { ...t, selected: !t.selected } : t)));
    };

    const handleSelectAllTables = () => {
        const allSelected = tables.every((t) => t.selected);
        setTables(tables.map((t) => ({ ...t, selected: !allSelected })));
    };

    const handleConnectionNameChange = (value: string) => {
        setConnectionName(value);
    };

    const { data: devantDatabases, isLoading: isLoadingDatabases } = useQuery({
        queryKey: ["devant-databases", projectPath, platformExtState?.session?.org.handle],
        queryFn: () =>
            platformRpcClient.getMarketplaceDatabases({
                orgId: platformExtState?.session?.org.handle || "",
            }),
        select: (resp) => ({
            ...resp,
            data:
                resp.data?.filter(
                    (db) =>
                        db.resourceDetails?.databaseType &&
                        ["postgres", "mysql"].includes(db.resourceDetails.databaseType),
                ) || [],
        }),
        refetchOnWindowFocus: true,
    });

    useEffect(() => {
        if (selectedFlow === DevantConnectionFlow.CREATE_DATABASE_PERSIST && activeTab === "manual") {
            setSelectedFlow(DevantConnectionFlow.CREATE_THIRD_PARTY_PERSIST);
        } else if (
            selectedFlow === DevantConnectionFlow.CREATE_THIRD_PARTY_PERSIST &&
            activeTab === "devantDatabases"
        ) {
            setSelectedFlow(DevantConnectionFlow.CREATE_DATABASE_PERSIST);
        }
    }, [activeTab, selectedFlow]);

    const createDevantConnection = async () => {
        if (importedConnection) {
            const connectionDetailed = await platformRpcClient.getConnection({
                connectionGroupId: importedConnection.groupUuid,
                orgId: platformExtState?.session?.org.handle,
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
            return;
        }

        // WSO2 Cloud cannot register a third-party database yet, so one given by its credentials stays a
        // local connection: the persist step already wrote it and its configurables.
        if (!selectedMarketplaceItem) {
            return;
        }

        const activeFv = selectedMarketplaceItem && devantFieldValues ? devantFieldValues : fieldValues;
        const configs = fieldValuesToDbConfig(activeFv);

        const newDevantConfigs: DevantTempConfig[] = [
            { id: "HostName", name: `${connectionName}Host`, value: configs.host, isSecret: false, type: "string" },
            {
                id: "Port",
                name: `${connectionName}Port`,
                value: configs.port?.toString(),
                isSecret: false,
                type: "int",
            },
            {
                id: "Username",
                name: `${connectionName}User`,
                value: configs.username,
                isSecret: false,
                type: "string",
            },
            {
                id: "Password",
                name: `${connectionName}Password`,
                value: configs.password,
                isSecret: true,
                type: "string",
            },
            {
                id: "DatabaseName",
                name: `${connectionName}Database`,
                value: configs.databaseName,
                isSecret: false,
                type: "string",
            },
        ];
        if (!platformExtState?.selectedEnv?.id) {
            throw new Error("Select an environment to connect in first.");
        }
        const envMappingParam: Record<string, { resourceId: string; parameterReference: string }> = {
            [platformExtState.selectedEnv.id]: {
                resourceId: selectedMarketplaceItem.resourceId,
                parameterReference: selectedUserCredentialId,
            },
        };

        const createdConnection = await platformRpcClient.createDatabaseConnection({
            name: connectionName,
            orgId: platformExtState?.session?.org.handle || "",
            orgUuid: platformExtState?.session?.org.uuid || "",
            projectId: platformExtState?.selectedContext?.projectName || "",
            componentId: platformExtState?.selectedIntegration?.integration.id || "",
            serviceId: selectedMarketplaceItem?.resourceId,
            envMapping: envMappingParam,
            schemaReference: selectedMarketplaceItem?.connectionSchemas[0]?.id || "",
        });

        await platformRpcClient.createConnectionConfig({
            marketplaceItem: selectedMarketplaceItem,
            name: connectionName,
            visibility: "PUBLIC",
            componentDir: projectPath,
        });

        await platformRpcClient.replaceDevantTempConfigValues({
            configs: newDevantConfigs,
            createdConnection: createdConnection,
        });
    };

    const { data: dbConfigs = [] } = useQuery({
        queryKey: ["devant-db-configs", platformExtState?.selectedContext?.projectName, selectedMarketplaceItem],
        queryFn: () =>
            platformRpcClient.getDatabaseCredentials({
                orgId: platformExtState?.session?.org.handle || "",
                databaseServerId: selectedMarketplaceItem?.resourceDetails?.databaseServerId || "",
            }),
        enabled: !!selectedMarketplaceItem,
        select: (resp) => {
            const configOptions: OptionProps[] = resp
                ?.filter(
                    (item) =>
                        item.applicable_environments.includes(platformExtState?.selectedEnv?.id) &&
                        selectedMarketplaceItem.name === item.database_name,
                )
                .map((cfg) => ({ id: cfg.id, value: cfg.id, content: cfg.display_name }));
            return configOptions;
        },
    });

    useEffect(() => {
        if (dbConfigs?.length > 0 && !dbConfigs.some((cfg) => cfg.id === selectedUserCredentialId)) {
            setSelectedUserCredentialId(dbConfigs[0].id);
        }
    }, [dbConfigs, selectedUserCredentialId]);

    useEffect(() => {
        let dbName = fieldValuesToDbConfig(fieldValues).databaseName;
        if (selectedMarketplaceItem) {
            dbName = selectedMarketplaceItem.name;
        }
        const initialConnName = importedConnection
            ? importedConnection.name
            : generateInitialConnectionName(biConnectionNames, existingDevantConnNames, dbName);
        setConnectionName(initialConnName);
    }, [importedConnection, fieldValues, selectedMarketplaceItem, biConnectionNames, existingDevantConnNames]);

    const onClickCreateDb = async () => {
        if (!devantConsoleUrl) {
            return;
        }
        rpcClient.getCommonRpcClient().openExternalUrl({
            url: buildConsoleUrl(devantConsoleUrl, { orgHandle: platformExtState?.session?.org.handle, section: "admin/databases" }),
        });
    };

    const filteredTables = useMemo(
        () => tables.filter((t) => t.table.toLowerCase().includes(tableSearch.trim().toLowerCase())),
        [tables, tableSearch],
    );
    const selectedTablesCount = tables.filter((t) => t.selected).length;
    const totalTablesCount = tables.length;

    const renderStepContent = () => {
        switch (selectedStep) {
            case DevantConnectionFlowStep.PERSIST_CONFIG:
                return (
                    <IntrospectDatabaseStep
                        isLoadingCredentials={isLoadingCredentials}
                        connectorCredentials={connectorCredentials}
                        fieldValues={
                            selectedMarketplaceItem && activeTab === "devantDatabases" ? tempFieldValues : fieldValues
                        }
                        connectionError={connectionError}
                        lsErrorDetails={lsErrorDetails}
                        showTitle={false}
                        onIntrospect={() =>
                            runIntrospect({
                                goToNextStep: true,
                                mode: activeTab === "devantDatabases" ? "devantDb" : "thirdParty",
                            })
                        }
                        isIntrospecting={isIntrospecting}
                        form={
                            <DatabaseCredentialsTabs
                                devantDatabases={devantDatabases}
                                isLoadingDatabases={isLoadingDatabases}
                                selectedDb={selectedMarketplaceItem ?? null}
                                onSelectDb={(db) => setSelectedMarketplaceItem(db)}
                                onTabChange={setActiveTab}
                                manualForm={
                                    <IntrospectDatabaseStepForm
                                        connectorCredentials={connectorCredentials}
                                        fieldValues={fieldValues}
                                        onFieldValueChange={updateFieldValue}
                                        onDbTypeChange={handleDbTypeChange}
                                        isIntrospecting={isIntrospecting}
                                    />
                                }
                            />
                        }
                    />
                );
            case DevantConnectionFlowStep.PERSIST_SELECT_TABLES:
                return (
                    <SelectPersistTablesStep
                        tableSearch={tableSearch}
                        onTableSearchChange={setTableSearch}
                        selectedTablesCount={selectedTablesCount}
                        totalTablesCount={totalTablesCount}
                        filteredTables={filteredTables}
                        onTableToggle={handleTableToggleByName}
                        onSelectAll={handleSelectAllTables}
                        onContinue={goToNextStep}
                        connectionError={connectionError}
                        isIntrospecting={isIntrospecting}
                    />
                );
            case DevantConnectionFlowStep.PERSIST_CREATE_CONNECTION:
                return (
                    <>
                        <CreatePersistConnectionStep
                            connectionName={connectionName}
                            onConnectionNameChange={importedConnection ? () => {} : handleConnectionNameChange}
                            connectorCredentials={connectorCredentials}
                            fieldValues={selectedMarketplaceItem && devantFieldValues ? devantFieldValues : fieldValues}
                            connectionError={saveDbConnError?.message ?? connectionError}
                            lsErrorDetails={lsErrorDetails}
                            onSave={saveDatabaseConnection}
                            isSaving={isSavingDbConn}
                            showConfigurablesPanel={!!!selectedMarketplaceItem}
                            readOnlyConnectionName={!!importedConnection}
                            additionalFields={
                                !!selectedMarketplaceItem &&
                                !!!importedConnection && (
                                    <FormSection>
                                        <FormField>
                                            <Dropdown
                                                id="userCredential"
                                                items={dbConfigs}
                                                label="Access Credentials"
                                                value={selectedUserCredentialId}
                                                onValueChange={(val) => setSelectedUserCredentialId(val)}
                                                errorMsg={
                                                    selectedUserCredentialId ? "" : "Credential is required to proceed"
                                                }
                                            />
                                        </FormField>
                                        <Typography variant="body2" sx={{ fontSize: "13px" }}>
                                            Don't see your database credentials? Visit WSO2 Cloud to{" "}
                                            <VSCodeLink onClick={onClickCreateDb}>
                                                manage your database credentials
                                            </VSCodeLink>
                                            .
                                        </Typography>
                                    </FormSection>
                                )
                            }
                        />
                    </>
                );
            default:
                return null;
        }
    };

    return <ConnectorContentContainer hasFooterButton>{renderStepContent()}</ConnectorContentContainer>;
};
