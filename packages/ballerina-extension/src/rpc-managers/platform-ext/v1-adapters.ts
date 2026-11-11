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
import type { Component, ConnectableEndpoint, DbCredentials, DbServer, EndpointLink, EndpointResources, EnvVarGroup } from "@wso2/wso2-cloud-client";
import { DATABASE_CONNECTION_VARS, SERVICE_CONNECTION_VARS, connectionVarName, connectionVarSuffix } from "@wso2/wso2-cloud-client";
import { MARKETPLACE_ITEM_UNAVAILABLE } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
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

/** The env vars a service connection's configurables read locally; the entry names are what the OpenAPI connection flow looks up. */
export const SERVICE_CONNECTION_KEYS: Record<string, string> = SERVICE_CONNECTION_VARS;

const DATABASE_SUFFIXES = Object.values(DATABASE_CONNECTION_KEYS);

/** The entry of a service connection's API key, in the schemas and in the forms' temporary configurables. */
export const API_KEY_ENTRY: keyof typeof SERVICE_CONNECTION_VARS = "APIKey";

const SENSITIVE_ENTRIES = new Set(["Password", API_KEY_ENTRY]);

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

/** A service connection: the URL configurable the platform fills from an endpoint. */
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
 * a connection is matched to the link that fills its URL by the endpoint both
 * name, each link to one connection; `skip` names connections already listed
 * another way. With two connections to one endpoint the pairing is arbitrary,
 * which is fine for display; deleting one finds its links by the
 * configurables its code reads.
 */
export function endpointLinkConnections(
    links: EndpointLink[],
    localRefs: Map<string, string>,
    ref: { project: string; integration: string },
    skip: Set<string> = new Set(),
): ConnectionListItem[] {
    const unclaimed = links.filter((link) => link.key === undefined || link.key === "url");
    // Without each connection's code, a key link is told apart only by its endpoint: each URL link claims one,
    // so a second connection to the endpoint made without a key isn't shown with one.
    const unclaimedKeys = links.filter((link) => link.key === "apiKey");
    const items: ConnectionListItem[] = [];
    for (const [name, refServiceId] of localRefs) {
        const target = parseServiceId(refServiceId);
        if (skip.has(name) || !target) {
            continue;
        }
        const index = unclaimed.findIndex(
            (link) => link.project === target.project && link.component === target.integration && link.endpoint === target.endpoint,
        );
        if (index < 0) {
            continue;
        }
        const [link] = unclaimed.splice(index, 1);
        const access = accessTo(target.project, ref.project);
        const keyIndex = unclaimedKeys.findIndex((other) => sameEndpoint(other, link));
        const apiKey = keyIndex >= 0;
        if (apiKey) {
            unclaimedKeys.splice(keyIndex, 1);
        }
        items.push(linkToConnectionListItem({ integration: ref.integration, configurable: link.configurable, name }, refServiceId, access, apiKey));
    }
    return items;
}

/** How an integration of `consumerProject` reaches an endpoint of `targetProject`. */
export function accessTo(targetProject: string, consumerProject: string): ServiceConnectionAccess {
    return targetProject === consumerProject ? "project" : "organization";
}

/**
 * The links of one endpoint whose configurables `source` (a connection's code)
 * reads by name: the URL's and, across projects, the API key's.
 */
function sameEndpoint(a: Pick<EndpointLink, "project" | "component" | "endpoint">, b: Pick<EndpointLink, "project" | "component" | "endpoint">): boolean {
    return a.project === b.project && a.component === b.component && a.endpoint === b.endpoint;
}

/** A link that fills a connection's URL: inside the project it has no key. */
const isUrlLink = (link: EndpointLink) => link.key === undefined || link.key === "url";

/**
 * The configurables a connection fills, to unlink with it: by the configurables its code (`source`) reads,
 * its URL's and, across projects, its API key's. Code that reads them some other way names none; then all the
 * endpoint's links if it is the only connection to it. With other connections to the endpoint, the list pairs
 * links with connections by endpoint alone, so which links are this connection's isn't known: none is returned,
 * rather than one that may be another connection's.
 */
export function connectionLinksOf(links: EndpointLink[], urlConfigurable: string, source: string): string[] {
    const urlLink = links.find((link) => link.configurable === urlConfigurable);
    if (!urlLink) {
        return [urlConfigurable];
    }
    const referenced = endpointLinksReferencedBy(links, urlLink, source);
    if (referenced.filter(isUrlLink).length > 1) {
        // Code that names two URLs to the endpoint doesn't say which is this connection's.
        return [];
    }
    if (referenced.length > 0) {
        return referenced.map((link) => link.configurable);
    }
    const toEndpoint = links.filter((link) => sameEndpoint(link, urlLink));
    const urlLinks = toEndpoint.filter(isUrlLink);
    return urlLinks.length === 1 ? toEndpoint.map((link) => link.configurable) : [];
}

