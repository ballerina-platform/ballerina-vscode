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

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import type { Component, DbCredentials, DbServer, EndpointLink, EndpointResources, EnvVarGroup } from "@wso2/wso2-cloud-client";
import { DATABASE_CONNECTION_VARS, SERVICE_CONNECTION_VARS, connectionVarName, connectionVarSuffix } from "@wso2/wso2-cloud-client";
import type {
    ConnectionDetailed,
    ConnectionListItem,
    DatabaseAdminCredential,
    DatabaseServer,
    MarketplaceItem,
    MarketplaceItemSchema,
} from "@wso2/wso2-platform-core";

/**
 * The env-var suffixes WSO2 Integrator writes for a database connection (each
 * prefixed with the connection's name), keyed by the entry names the screens
 * use: the database form matches a created connection's entries to its
 * configurables by these ids.
 */
export const DATABASE_CONNECTION_KEYS: Record<string, string> = DATABASE_CONNECTION_VARS;

/** The env-var suffixes WSO2 Integrator writes for a service connection; the entry names are what the OpenAPI connection flow looks up. */
export const SERVICE_CONNECTION_KEYS: Record<string, string> = SERVICE_CONNECTION_VARS;

const DATABASE_SUFFIXES = Object.values(DATABASE_CONNECTION_KEYS);
const SERVICE_SUFFIXES = Object.values(SERVICE_CONNECTION_KEYS);

const SENSITIVE_ENTRIES = new Set(["Password", "ChoreoAPIKey"]);

const SERVICE_ID_PREFIX = "svc:";
const DATABASE_ID_PREFIX = "db:";
const CONNECTION_ID_PREFIX = "conn:";
const LINK_ID_PREFIX = "link:";

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

/** A connection inside the project: the configurable the platform fills with an endpoint's address. */
export interface LinkConnectionRef {
    integration: string;
    configurable: string;
    name: string;
}

/** The connection id of an endpoint link: `link:<integration>/<configurable>/<connection>`. */
export function linkConnectionId(ref: LinkConnectionRef): string {
    return `${LINK_ID_PREFIX}${encodeURIComponent(ref.integration)}/${encodeURIComponent(ref.configurable)}/${encodeURIComponent(ref.name)}`;
}

export function parseLinkConnectionId(id: string | undefined): LinkConnectionRef | undefined {
    if (!id?.startsWith(LINK_ID_PREFIX)) {
        return undefined;
    }
    const parts = id.slice(LINK_ID_PREFIX.length).split("/").map(decodeURIComponent);
    if (parts.length !== 3 || parts.some((part) => !part)) {
        return undefined;
    }
    return { integration: parts[0], configurable: parts[1], name: parts[2] };
}

/** The id the platform knows a configurable of a package's root module by: `<org>/<package>:<name>`. */
export function configurableId(org: string, packageName: string, name: string): string {
    return `${org}/${packageName}:${name}`;
}

/**
 * The connections `.wso2/component.yaml` records that an endpoint link of the
 * integration stands for. The platform keeps no connection name on a link, so
 * a connection is matched to a link by the endpoint both name, each link to
 * one connection; `skip` names connections already listed another way. With
 * two connections to one endpoint the pairing is arbitrary, which is fine for
 * display; deleting one finds its link by the configurable its code reads.
 */
export function endpointLinkConnections(
    links: EndpointLink[],
    localRefs: Map<string, string>,
    ref: { project: string; integration: string },
    skip: Set<string> = new Set(),
): ConnectionListItem[] {
    const unclaimed = [...links];
    const items: ConnectionListItem[] = [];
    for (const [name, refServiceId] of localRefs) {
        const target = parseServiceId(refServiceId);
        if (skip.has(name) || !target || target.project !== ref.project) {
            continue;
        }
        const index = unclaimed.findIndex((link) => link.component === target.integration && link.endpoint === target.endpoint);
        if (index < 0) {
            continue;
        }
        const [link] = unclaimed.splice(index, 1);
        items.push(linkToConnectionListItem({ integration: ref.integration, configurable: link.configurable, name }, refServiceId));
    }
    return items;
}

/**
 * The one link whose configurable `source` (a connection's code) reads by name,
 * or undefined when none or more than one does.
 */
export function endpointLinkReferencedBy(links: EndpointLink[], source: string): EndpointLink | undefined {
    const referenced = links.filter((link) => {
        const name = link.configurable.slice(link.configurable.lastIndexOf(":") + 1);
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // A whole identifier, optionally quoted ('name), not a part of a longer one such as ServiceURL1.
        return !!name && new RegExp(`(?<![\\w'])'?${escaped}(?![\\w])`).test(source);
    });
    return referenced.length === 1 ? referenced[0] : undefined;
}

