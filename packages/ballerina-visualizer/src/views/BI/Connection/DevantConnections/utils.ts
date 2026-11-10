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
import { connectionVarPrefix } from "@wso2/wso2-cloud-client/contract";
import styled from "@emotion/styled";

export const ProgressWrap = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 40px;
`;

// Devant tags knowledge base services with this tag.
export const KB_SERVICE_TAG = "knowledge-base-as-service";
export const INTERNAL_SERVICES = "internal-services";
export const isKnowledgeBaseService = (item: MarketplaceItem) => item.tags?.includes(KB_SERVICE_TAG) ?? false;

// The filter tabs on the WSO2 Cloud connections list.
export type ConnectionFilterType = "all" | "internal-services" | "third-party-services" | "databases";

/**
 * Filters marketplace items for the connections list: drops knowledge base services (they belong
 * under "Add Knowledge Base"), applies the internal-services component filter, and trims to the
 * page size. Order is preserved. The list is over-fetched because knowledge base services can only
 * be excluded client-side, so trimming keeps the visible count independent of how many KBs are in
 * the fetched page.
 */
export function filterConnectionMarketplaceItems(
    items: MarketplaceItem[],
    filterType: ConnectionFilterType,
    selectedComponentId: string | undefined,
    pageSize: number,
): MarketplaceItem[] {
    return items
        .filter((item) => {
            if (isKnowledgeBaseService(item)) {
                return false;
            }
            if (filterType === INTERNAL_SERVICES && selectedComponentId) {
                return item.component?.componentId !== selectedComponentId;
            }
            return true;
        })
        .slice(0, pageSize);
}

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

// Ballerina keywords a service could be named after; a connection's variable cannot take one as its name.
const BALLERINA_RESERVED_WORDS = new Set([
    "any", "anydata", "as", "boolean", "break", "byte", "check", "checkpanic", "class", "client", "commit",
    "configurable", "const", "continue", "decimal", "distinct", "do", "else", "enum", "error", "fail", "false",
    "final", "float", "foreach", "fork", "from", "function", "future", "handle", "if", "import", "in", "int",
    "is", "isolated", "json", "let", "listener", "lock", "map", "match", "never", "new", "null", "object",
    "panic", "private", "public", "readonly", "record", "remote", "resource", "retry", "return", "returns",
    "rollback", "service", "start", "stream", "string", "table", "transaction", "transactional", "trap",
    "true", "type", "typedesc", "typeof", "var", "wait", "where", "while", "worker", "xml",
]);

/**
 * A connection name `isValidDevantConnName` accepts, made from a service's name: anything but letters,
 * digits and underscores becomes one underscore (`Orders / v1` → `Orders_v1`), and a name too short to
 * keep falls back to `my_connection`. Capped at 45 characters, leaving room for the counter
 * `generateInitialConnectionName` adds under the 50 the validator allows.
 */
export const toConnectionName = (candidateName: string | undefined): string => {
    const cleaned = (candidateName ?? "").replace(/[^A-Za-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
    const name = /^[0-9]/.test(cleaned) ? `c_${cleaned}` : cleaned;
    if (name.length < 3) {
        return "my_connection";
    }
    const capped = name.slice(0, 45);
    return BALLERINA_RESERVED_WORDS.has(capped) ? `${capped}_conn` : capped;
};

/**
 * Generates a unique name that doesn't exist in biConnectorNames and doesn't write the env vars of
 * one in devantConnectorNames.
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
    const biNames = new Set<string>(biConnectorNames);
    // Cloud connections clash by the env-var prefix they write, not by name: `Orders` and `orders` both write ORDERS_*.
    const cloudVarPrefixes = new Set<string>(devantConnectorNames.map(connectionVarPrefix));
    const isTaken = (name: string) => biNames.has(name) || cloudVarPrefixes.has(connectionVarPrefix(name));

    const newCandidateName = toConnectionName(candidateName);
    let uniqueName = newCandidateName;
    let counter = 1;

    // Keep incrementing counter until we find a unique name
    while (isTaken(uniqueName)) {
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

    // Check for duplicates in Devant connections, by the env-var prefix each writes (`Orders` and `orders` both write ORDERS_*)
    const varPrefix = connectionVarPrefix(value);
    if (!isImporting && devantConnNames?.some((conn) => connectionVarPrefix(conn) === varPrefix)) {
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
/** Only the project's id is read, so a v2 project (WSO2 Cloud) serves as well as a v1 one. */
export const getPossibleVisibilities = (marketplaceItem: MarketplaceItem, project?: Pick<Project, "id">) => {
    const { visibility: visibilities = [] } = marketplaceItem ?? {};
    return visibilities.filter((item) => item !== ServiceInfoVisibilityEnum.Project || (!!project?.id && marketplaceItem.projectId === project.id));
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

/** The schema of a WSO2 Cloud service connection with Project access: the endpoint's address, which the platform fills, and no key. */
export const PROJECT_URL_SCHEMA_ID = "project-url";

/** The entry of a service connection that holds its URL. */
export const SERVICE_URL_ENTRY = "ServiceURL";

/** The configurable made for a connection's URL, by the entry it was made for. */
export const serviceUrlConfigName = (configs: { id: string; name: string }[] | undefined): string | undefined =>
    configs?.find((config) => config.id === SERVICE_URL_ENTRY)?.name;

/** The entry of a service connection that holds its API key, for a service of another project. */
export const API_KEY_ENTRY = "ChoreoAPIKey";

/** The configurable made for a connection's API key, by the entry it was made for. */
export const apiKeyConfigName = (configs: { id: string; name: string }[] | undefined): string | undefined =>
    configs?.find((config) => config.id === API_KEY_ENTRY)?.name;

/**
 * The schemas offered for an access mode. A WSO2 Cloud service of the project is reached directly under Project
 * access, and one of another project through the gateway, with an API key; a database has one schema.
 */
export const getPossibleSchemas = (item: MarketplaceItem | undefined, visibility: string): MarketplaceItemSchema[] => {
    const schemas = item?.connectionSchemas ?? [];
    if (item?.resourceType !== "SERVICE" || item.isThirdParty) {
        return schemas;
    }
    const project = visibility === ServiceInfoVisibilityEnum.Project;
    return schemas.filter((schema) => (schema.id === PROJECT_URL_SCHEMA_ID) === project);
};

/**
 * The access a new connection to a service starts with, and the schema that access takes. Forms with no access
 * choice use this for both the configurables and the connection, so a gateway connection gets its API key's one.
 */
export const getInitialAccess = (item: MarketplaceItem, project?: Pick<Project, "id">) => {
    const visibility = getInitialVisibility(item, getPossibleVisibilities(item, project));
    return { visibility, schema: getPossibleSchemas(item, visibility)[0] as MarketplaceItemSchema | undefined };
};

/** The schema of a WSO2 Cloud service connection through the gateway: the API's URL and an API key. */
export const API_KEY_SCHEMA_ID = "api-key";

/** The security the generated client is created with, from the connection's schema. */
export const securityTypeOf = (connection: { schemaName?: string; schemaReference?: string } | undefined): "" | "oauth" | "apikey" => {
    if (connection?.schemaName?.toLowerCase().includes("oauth")) {
        return "oauth";
    }
    return connection?.schemaReference === API_KEY_SCHEMA_ID ? "apikey" : "";
};

/** An error's message; errors from the extension arrive as plain objects. */
export const errorMessageOf = (error: unknown): string =>
    typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : String(error);