export function endpointLinksReferencedBy(links: EndpointLink[], endpoint: Pick<EndpointLink, "project" | "component" | "endpoint">, source: string): EndpointLink[] {
    // Only code names a configurable: a name inside a string, a template or a comment is text.
    const code = source.replace(/"(?:[^"\\\n]|\\.)*"|`[^`]*`|\/\/[^\n]*/g, " ");
    return links.filter((link) => {
        if (link.project !== endpoint.project || link.component !== endpoint.component || link.endpoint !== endpoint.endpoint) {
            return false;
        }
        const name = link.configurable.slice(link.configurable.lastIndexOf(":") + 1);
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // A whole identifier, optionally quoted ('name), not a part of a longer one such as ServiceURL1.
        return !!name && new RegExp(`(?<![\\w'])'?${escaped}(?![\\w])`).test(code);
    });
}

export function linkToConnectionListItem(ref: LinkConnectionRef, serviceId = "", access: ServiceConnectionAccess = "project", apiKey = false): ConnectionListItem {
    return {
        name: ref.name,
        description: "",
        groupUuid: linkConnectionId(ref),
        serviceName: ref.name,
        serviceId,
        schemaName: serviceSchema(access, apiKey).name,
        schemaReference: serviceSchema(access, apiKey).id,
        isPartiallyCreated: false,
        status: {},
        componentId: ref.integration,
        dependentComponentId: "",
        version: "",
        resourceType: "SERVICE",
    };
}