export function linkToConnectionListItem(ref: LinkConnectionRef, serviceId = ""): ConnectionListItem {
    return {
        name: ref.name,
        description: "",
        groupUuid: linkConnectionId(ref),
        serviceName: ref.name,
        serviceId,
        schemaName: serviceSchema("project").name,
        schemaReference: schemaIdFor("SERVICE", "project"),
        isPartiallyCreated: false,
        status: {},
        componentId: ref.integration,
        dependentComponentId: "",
        version: "",
        resourceType: "SERVICE",
    };
}

/** An endpoint link as a detailed connection: its one entry is the URL, which the platform fills in every environment. */
export function linkToConnectionDetailed(ref: LinkConnectionRef, serviceId = ""): ConnectionDetailed {
    const envVar = connectionVarName(ref.name, SERVICE_CONNECTION_KEYS.ServiceURL);
    return {
        ...linkToConnectionListItem(ref, serviceId),
        configurations: {
            "": {
                environmentUuid: "",
                entries: {
                    ServiceURL: { key: "ServiceURL", keyUuid: envVar, value: "", isSensitive: false, isFile: false, envVariableName: envVar, valueRef: envVar },
                },
            },
        },
        envMapping: {},
        visibilities: [],
    };
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

/** How a service connection reaches its target: inside the project with no key, or through the gateway with an API key. */
export type ServiceConnectionAccess = "project" | "gateway";

/** The schema of a service connection with `access`; the visualizer offers `project` for Project access and `gateway` otherwise. */
function serviceSchema(access: ServiceConnectionAccess): MarketplaceItemSchema {
    const project = access === "project";
    return {
        id: project ? "project-url" : "api-key",
        name: project ? "Project URL" : "API Key",
        description: project
            ? "The endpoint's in-cluster URL, reachable without a key from the same project"
            : "The URL the gateway serves the endpoint's API at, and an API key issued for this integration",
        isDefault: true,
        entries: serviceKeysFor(access).map((name) => ({
            name,
            type: "string",
            isSensitive: SENSITIVE_ENTRIES.has(name),
            isOptional: false,
        })),
    };
}

function serviceKeysFor(access: ServiceConnectionAccess): string[] {
    return access === "project" ? ["ServiceURL"] : Object.keys(SERVICE_CONNECTION_KEYS);
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

/**
 * What a service is called: its integration, then its endpoint. An endpoint named after a path with no
 * words in it (`/`, as a Ballerina service on the root path is) adds nothing, so it is left out.
 */
function serviceName(integration: Component, endpoint: EndpointResources): string {
    const integrationName = integration.displayName || integration.name;
    const endpointName = endpoint.displayName || endpoint.name;
    return /[A-Za-z0-9]/.test(endpointName ?? "") ? `${integrationName} / ${endpointName}` : integrationName;
}

/** An endpoint another integration exposes, as a marketplace service. */
export function endpointToMarketplaceItem(project: string, integration: Component, environment: string, endpoint: EndpointResources, orgHandle: string): MarketplaceItem {
    const visibility = (endpoint.visibility ?? ["project"]).map((v) => VISIBILITY[v]).filter((v): v is MarketplaceItem["visibility"][number] => !!v);
    return {
        serviceId: serviceId({ project, integration: integration.id, endpoint: endpoint.name }),
        resourceId: endpoint.name,
        name: serviceName(integration, endpoint),
        version: environment,
        status: "PUBLISHED",
        serviceType: SERVICE_TYPE[(endpoint.type ?? "").toLowerCase()] ?? "REST",
        resourceType: "SERVICE",
        organizationId: orgHandle,
        projectId: project,
        component: { componentId: integration.id, endpointId: endpoint.name, apimId: "" },
        // An API key exists only for an endpoint exposed through the gateway (organization or public visibility).
        connectionSchemas: visibility.some((v) => v !== "PROJECT") ? [serviceSchema("project"), serviceSchema("gateway")] : [serviceSchema("project")],
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
    const suffixes = new Set(
        (group.keys ?? Object.keys(group.data ?? {})).map((key) => connectionVarSuffix(key, [...DATABASE_SUFFIXES, ...SERVICE_SUFFIXES])),
    );
    if (suffixes.has(DATABASE_CONNECTION_KEYS.HostName) && suffixes.has(DATABASE_CONNECTION_KEYS.Password)) {
        return "DATABASE";
    }
    if (suffixes.has(SERVICE_CONNECTION_KEYS.ServiceURL)) {
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
        schemaReference: schemaIdFor(resourceType, accessOf(group)),
        isPartiallyCreated: false,
        status: {},
        componentId: ref.integration,
        dependentComponentId: "",
        version: "",
        resourceType,
    };
}

/** The id of the schema the adapters publish for a kind of connection; none for a plain config group. */
export function schemaIdFor(resourceType: "DATABASE" | "SERVICE" | "CONFIG", access: ServiceConnectionAccess = "gateway"): string {
    return resourceType === "DATABASE" ? databaseSchema().id : resourceType === "SERVICE" ? serviceSchema(access).id : "";
}

/** A service connection's group carries an API key only when it goes through the gateway. */
function accessOf(group: Pick<EnvVarGroup, "keys" | "data">): ServiceConnectionAccess {
    const keys = group.keys ?? Object.keys(group.data ?? {});
    return keys.some((key) => connectionVarSuffix(key, SERVICE_SUFFIXES) === SERVICE_CONNECTION_KEYS.ChoreoAPIKey) ? "gateway" : "project";
}

/**
 * A group as a detailed connection. Sensitive values read back empty on the
 * platform, so the screens see which keys exist, never their secret values.
 */
export function envGroupToConnectionDetailed(group: EnvVarGroup, ref: Omit<ConnectionRef, "name">): ConnectionDetailed {
    const item = envGroupToConnectionListItem(group, ref);
    const keys = group.keys ?? Object.keys(group.data ?? {});
    const resourceType = resourceTypeOf(group);
    const entryNames = entryNamesFor(resourceType);
    const suffixes = resourceType === "DATABASE" ? DATABASE_SUFFIXES : resourceType === "SERVICE" ? SERVICE_SUFFIXES : [];
    const entries: ConnectionDetailed["configurations"][string]["entries"] = {};
    for (const key of keys) {
        const suffix = connectionVarSuffix(key, suffixes);
        const entryName = (suffix && entryNames[suffix]) || key;
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

/** Entry name by env-var suffix, for the kind of connection. */
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
    /** For a service connection; `gateway` when omitted. */
    access?: ServiceConnectionAccess;
    /** For a connection inside the project: the configurable (`<org>/<package>:<name>`) the platform fills. */
    configurable?: string;
}): ConnectionDetailed {
    const access = params.access ?? "gateway";
    const keys =
        params.kind === "DATABASE"
            ? DATABASE_CONNECTION_KEYS
            : Object.fromEntries(serviceKeysFor(access).map((entry) => [entry, SERVICE_CONNECTION_KEYS[entry]]));
    const configurations: ConnectionDetailed["configurations"] = {};
    for (const environment of params.environments) {
        const entries: ConnectionDetailed["configurations"][string]["entries"] = {};
        for (const [entryName, suffix] of Object.entries(keys)) {
            const envVar = connectionVarName(params.name, suffix);
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
        groupUuid: params.configurable
            ? linkConnectionId({ integration: params.integration, configurable: params.configurable, name: params.name })
            : connectionId({ integration: params.integration, environment: params.environments[0] ?? "", name: params.name }),
        serviceName: params.name,
        serviceId: params.serviceId,
        schemaName: params.kind === "DATABASE" ? "Database Credentials" : serviceSchema(access).name,
        schemaReference: schemaIdFor(params.kind, access),
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

/**
 * The connections `.wso2/component.yaml` records for an integration directory:
 * the service id of each, by connection name, or an empty string when its
 * reference names no service the screens know.
 */
export function localConnectionServiceIds(componentDir: string | undefined): Map<string, string> {
    const ids = new Map<string, string>();
    if (!componentDir) {
        return ids;
    }
    const file = path.join(componentDir, ".wso2", "component.yaml");
    if (!fs.existsSync(file)) {
        return ids;
    }
    try {
        const content = yaml.load(fs.readFileSync(file, "utf8")) as { dependencies?: { connectionReferences?: { name?: string; resourceRef?: string }[] } } | undefined;
        for (const ref of content?.dependencies?.connectionReferences ?? []) {
            if (ref.name) {
                ids.set(ref.name, serviceIdOfResourceRef(ref.resourceRef) ?? "");
            }
        }
    } catch (err) {
        console.warn(`Could not read ${file}: ${err}`);
    }
    return ids;
}

/** `database:<server>` and `service:<project>/<integration>/<endpoint>` as the marketplace ids the screens use. */
export function serviceIdOfResourceRef(resourceRef: string | undefined): string | undefined {
    if (!resourceRef) {
        return undefined;
    }
    if (resourceRef.startsWith("database:")) {
        return databaseId(resourceRef.slice("database:".length));
    }
    if (resourceRef.startsWith("service:")) {
        // The endpoint is everything after the integration: a root-path service's endpoint is named "/".
        const [project, integration, ...rest] = resourceRef.slice("service:".length).split("/");
        const endpoint = rest.join("/");
        return project && integration && endpoint ? serviceId({ project, integration, endpoint }) : undefined;
    }
    return undefined;
}
