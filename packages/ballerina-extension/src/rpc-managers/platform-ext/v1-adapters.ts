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

/**
 * The connection screens were written against Choreo's marketplace and
 * connection objects. WSO2 Cloud has databases, exposed endpoints and
 * environment-variable groups instead, and no connection object yet. These
 * adapters present the platform's resources in the screens' vocabulary, so the
 * screens keep working for what the platform does offer; what it does not is
 * refused by the RPC manager with a message naming the gap.
 */

import type { Component, DbCredentials, DbServer, EndpointResources, EnvVarGroup } from "@wso2/wso2-cloud-client";
import type {
    ConnectionDetailed,
    ConnectionListItem,
    DatabaseAdminCredential,
    DatabaseServer,
    MarketplaceItem,
    MarketplaceItemSchema,
} from "@wso2/wso2-platform-core";

/**
 * The env-var names WSO2 Integrator writes for a database connection, keyed
 * by the entry names the screens use: the database form matches a created
 * connection's entries to its configurables by these ids.
 */
export const DATABASE_CONNECTION_KEYS: Record<string, string> = {
    HostName: "DB_HOST",
    Port: "DB_PORT",
    DatabaseName: "DB_NAME",
    Username: "DB_USER",
    Password: "DB_PASSWORD",
};

/** The env-var names WSO2 Integrator writes for a service connection; the entry names are what the OpenAPI connection flow looks up. */
export const SERVICE_CONNECTION_KEYS: Record<string, string> = {
    ServiceURL: "SERVICE_URL",
    ChoreoAPIKey: "API_KEY",
};

const SENSITIVE_ENTRIES = new Set(["Password", "ChoreoAPIKey"]);

const SERVICE_ID_PREFIX = "svc:";
const DATABASE_ID_PREFIX = "db:";
const CONNECTION_ID_PREFIX = "conn:";

export interface ServiceRef {
    project: string;
    integration: string;
    endpoint: string;
}

export interface ConnectionRef {
    integration: string;
    environment: string;
    name: string;
}

/** The marketplace id of an exposed endpoint: `svc:<project>/<integration>/<endpoint>`. */
export function serviceId(ref: ServiceRef): string {
    return `${SERVICE_ID_PREFIX}${encodeURIComponent(ref.project)}/${encodeURIComponent(ref.integration)}/${encodeURIComponent(ref.endpoint)}`;
}

export function parseServiceId(id: string | undefined): ServiceRef | undefined {
    if (!id?.startsWith(SERVICE_ID_PREFIX)) {
        return undefined;
    }
    const parts = id.slice(SERVICE_ID_PREFIX.length).split("/").map(decodeURIComponent);
    if (parts.length !== 3 || parts.some((part) => !part)) {
        return undefined;
    }
    return { project: parts[0], integration: parts[1], endpoint: parts[2] };
}

export function databaseId(serverId: string): string {
    return `${DATABASE_ID_PREFIX}${serverId}`;
}

export function parseDatabaseId(id: string | undefined): string | undefined {
    return id?.startsWith(DATABASE_ID_PREFIX) ? id.slice(DATABASE_ID_PREFIX.length) : undefined;
}

/** The connection id of an env-var group: `conn:<integration>/<environment>/<group>`. */
export function connectionId(ref: ConnectionRef): string {
    return `${CONNECTION_ID_PREFIX}${encodeURIComponent(ref.integration)}/${encodeURIComponent(ref.environment)}/${encodeURIComponent(ref.name)}`;
}

export function parseConnectionId(id: string | undefined): ConnectionRef | undefined {
    if (!id?.startsWith(CONNECTION_ID_PREFIX)) {
        return undefined;
    }
    const parts = id.slice(CONNECTION_ID_PREFIX.length).split("/").map(decodeURIComponent);
    if (parts.length !== 3 || parts.some((part) => !part)) {
        return undefined;
    }
    return { integration: parts[0], environment: parts[1], name: parts[2] };
}

/** What `.wso2/component.yaml` records a connection as pointing at. */
export function resourceRefOf(item: MarketplaceItem | undefined, name: string): string {
    if (item?.resourceType === "DATABASE") {
        return `database:${item.resourceDetails?.databaseServerId ?? item.resourceId}`;
    }
    const ref = parseServiceId(item?.serviceId);
    if (ref) {
        return `service:${ref.project}/${ref.integration}/${ref.endpoint}`;
    }
    return `connection:${name}`;
}

function databaseSchema(): MarketplaceItemSchema {
    return {
        id: "database-credentials",
        name: "Database Credentials",
        description: "Host, port, database, user and password of the managed PostgreSQL server",
        isDefault: true,
        entries: Object.keys(DATABASE_CONNECTION_KEYS).map((name) => ({
            name,
            type: "string",
            isSensitive: SENSITIVE_ENTRIES.has(name),
            isOptional: false,
        })),
    };
}