/** A service connection's links as a detailed connection: its entries are what the platform fills in every environment. */
export function linkToConnectionDetailed(ref: LinkConnectionRef, serviceId = "", access: ServiceConnectionAccess = "project", apiKey = false): ConnectionDetailed {
    const entries: ConnectionDetailed["configurations"][string]["entries"] = {};
    for (const entryName of serviceKeysFor(access, apiKey)) {
        const envVar = connectionVarName(ref.name, SERVICE_CONNECTION_KEYS[entryName]);
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
    return {
        ...linkToConnectionListItem(ref, serviceId, access, apiKey),
        configurations: { "": { environmentUuid: "", entries } },
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

/**
 * How a service connection reaches its target: directly inside the project, or through the gateway for an
 * endpoint of another project, with an API key when its API takes one.
 */
export type ServiceConnectionAccess = "project" | "organization";

/** The schema of a service connection with `access`: Project access for an endpoint of the project, Organization for another's. */
function serviceSchema(access: ServiceConnectionAccess, apiKey = true): MarketplaceItemSchema {
    const project = access === "project";
    const withKey = !project && apiKey;
    return {
        id: project ? "project-url" : withKey ? "api-key" : "gateway-url",
        name: project ? "Project URL" : withKey ? "API Key" : "Gateway URL",
        description: project
            ? "The endpoint's in-cluster URL, reachable without a key from the same project"
            : withKey
              ? "The URL the gateway serves the endpoint's API at, and an API key for this integration, from the project's connection to it"
              : "The URL the gateway serves the endpoint's API at, from the project's connection to it",
        isDefault: true,
        entries: serviceKeysFor(access, apiKey).map((name) => ({
            name,
            type: "string",
            isSensitive: SENSITIVE_ENTRIES.has(name),
            isOptional: false,
        })),
    };
}

function serviceKeysFor(access: ServiceConnectionAccess, apiKey = true): string[] {
    return access === "organization" && apiKey ? Object.keys(SERVICE_CONNECTION_KEYS) : ["ServiceURL"];
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
export function endpointToMarketplaceItem(
    project: string,
    integration: Component,
    environment: string,
    endpoint: EndpointResources,
    orgHandle: string,
    consumerProject: string,
): MarketplaceItem {
    const access = accessTo(project, consumerProject);
    return {
        ...serviceItem({ project, component: integration.id, endpoint: endpoint.name }, serviceName(integration, endpoint), environment, orgHandle, access),
        serviceType: SERVICE_TYPE[(endpoint.type ?? "").toLowerCase()] ?? "REST",
        createdTime: integration.createdAt,
        summary: endpoint.basePath,
        description: integration.description,
    };
}

/** An endpoint the integration may connect to, as a marketplace service. */
export function connectableToMarketplaceItem(
    endpoint: ConnectableEndpoint,
    environment: string,
    orgHandle: string,
    unavailable = unavailableIn(endpoint, environment),
): MarketplaceItem {
    const name = /[A-Za-z0-9]/.test(endpoint.endpoint) ? `${endpoint.displayName} / ${endpoint.endpoint}` : endpoint.displayName;
    const access: ServiceConnectionAccess = endpoint.scope === "project" ? "project" : "organization";
    const item: MarketplaceItem = { ...serviceItem(endpoint, name, environment, orgHandle, access), summary: endpoint.project };
    if (unavailable) {
        item.properties = { [MARKETPLACE_ITEM_UNAVAILABLE]: unavailable };
    }
    return item;
}

/** Why the endpoint can't be connected to in the environment, in the platform's words; undefined when it can. */
export function unavailableIn(endpoint: ConnectableEndpoint, environment: string): string | undefined {
    const env = endpoint.environments.find((item) => item.name === environment);
    if (env?.connectable) {
        return undefined;
    }
    const detail = env?.detail?.trim();
    if (!detail) {
        return `Not available in ${environment}.`;
    }
    return `${detail.charAt(0).toUpperCase()}${detail.slice(1)}${/[.!?]$/.test(detail) ? "" : "."}`;
}

/**
 * The parts of a service every source gives. Its access is fixed by the projects: an endpoint of the
 * consumer's project is reached directly, another project's through the gateway.
 */
function serviceItem(
    ref: { project: string; component: string; endpoint: string },
    name: string,
    environment: string,
    orgHandle: string,
    access: ServiceConnectionAccess,
): MarketplaceItem {
    return {
        serviceId: serviceId({ project: ref.project, integration: ref.component, endpoint: ref.endpoint }),
        resourceId: ref.endpoint,
        name,
        version: environment,
        status: "PUBLISHED",
        // The platform's connectable endpoints carry no type yet, so every one is offered as a REST API.
        serviceType: "REST",
        resourceType: "SERVICE",
        organizationId: orgHandle,
        projectId: ref.project,
        component: { componentId: ref.component, endpointId: ref.endpoint, apimId: "" },
        // An import takes the schema of the connection it reads, and one across projects may have no key.
        connectionSchemas: access === "project" ? [serviceSchema(access)] : [serviceSchema(access), serviceSchema(access, false)],
        thumbnailUrl: "",
        averageRating: 0,
        totalRatingCount: 0,
        createdTime: "",
        summary: "",
        description: "",
        visibility: [access === "project" ? "PROJECT" : "ORGANIZATION"],
        isThirdParty: false,
    };
}

/** What an env-var group holds, judged by its keys. */
export function resourceTypeOf(group: Pick<EnvVarGroup, "keys" | "data">): "DATABASE" | "CONFIG" {
    const suffixes = new Set((group.keys ?? Object.keys(group.data ?? {})).map((key) => connectionVarSuffix(key, DATABASE_SUFFIXES)));
    return suffixes.has(DATABASE_CONNECTION_KEYS.HostName) && suffixes.has(DATABASE_CONNECTION_KEYS.Password) ? "DATABASE" : "CONFIG";
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
        schemaReference: resourceType === "DATABASE" ? databaseSchema().id : "",
        isPartiallyCreated: false,
        status: {},
        componentId: ref.integration,
        dependentComponentId: "",
        version: "",
        resourceType,
    };
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
    const suffixes = resourceType === "DATABASE" ? DATABASE_SUFFIXES : [];
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

/** Entry name by env-var suffix, for the kind of group. */
function entryNamesFor(resourceType: "DATABASE" | "CONFIG"): Record<string, string> {
    const source = resourceType === "DATABASE" ? DATABASE_CONNECTION_KEYS : {};
    return Object.fromEntries(Object.entries(source).map(([entry, envVar]) => [envVar, entry]));
}

/** The connection WSO2 Integrator just wrote, in the shape the config-replacement step reads env-var names from. */
export function createdConnection(params: {
    name: string;
    integration: string;
    environments: string[];
    kind: "DATABASE" | "SERVICE";
    serviceId: string;
    /** For a service connection: how it reaches the endpoint, and whether it has an API key. */
    access?: ServiceConnectionAccess;
    apiKey?: boolean;
    /** For a service connection: the URL configurable (`<org>/<package>:<name>`) the platform fills. */
    configurable?: string;
}): ConnectionDetailed {
    const access = params.access ?? "project";
    const apiKey = params.apiKey ?? false;
    const keys =
        params.kind === "DATABASE"
            ? DATABASE_CONNECTION_KEYS
            : Object.fromEntries(serviceKeysFor(access, apiKey).map((entry) => [entry, SERVICE_CONNECTION_KEYS[entry]]));
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
        schemaName: params.kind === "DATABASE" ? databaseSchema().name : serviceSchema(access, apiKey).name,
        schemaReference: params.kind === "DATABASE" ? databaseSchema().id : serviceSchema(access, apiKey).id,
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
