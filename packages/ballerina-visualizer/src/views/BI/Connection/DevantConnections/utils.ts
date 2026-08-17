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

import { AvailableNode, Category, IntrospectCredentialsResponse, PropertyModel } from "@wso2/ballerina-core";
import { MarketplaceItem, MarketplaceItemSchema, Project, ServiceInfoVisibilityEnum } from "@wso2/wso2-platform-core";
import styled from "@emotion/styled";

export const ProgressWrap = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 40px;
`;

export enum DevantConnectionFlow {
    // Create related flows
    CREATE_INTERNAL_OAS = "CREATE_INTERNAL_OAS",
    CREATE_INTERNAL_OTHER = "CREATE_INTERNAL_OTHER",
    CREATE_INTERNAL_OTHER_SELECT_BI_CONNECTOR = "CREATE_INTERNAL_OTHER_SELECT_BI_CONNECTOR",
    CREATE_THIRD_PARTY_OAS = "CREATE_THIRD_PARTY_OAS",
    CREATE_THIRD_PARTY_OTHER = "CREATE_THIRD_PARTY_OTHER",
    CREATE_THIRD_PARTY_OTHER_SELECT_BI_CONNECTOR = "CREATE_THIRD_PARTY_OTHER_SELECT_BI_CONNECTOR",
    REGISTER_CREATE_THIRD_PARTY_FROM_BI_CONNECTOR = "REGISTER_CREATE_THIRD_PARTY_FROM_BI_CONNECTOR",
    REGISTER_CREATE_THIRD_PARTY_FROM_OAS = "REGISTER_CREATE_THIRD_PARTY_FROM_OAS",
    CREATE_THIRD_PARTY_PERSIST = "CREATE_THIRD_PARTY_PERSIST",
    CREATE_DATABASE_PERSIST = "CREATE_DATABASE_PERSIST",
    CREATE_DATABASE_PERSIST_DB_SELECTED = "CREATE_DATABASE_PERSIST_DB_SELECTED",
    // Import related flows
    IMPORT_INTERNAL_OAS = "IMPORT_INTERNAL_OAS",
    IMPORT_INTERNAL_OTHER = "IMPORT_INTERNAL_OTHER",
    IMPORT_INTERNAL_OTHER_SELECT_BI_CONNECTOR = "IMPORT_INTERNAL_OTHER_SELECT_BI_CONNECTOR",
    IMPORT_THIRD_PARTY_OAS = "IMPORT_THIRD_PARTY_OAS",
    IMPORT_THIRD_PARTY_OTHER = "IMPORT_THIRD_PARTY_OTHER",
    IMPORT_THIRD_PARTY_OTHER_SELECT_BI_CONNECTOR = "IMPORT_THIRD_PARTY_OTHER_SELECT_BI_CONNECTOR",
    IMPORT_THIRD_PARTY_PERSIST = "IMPORT_THIRD_PARTY_PERSIST",
    IMPORT_DATABASE_PERSIST = "IMPORT_DATABASE_PERSIST",
}

export const DevantConnectionFlowTitles: Partial<Record<DevantConnectionFlow, string>> = {
    // Create related flow titles
    [DevantConnectionFlow.CREATE_INTERNAL_OAS]: "Connect to WSO2 Cloud service",
    [DevantConnectionFlow.CREATE_INTERNAL_OTHER]: "Connect to WSO2 Cloud service",
    [DevantConnectionFlow.CREATE_INTERNAL_OTHER_SELECT_BI_CONNECTOR]: "Connect to WSO2 Cloud service",
    [DevantConnectionFlow.CREATE_THIRD_PARTY_OAS]: "Connect via API Specification",
    [DevantConnectionFlow.CREATE_THIRD_PARTY_OTHER]: "Connect to Third-Party service",
    [DevantConnectionFlow.CREATE_THIRD_PARTY_OTHER_SELECT_BI_CONNECTOR]: "Connect to Third-Party service",
    [DevantConnectionFlow.REGISTER_CREATE_THIRD_PARTY_FROM_BI_CONNECTOR]: "Connect to Third-Party service",
    [DevantConnectionFlow.REGISTER_CREATE_THIRD_PARTY_FROM_OAS]: "Connect to Third-Party service",
    [DevantConnectionFlow.CREATE_DATABASE_PERSIST]: "Connect with WSO2 Cloud database",
    [DevantConnectionFlow.CREATE_DATABASE_PERSIST_DB_SELECTED]: "Connect with WSO2 Cloud database",
    [DevantConnectionFlow.CREATE_THIRD_PARTY_PERSIST]: "Connect to external database",
    // Import related flow titles
    [DevantConnectionFlow.IMPORT_INTERNAL_OAS]: "Connect to WSO2 Cloud service",
    [DevantConnectionFlow.IMPORT_INTERNAL_OTHER]: "Connect to WSO2 Cloud service",
    [DevantConnectionFlow.IMPORT_INTERNAL_OTHER_SELECT_BI_CONNECTOR]: "Connect to WSO2 Cloud service",
    [DevantConnectionFlow.IMPORT_THIRD_PARTY_OAS]: "Use registered third party connection via API Specification",
    [DevantConnectionFlow.IMPORT_THIRD_PARTY_OTHER]: "Use registered third party connection",
    [DevantConnectionFlow.IMPORT_THIRD_PARTY_OTHER_SELECT_BI_CONNECTOR]: "Use registered third party connection",
    [DevantConnectionFlow.IMPORT_DATABASE_PERSIST]: "Use registered database connection",
    [DevantConnectionFlow.IMPORT_THIRD_PARTY_PERSIST]: "Use registered third party database connection",
};

export const DevantConnectionFlowSubTitles: Partial<Record<DevantConnectionFlow, string>> = {
    // Create related flow subtitles
    [DevantConnectionFlow.CREATE_INTERNAL_OAS]: "Connect to REST API service running in WSO2 Cloud",
    [DevantConnectionFlow.CREATE_INTERNAL_OTHER]: "Connect to service running in WSO2 Cloud by configuring your connector",
    [DevantConnectionFlow.CREATE_INTERNAL_OTHER_SELECT_BI_CONNECTOR]:
        "Connect to service running in WSO2 Cloud by configuring your connector",
    [DevantConnectionFlow.CREATE_THIRD_PARTY_OAS]:
        "Connect to Third-Party REST API service by creating and mapping configurations",
    [DevantConnectionFlow.CREATE_THIRD_PARTY_OTHER]:
        "Connect to Third-Party service by creating and mapping configurations",
    [DevantConnectionFlow.CREATE_THIRD_PARTY_OTHER_SELECT_BI_CONNECTOR]:
        "Connect to Third-Party service by configuring your connector",
    [DevantConnectionFlow.REGISTER_CREATE_THIRD_PARTY_FROM_BI_CONNECTOR]:
        "Connect to Third-Party service by configuring your Ballerina connector",
    [DevantConnectionFlow.REGISTER_CREATE_THIRD_PARTY_FROM_OAS]:
        "Connect to Third-Party service from API Specification",
    [DevantConnectionFlow.CREATE_DATABASE_PERSIST]: "Connect with a database provisioned in WSO2 Cloud",
    [DevantConnectionFlow.CREATE_DATABASE_PERSIST_DB_SELECTED]: "Connect with a database provisioned in WSO2 Cloud",
    [DevantConnectionFlow.CREATE_THIRD_PARTY_PERSIST]: "Connect with a external database by providing configurations",
    // Import related flow subtitles
    [DevantConnectionFlow.IMPORT_INTERNAL_OAS]: "Connect to REST API service running in WSO2 Cloud",
    [DevantConnectionFlow.IMPORT_INTERNAL_OTHER]: "Connect to service running in WSO2 Cloud by configuring your connector",
    [DevantConnectionFlow.IMPORT_INTERNAL_OTHER_SELECT_BI_CONNECTOR]:
        "Connect to service running in WSO2 Cloud by configuring your connector",
    [DevantConnectionFlow.IMPORT_THIRD_PARTY_OAS]:
        "Connect to Third-Party REST API service by creating and mapping configurations",
    [DevantConnectionFlow.IMPORT_THIRD_PARTY_OTHER]:
        "Connect to Third-Party service by creating and mapping configurations",
    [DevantConnectionFlow.IMPORT_THIRD_PARTY_OTHER_SELECT_BI_CONNECTOR]:
        "Connect to Third-Party service by configuring your connector",
    [DevantConnectionFlow.IMPORT_DATABASE_PERSIST]:
        "Connect with a database provisioned in WSO2 Cloud using existing connection",
    [DevantConnectionFlow.IMPORT_THIRD_PARTY_PERSIST]: "Connect with a external database using existing connection",
};

export enum DevantConnectionFlowStep {
    VIEW_SWAGGER = "Connection Details",
    INIT_DEVANT_INTERNAL_OAS_CONNECTOR = "Create Connection",
    SELECT_BI_CONNECTOR = "Select Connector",
    INIT_CONNECTOR = "Initialize Connector",
    SELECT_OR_CREATE_BI_CONNECTOR = "Select or Create Connector",
    UPLOAD_OAS = "Upload Specification",
    PERSIST_CONFIG = "Introspect Database",
    PERSIST_SELECT_TABLES = "Select Tables",
    PERSIST_CREATE_CONNECTION = "Create Database Connection",
}

export const DEVANT_CONNECTION_FLOWS_STEPS: Partial<Record<DevantConnectionFlow, DevantConnectionFlowStep[]>> = {
    // Connection creation flow steps
    [DevantConnectionFlow.CREATE_INTERNAL_OAS]: [
        DevantConnectionFlowStep.VIEW_SWAGGER,
        DevantConnectionFlowStep.INIT_DEVANT_INTERNAL_OAS_CONNECTOR,
    ],
    [DevantConnectionFlow.CREATE_INTERNAL_OTHER]: [DevantConnectionFlowStep.INIT_CONNECTOR],
    [DevantConnectionFlow.CREATE_INTERNAL_OTHER_SELECT_BI_CONNECTOR]: [
        DevantConnectionFlowStep.SELECT_BI_CONNECTOR,
        DevantConnectionFlowStep.INIT_CONNECTOR,
    ],
    [DevantConnectionFlow.CREATE_THIRD_PARTY_OAS]: [
        DevantConnectionFlowStep.VIEW_SWAGGER,
        DevantConnectionFlowStep.INIT_CONNECTOR,
    ],
    [DevantConnectionFlow.CREATE_THIRD_PARTY_OTHER]: [DevantConnectionFlowStep.INIT_CONNECTOR],
    [DevantConnectionFlow.CREATE_THIRD_PARTY_OTHER_SELECT_BI_CONNECTOR]: [
        DevantConnectionFlowStep.SELECT_BI_CONNECTOR,
        DevantConnectionFlowStep.INIT_CONNECTOR,
    ],
    [DevantConnectionFlow.REGISTER_CREATE_THIRD_PARTY_FROM_BI_CONNECTOR]: [DevantConnectionFlowStep.INIT_CONNECTOR],
    [DevantConnectionFlow.REGISTER_CREATE_THIRD_PARTY_FROM_OAS]: [
        DevantConnectionFlowStep.UPLOAD_OAS,
        DevantConnectionFlowStep.INIT_CONNECTOR,
    ],
    [DevantConnectionFlow.CREATE_THIRD_PARTY_PERSIST]: [
        DevantConnectionFlowStep.PERSIST_CONFIG,
        DevantConnectionFlowStep.PERSIST_SELECT_TABLES,
        DevantConnectionFlowStep.PERSIST_CREATE_CONNECTION,
    ],
    [DevantConnectionFlow.CREATE_DATABASE_PERSIST]: [
        DevantConnectionFlowStep.PERSIST_CONFIG,
        DevantConnectionFlowStep.PERSIST_SELECT_TABLES,
        DevantConnectionFlowStep.PERSIST_CREATE_CONNECTION,
    ],
    [DevantConnectionFlow.CREATE_DATABASE_PERSIST_DB_SELECTED]: [
        DevantConnectionFlowStep.PERSIST_SELECT_TABLES,
        DevantConnectionFlowStep.PERSIST_CREATE_CONNECTION,
    ],
    // Connection importing flow steps
    [DevantConnectionFlow.IMPORT_INTERNAL_OAS]: [DevantConnectionFlowStep.VIEW_SWAGGER],
    [DevantConnectionFlow.IMPORT_INTERNAL_OTHER]: [DevantConnectionFlowStep.INIT_CONNECTOR],
    [DevantConnectionFlow.IMPORT_INTERNAL_OTHER_SELECT_BI_CONNECTOR]: [
        DevantConnectionFlowStep.SELECT_BI_CONNECTOR,
        DevantConnectionFlowStep.INIT_CONNECTOR,
    ],
    [DevantConnectionFlow.IMPORT_THIRD_PARTY_OAS]: [
        DevantConnectionFlowStep.VIEW_SWAGGER,
        DevantConnectionFlowStep.INIT_CONNECTOR,
    ],
    [DevantConnectionFlow.IMPORT_THIRD_PARTY_OTHER]: [DevantConnectionFlowStep.INIT_CONNECTOR],
    [DevantConnectionFlow.IMPORT_THIRD_PARTY_OTHER_SELECT_BI_CONNECTOR]: [
        DevantConnectionFlowStep.SELECT_BI_CONNECTOR,
        DevantConnectionFlowStep.INIT_CONNECTOR,
    ],
    [DevantConnectionFlow.IMPORT_THIRD_PARTY_PERSIST]: [
        DevantConnectionFlowStep.PERSIST_SELECT_TABLES,
        DevantConnectionFlowStep.PERSIST_CREATE_CONNECTION,
    ],
    [DevantConnectionFlow.IMPORT_DATABASE_PERSIST]: [
        DevantConnectionFlowStep.PERSIST_SELECT_TABLES,
        DevantConnectionFlowStep.PERSIST_CREATE_CONNECTION,
    ],
};

export enum DevantConnectionType {
    INTERNAL = "INTERNAL",
    THIRD_PARTY = "THIRD_PARTY",
    DATABASE = "DATABASE",
}

/**
 * Generates a unique name that doesn't exist in either biConnectorNames or devantConnectorNames.
 * If the candidate name exists, appends a numeric suffix and tries again.
 *
 * @param biConnectorNames - Array of existing BI connector names
 * @param devantConnectorNames - Array of existing Devant connector names
 * @param candidateName - The initial name to try
 * @returns A unique name that doesn't conflict with existing names
 */
export const generateInitialConnectionName = (
    biConnectorNames: string[],
    devantConnectorNames: string[],
    candidateName: string,
): string => {
    // Create a Set of all existing names (case-insensitive) for O(1) lookup
    const existingNames = new Set<string>([
        ...biConnectorNames,
        ...devantConnectorNames,
        ...devantConnectorNames.map((name) => name.replaceAll("-", "_")),
    ]);

    const newCandidateName = candidateName?.replaceAll(" ", "_").replaceAll("-", "_") || "my_connection";
    let uniqueName = newCandidateName;
    let counter = 1;

    // Keep incrementing counter until we find a unique name
    while (existingNames.has(uniqueName)) {
        uniqueName = `${newCandidateName}${counter}`;
        counter++;
    }

    return uniqueName;
};

export const isValidDevantConnName = (value: string, devantConnNames: string[], biConnNames: string[], isImporting: boolean) => {
    // Check minimum length
    if (!value) {
        return "Connection name is required";
    }
    if (value.length < 3) {
        return "Connection name must be at least 3 characters long";
    }

    if (value.length > 50) {
        return "Connection Name is too long";
    }

    // Check for valid format: alphanumeric and underscores only, can't start with number
    const validNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!validNameRegex.test(value)) {
        if (/^[0-9]/.test(value)) {
            return "Connection name cannot start with a number";
        }
        return "Connection name can only contain letters, numbers, and underscores";
    }

    // Check for duplicates in Devant connections
    if (!isImporting && devantConnNames?.some((conn) => conn === value)) {
        return "A WSO2 Cloud connection with this name already exists";
    }

    // Check for duplicates in BI connections
    if (biConnNames?.some((conn) => conn === value)) {
        return "Duplicate connection name";
    }
};

export const getKnownAvailableNode = (categories: Category[], org: string, module: string) => {
    const networkConnectors = categories?.find((item) => item.metadata.label === "Network");
    const matchingNode = networkConnectors?.items?.find(
        (item) => (item as AvailableNode).codedata?.org === org && (item as AvailableNode).codedata?.module === module,
    );
    return matchingNode as AvailableNode | undefined;
};

/** Builds PropertyModel map from fieldValues for connector wizard RPC */
export const buildDbPropertiesFromFieldValues = (
    connectorCredentials: NonNullable<IntrospectCredentialsResponse["data"]>,
    fieldValues: Record<string, string>,
): { [key: string]: PropertyModel } => {
    const props = connectorCredentials?.properties ?? {};
    const result: { [key: string]: PropertyModel } = {};
    for (const [key, prop] of Object.entries(props)) {
        const label = prop.metadata?.label || "";
        const value = label in fieldValues ? fieldValues[label] : ((prop.value as string) ?? "");
        result[key] = { ...prop, value };
    }
    return result;
}

/** Extracts host, port, etc. from fieldValues for createDevantConnection */
export const fieldValuesToDbConfig = (fv: Record<string, string>) => {
    const get = (keys: string[]) => keys.map((k) => fv[k]).find(Boolean) ?? "";
    return {
        host: get(["Host", "Host Name", "host", "HostName"]),
        port: Number(get(["Port", "port"])) || 3306,
        username: get(["User", "Username", "user"]),
        password: get(["Password", "password"]),
        databaseName: get(["Database", "Database Name", "database", "DatabaseName", "db"]),
    };
};

/** Maps simple credential object to connector wizard fieldValues by matching property labels */
export const dbCredentialsToFieldValues = (
    connectorCredentials: NonNullable<IntrospectCredentialsResponse["data"]>,
    creds: {
        host: string;
        port: number;
        databaseName: string;
        username: string;
        password: string;
        databaseType: string;
    },
): Record<string, string> =>{
    const props = connectorCredentials.properties || {};
    const result: Record<string, string> = {};
    const dbSystemLabel = Object.values(props).find((p) => {
        const l = (p.metadata?.label || "").toLowerCase();
        return l.includes("database system") || l.includes("db system");
    })?.metadata?.label;
    const portLabel = Object.values(props).find((p) => (p.metadata?.label || "").toLowerCase() === "port")?.metadata
        ?.label;
    const hostLabel = Object.values(props).find((p) => (p.metadata?.label || "").toLowerCase().includes("host"))
        ?.metadata?.label;
    const dbLabel = Object.values(props).find((p) => {
        const l = (p.metadata?.label || "").toLowerCase();
        return l === "database" || l === "database name";
    })?.metadata?.label;
    const userLabel = Object.values(props).find((p) => {
        const l = (p.metadata?.label || "").toLowerCase();
        return l === "user" || l === "username";
    })?.metadata?.label;
    const pwdLabel = Object.values(props).find((p) => (p.metadata?.label || "").toLowerCase().includes("password"))
        ?.metadata?.label;

    Object.values(props).forEach((prop) => {
        const label = prop.metadata?.label || "";
        if (label && !result[label]) {
            if (dbSystemLabel && label === dbSystemLabel) {
                result[label] = creds.databaseType?.toLowerCase().includes("postgres") ? "postgresql" : "mysql";
            } else if (portLabel && label === portLabel) {
                result[label] = String(creds.port ?? 3306);
            } else if (hostLabel && label === hostLabel) {
                result[label] = creds.host ?? "";
            } else if (dbLabel && label === dbLabel) {
                result[label] = creds.databaseName ?? "";
            } else if (userLabel && label === userLabel) {
                result[label] = creds.username ?? "";
            } else if (pwdLabel && label === pwdLabel) {
                result[label] = creds.password ?? "";
            } else {
                result[label] = (prop.value as string) ?? "";
            }
        }
    });
    return result;
}

// Devant "service -> connection params" helpers, shared by the connection form and the KB flow.
export const getPossibleVisibilities = (marketplaceItem: MarketplaceItem, project: Project) => {
    const { connectionSchemas = [], visibility: visibilities = [] } = marketplaceItem ?? {};
    const filteredVisibilities = visibilities.filter((item) => {
        if (item === ServiceInfoVisibilityEnum.Project) {
            return marketplaceItem.projectId === project.id;
        }
        return item;
    });
    /**
     * There can be services with multiple visibilities but only with one schema.
     * [PROJECT, ORGANIZATION] => Default OAuth Connection - Organization
     *
     * In this case, the visibilities should be filtered to only include the one that matches the schema.
     * If the schema is Unsecured, include only Organization and Public;
     * else include only the visibilities that match the schema name.
     */
    if (connectionSchemas.length === 1 && filteredVisibilities.length > 1) {
        return filteredVisibilities.filter((v) => {
            const connectionSchemaName = connectionSchemas[0].name.toLowerCase();
            if (connectionSchemaName.includes("Unsecured".toLowerCase())) {
                return v === ServiceInfoVisibilityEnum.Organization || v === ServiceInfoVisibilityEnum.Public;
            }
            return connectionSchemaName.includes(v.toLowerCase());
        });
    }
    return filteredVisibilities;
};

export const getInitialVisibility = (item: MarketplaceItem, visibilities: string[] = []) => {
    if (item?.isThirdParty) {
        return ServiceInfoVisibilityEnum.Public;
    }
    if (visibilities.includes(ServiceInfoVisibilityEnum.Project)) {
        return ServiceInfoVisibilityEnum.Project;
    }
    if (visibilities.includes(ServiceInfoVisibilityEnum.Organization)) {
        return ServiceInfoVisibilityEnum.Organization;
    }
    return ServiceInfoVisibilityEnum.Public;
};

export const getPossibleSchemas = (
    item: MarketplaceItem,
    selectedVisibility: string,
    connectionSchemas: MarketplaceItemSchema[] = [],
) => {
    if (!item) {
        return [];
    }
    // If third party, return schemas without filtering
    if (item.isThirdParty) {
        return item.connectionSchemas;
    }
    // Filter schemas based on the selected visibility:
    // organization/public can have OAuth2, api key or unauthenticated; project can have only project.
    const schemasFiltered = connectionSchemas.filter((schema) => {
        if (
            selectedVisibility.toLowerCase().includes("organization") ||
            selectedVisibility.toLowerCase().includes("public")
        ) {
            return (
                schema.name.toLowerCase().includes(selectedVisibility.toLowerCase()) ||
                schema.name.toLowerCase().includes("unsecured")
            );
        }
        return schema.name.toLowerCase().includes("project");
    });
    return schemasFiltered;
};