function serviceSchema(): MarketplaceItemSchema {
    return {
        id: "api-key",
        name: "API Key",
        description: "The endpoint's URL and an API key issued for this integration",
        isDefault: true,
        entries: Object.keys(SERVICE_CONNECTION_KEYS).map((name) => ({
            name,
            type: "string",
            isSensitive: SENSITIVE_ENTRIES.has(name),
            isOptional: false,
        })),
    };
}

const DB_STATUS: Record<DbServer["status"], MarketplaceItem["resourceDetails"]["status"]> = {
    ACTIVE: "ACTIVE",
    CREATING: "CREATING",
    DELETING: "DELETING",
    DELETED: "DELETED",
    ERROR: "ERROR",
};

export function dbServerToMarketplaceItem(server: DbServer, orgHandle: string): MarketplaceItem {
    return {
        serviceId: databaseId(server.id),
        resourceId: server.id,
        name: server.name,
        version: server.postgresVersion ?? "",
        status: "PUBLISHED",
        serviceType: "REST",
        resourceType: "DATABASE",
        organizationId: orgHandle,
        connectionSchemas: [databaseSchema()],
        thumbnailUrl: "",
        averageRating: 0,
        totalRatingCount: 0,
        createdTime: server.createdAt ?? "",
        visibility: ["ORGANIZATION"],
        isThirdParty: false,
        summary: server.statusMessage,
        resourceDetails: {
            databaseServerId: server.id,
            databaseServerName: server.name,
            databaseType: "postgres",
            status: DB_STATUS[server.status] ?? "ERROR",
            isRestricted: false,
            cloudProvider: "",
            cloudRegion: "",
            ca_certificate: "",
        },
    };
}

/** The v1 server shape the credential screens read `connection_params` from. */
export function dbServerToV1DatabaseServer(server: DbServer, credentials: DbCredentials): DatabaseServer {
    return {
        id: server.id,
        name: server.name,
        type: "postgres",
        status: server.status,
        created_at: server.createdAt ?? "",
        project_id: null,
        display_on_marketplace: true,
        is_vector_enabled: false,
        allowed_ips: { mode: "allow_all" },
        cloud_provider: "",
        cloud_region: "",
        connection_params: {
            host: credentials.host ?? "",
            port: credentials.port ?? "",
            database: credentials.database ?? "",
            user: credentials.username,
            password_reset: false,
            ssl_required: !!credentials.caCertificate,
        },
        maintenance: { day: "", time: "" },
        nodes: [],
        service_plan: {
            name: server.plan ?? "",
            node_count: server.nodeCount ?? 0,
            node_cpu_count: 0,
            node_ram_gb: 0,
            storage_gb: server.storageGi ?? 0,
            backup_interval_hours: 0,
            backup_retention_days: 0,
            hourly_price_usd: "",
            monthly_price_usd: "",
        },
        service_plan_id: server.plan ?? "",
        service_version: server.postgresVersion ?? "",
    };
}

export function dbCredentialsToAdminCredential(credentials: DbCredentials): DatabaseAdminCredential {
    return { name: credentials.username, password: credentials.password };
}

const VISIBILITY: Record<string, MarketplaceItem["visibility"][number]> = {
    project: "PROJECT",
    organization: "ORGANIZATION",
    public: "PUBLIC",
};

const SERVICE_TYPE: Record<string, MarketplaceItem["serviceType"]> = {
    graphql: "GRAPHQL",
    grpc: "GRPC",
    websocket: "ASYNC_API",
};

/** An endpoint another integration exposes, as a marketplace service. */
export function endpointToMarketplaceItem(project: string, integration: Component, environment: string, endpoint: EndpointResources, orgHandle: string): MarketplaceItem {
    const visibility = (endpoint.visibility ?? ["project"]).map((v) => VISIBILITY[v]).filter((v): v is MarketplaceItem["visibility"][number] => !!v);
    return {
        serviceId: serviceId({ project, integration: integration.id, endpoint: endpoint.name }),
        resourceId: endpoint.name,
        name: `${integration.displayName || integration.name} / ${endpoint.displayName || endpoint.name}`,
        version: environment,
        status: "PUBLISHED",
        serviceType: SERVICE_TYPE[(endpoint.type ?? "").toLowerCase()] ?? "REST",
        resourceType: "SERVICE",
        organizationId: orgHandle,
        projectId: project,
        component: { componentId: integration.id, endpointId: endpoint.name, apimId: "" },
        connectionSchemas: [serviceSchema()],
        thumbnailUrl: "",
        averageRating: 0,
        totalRatingCount: 0,
        createdTime: integration.createdAt,
        summary: endpoint.basePath,
        description: integration.description,
        visibility: visibility.length > 0 ? visibility : ["PROJECT"],
        isThirdParty: false,
    };
}

/** What an env-var group holds, judged by its keys. */
export function resourceTypeOf(group: Pick<EnvVarGroup, "keys" | "data">): "DATABASE" | "SERVICE" | "CONFIG" {
    const keys = new Set(group.keys ?? Object.keys(group.data ?? {}));
    if (keys.has(DATABASE_CONNECTION_KEYS.HostName) && keys.has(DATABASE_CONNECTION_KEYS.Password)) {
        return "DATABASE";
    }
    if (keys.has(SERVICE_CONNECTION_KEYS.ServiceURL)) {
        return "SERVICE";
    }
    return "CONFIG";
}

export function envGroupToConnectionListItem(group: EnvVarGroup, ref: Omit<ConnectionRef, "name">, serviceId = ""): ConnectionListItem {
    const name = group.name ?? "";
    const resourceType = resourceTypeOf(group);
    return {
        name,
        description: "",
        groupUuid: connectionId({ ...ref, name }),
        serviceName: name,
        serviceId,
        schemaName: group.sensitive ? "Sensitive" : "Plain",
        // The screens find the connection's schema by this id, and only then create its configurables.
        schemaReference: schemaIdFor(resourceType),
        isPartiallyCreated: false,
        status: {},
        componentId: ref.integration,
        dependentComponentId: "",
        version: "",
        resourceType,
    };
}

/** The id of the schema the adapters publish for a kind of connection; none for a plain config group. */
export function schemaIdFor(resourceType: "DATABASE" | "SERVICE" | "CONFIG"): string {
    return resourceType === "DATABASE" ? databaseSchema().id : resourceType === "SERVICE" ? serviceSchema().id : "";
}

/**
 * A group as a detailed connection. Sensitive values read back empty on the
 * platform, so the screens see which keys exist, never their secret values.
 */
export function envGroupToConnectionDetailed(group: EnvVarGroup, ref: Omit<ConnectionRef, "name">): ConnectionDetailed {
    const item = envGroupToConnectionListItem(group, ref);
    const keys = group.keys ?? Object.keys(group.data ?? {});
    const entryNames = entryNamesFor(resourceTypeOf(group));
    const entries: ConnectionDetailed["configurations"][string]["entries"] = {};
    for (const key of keys) {
        const entryName = entryNames[key] ?? key;
        entries[entryName] = {
            key: entryName,
            keyUuid: key,
            value: group.data?.[key] ?? "",
            isSensitive: group.sensitive,
            isFile: false,
            envVariableName: key,
            valueRef: key,
        };
    }
    return {
        ...item,
        configurations: { [ref.environment]: { environmentUuid: ref.environment, entries } },
        envMapping: {},
        visibilities: [],
    };
}

/** Entry name by env-var name, for the kind of connection. */
function entryNamesFor(resourceType: "DATABASE" | "SERVICE" | "CONFIG"): Record<string, string> {
    const source = resourceType === "DATABASE" ? DATABASE_CONNECTION_KEYS : resourceType === "SERVICE" ? SERVICE_CONNECTION_KEYS : {};
    return Object.fromEntries(Object.entries(source).map(([entry, envVar]) => [envVar, entry]));
}

/** The connection WSO2 Integrator just wrote, in the shape the config-replacement step reads env-var names from. */
export function createdConnection(params: {
    name: string;
    integration: string;
    environments: string[];
    kind: "DATABASE" | "SERVICE";
    serviceId: string;
}): ConnectionDetailed {
    const keys = params.kind === "DATABASE" ? DATABASE_CONNECTION_KEYS : SERVICE_CONNECTION_KEYS;
    const configurations: ConnectionDetailed["configurations"] = {};
    for (const environment of params.environments) {
        const entries: ConnectionDetailed["configurations"][string]["entries"] = {};
        for (const [entryName, envVar] of Object.entries(keys)) {
            entries[entryName] = {
                key: entryName,
                keyUuid: envVar,
                value: "",
                isSensitive: SENSITIVE_ENTRIES.has(entryName),
                isFile: false,
                envVariableName: envVar,
                valueRef: envVar,
            };
        }
        configurations[environment] = { environmentUuid: environment, entries };
    }
    return {
        name: params.name,
        description: "",
        groupUuid: connectionId({ integration: params.integration, environment: params.environments[0] ?? "", name: params.name }),
        serviceName: params.name,
        serviceId: params.serviceId,
        schemaName: params.kind === "DATABASE" ? "Database Credentials" : "API Key",
        schemaReference: schemaIdFor(params.kind),
        isPartiallyCreated: false,
        status: {},
        componentId: params.integration,
        dependentComponentId: "",
        version: "",
        resourceType: params.kind,
        configurations,
        envMapping: {},
        visibilities: [],
    };
}
