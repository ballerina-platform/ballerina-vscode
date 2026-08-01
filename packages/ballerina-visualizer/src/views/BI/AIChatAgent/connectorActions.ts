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

// Enumerating a connector's actions before any connection exists in the source. No LS
// endpoint does this, so we read the Central docs API via library-browser/getLibraryData.

import { AvailableNode, Category, CodeData, Item, NodeKind } from "@wso2/ballerina-core";
import { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";

// Local, not from src/constants: that pulls in the ballerina-core barrel and breaks tests.
const REMOTE_ACTION_CALL: NodeKind = "REMOTE_ACTION_CALL";
const RESOURCE_ACTION_CALL: NodeKind = "RESOURCE_ACTION_CALL";

/** `bitOpAnd` -> "Bit Op And". Matches the labels the LS produces for bound connections. */
export function formatActionLabel(symbol: string): string {
    const cleaned = (symbol || "").trim().replace(/^[^\w]+/, "");
    if (!cleaned) {
        return symbol ?? "";
    }
    return cleaned
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .split(" ")
        .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ""))
        .filter(Boolean)
        .join(" ");
}

// The parts of `docsData.modules[].clients[]` we use.
interface DocsMethod {
    name?: string;
    description?: string;
    accessor?: string;
    resourcePath?: string;
    isDeprecated?: boolean;
}

interface DocsClient {
    name?: string;
    remoteMethods?: DocsMethod[];
    resourceMethods?: DocsMethod[];
}

const stripMarkup = (value: string): string =>
    value.replace(/<[^>]*>/g, "").replace(/```[\s\S]*?```/g, "").replace(/\s+/g, " ").trim();

/** First sentence only; the rest stays in `description`. */
export function firstSentence(value: string): string {
    const text = (value || "").trim();
    const end = text.search(/\.(\s|$)/);
    return end === -1 ? text : text.slice(0, end + 1);
}

/** Mirrors `ParamUtils.REST_RESOURCE_PATH` in the LS. */
const REST_RESOURCE_PATH = "/path/to/subdirectory";

/** Shown instead of the LS placeholder, which reads like a real endpoint. */
const REST_PATH_DISPLAY = "/[path...]";

/** Never show the LS's rest-path placeholder to the user. */
export function displayResourcePath(resourcePath: string | undefined): string {
    return resourcePath === REST_RESOURCE_PATH ? REST_PATH_DISPLAY : (resourcePath || "");
}

/** `get` + `/users/[userId]/drafts` -> "GET /users/[userId]/drafts". */
export function formatResourceSignature(accessor: string, resourcePath: string): string {
    return `${(accessor || "").toUpperCase()} ${displayResourcePath(resourcePath)}`.trim();
}

/**
 * Docs path -> the template `FunctionDataBuilder.buildResourcePathTemplate` produces, which
 * `getNodeTemplate` compares by string equality.
 *
 *   `users/[string userId]/drafts`  ->  `/users/[userId]/drafts`
 *   `[PathParamType ...path]`       ->  `/path/to/subdirectory`
 *   `.`                             ->  `/`
 */
export function toResourcePathTemplate(docsPath: string): string {
    const path = (docsPath || "").trim();
    if (!path || path === ".") {
        return "/";
    }
    // A lone rest parameter.
    if (/^\[[^\]]*\.\.\.[^\]]*\]$/.test(path)) {
        return REST_RESOURCE_PATH;
    }

    const segments = path.split("/").filter((segment) => segment.length > 0);
    const rendered: string[] = [];
    for (const segment of segments) {
        const param = segment.match(/^\[([^\]]*)\]$/);
        if (!param) {
            rendered.push(segment);
            continue;
        }
        // A rest parameter adds no segment.
        if (param[1].includes("...")) {
            continue;
        }
        // `string userId` -> `userId`.
        const name = param[1].trim().split(/\s+/).pop() ?? "";
        rendered.push(`[${name}]`);
    }
    return rendered.length > 0 ? `/${rendered.join("/")}` : "/";
}

/**
 * Build the `AvailableNode` list for a connector's actions.
 * @throws when the docs cannot be fetched (unpublished package, offline).
 */
export async function fetchConnectorActions(
    rpcClient: BallerinaRpcClient,
    connector: AvailableNode
): Promise<AvailableNode[]> {
    const codedata = connector?.codedata;
    if (!codedata?.org || !codedata?.module || !codedata?.version) {
        throw new Error("The selected connector is missing package coordinates.");
    }

    const response = await rpcClient.getLibraryBrowserRPCClient().getLibraryData({
        orgName: codedata.org,
        moduleName: codedata.module,
        version: codedata.version,
    });

    const modules = response?.docsData?.modules ?? [];
    // Fall back to any module declaring the client: dotted modules (aws.s3) come as one.
    const clientName = codedata.object || "Client";
    const clients: DocsClient[] = modules
        .filter((module) => !codedata.module || !module.id || module.id === codedata.module)
        .flatMap((module) => (module.clients ?? []) as DocsClient[]);
    const allClients: DocsClient[] = clients.length
        ? clients
        : modules.flatMap((module) => (module.clients ?? []) as DocsClient[]);

    const client = allClients.find((candidate) => candidate.name === clientName) ?? allClients[0];
    if (!client) {
        throw new Error(`No client found in the documentation for ${codedata.org}/${codedata.module}.`);
    }

    const actions: AvailableNode[] = [];
    const seen = new Set<string>();

    const push = (method: DocsMethod, node: NodeKind) => {
        if (method?.isDeprecated) {
            return;
        }
        const isResource = node === RESOURCE_ACTION_CALL;
        // Resource methods have no `name`; `codedata.symbol` holds the accessor.
        const symbol = (isResource ? method.accessor : method.name)?.trim();
        const docsPath = method.resourcePath?.trim();
        if (!symbol || (isResource && !docsPath)) {
            return;
        }
        const resourcePath = isResource ? toResourcePathTemplate(docsPath) : docsPath;
        // symbol is the accessor here, so GET and POST on one path stay distinct.
        const key = `${node}:${symbol}:${resourcePath ?? ""}`;
        if (seen.has(key)) {
            return;
        }
        seen.add(key);

        const description = stripMarkup(method.description ?? "");
        // No symbol to humanise; the LS labels resource actions by their description too.
        const label = isResource
            ? firstSentence(description) || formatResourceSignature(symbol, resourcePath)
            : formatActionLabel(symbol);

        const actionCodeData: CodeData = {
            node,
            org: codedata.org,
            module: codedata.module,
            packageName: codedata.packageName ?? codedata.module,
            object: clientName,
            symbol,
            version: codedata.version,
            ...(resourcePath ? { resourcePath } : {}),
        };

        actions.push({
            metadata: {
                label,
                description,
                icon: connector.metadata?.icon,
            },
            codedata: actionCodeData,
            enabled: true,
        } as AvailableNode);
    };

    (client.remoteMethods ?? []).forEach((method) => push(method, REMOTE_ACTION_CALL));
    (client.resourceMethods ?? []).forEach((method) => push(method, RESOURCE_ACTION_CALL));

    actions.sort((a, b) => (a.metadata?.label ?? "").localeCompare(b.metadata?.label ?? ""));
    return actions;
}

/** A search with `q` returns a flat node list in `categories`; wrap it. Drops empty categories. */
export function normalizeConnectorSearchCategories(
    categories: Item[] | undefined,
    searchResultLabel = "Search Results"
): Category[] {
    const grouped: Category[] = [];
    const flat: AvailableNode[] = [];
    (categories ?? []).forEach((entry) => {
        if (entry && Array.isArray((entry as Category).items)) {
            const category = entry as Category;
            if (category.items.length > 0) {
                grouped.push(category);
            }
        } else if ((entry as AvailableNode)?.codedata) {
            flat.push(entry as AvailableNode);
        }
    });
    if (flat.length > 0) {
        grouped.push({ metadata: { label: searchResultLabel, description: "" }, items: flat });
    }
    return grouped;
}

/**
 * A type-filtered connection dropdown plus a "Create New …" link, shaped the way
 * NodeReferenceSelectEditor expects (see enrichClientConnectionField).
 */
export function buildConnectionSelectField(
    connectorCodeData: CodeData,
    ballerinaType: string | undefined,
    value: string
): Record<string, unknown> {
    // `exact`: a Redis client must never be offered for an HTTP action. No version — the LS
    // compares it literally, and the project's resolved patch rarely matches Central's latest.
    const targetType = connectorCodeData.module && connectorCodeData.object
        ? {
            relation: "exact",
            ...(connectorCodeData.org && { org: connectorCodeData.org }),
            ...(connectorCodeData.packageName && { packageName: connectorCodeData.packageName }),
            module: connectorCodeData.module,
            name: connectorCodeData.object,
        }
        : undefined;

    return {
        key: "connection",
        label: "Connection",
        documentation: "The connection this tool runs on.",
        type: "ACTION_EXPRESSION",
        optional: false,
        editable: true,
        enabled: true,
        hidden: false,
        advanced: false,
        value: value ?? "",
        // A connection is picked from the list; a raw expression is not a useful alternative.
        hideModeSwitcher: true,
        types: [
            { fieldType: "ACTION_EXPRESSION", ballerinaType, selected: true },
            { fieldType: "EXPRESSION", selected: false },
        ],
        codedata: {
            kind: "REQUIRED",
            originalName: "connection",
            searchNodesKind: "NEW_CONNECTION",
            ...(targetType && { targetType }),
            // Drives the "Create New …" link.
            data: { connection: connectorCodeData },
        },
    };
}

/** Collapsible sections of the tool form. */
export const TOOL_INPUT_GROUP = "toolInputs";
export const RESULT_TYPE_GROUP = "resultType";
export const OAUTH_GROUP = "oauthConfig";

interface GroupableField {
    group?: string;
    hidden?: boolean;
    optional?: boolean;
    value?: unknown;
}

export interface ToolFormGroup {
    id: string;
    label: string;
    defaultCollapsed: boolean;
}

/**
 * Collapsible sections for the fields present. Inputs collapse since mappings default to
 * identity — except SQL queries, which are blanked, so hiding them would break Save.
 */
export function buildToolFormGroups(fields: GroupableField[]): ToolFormGroup[] {
    const visibleIn = (group: string) =>
        fields.filter((field) => field.group === group && !field.hidden);

    const inputFields = visibleIn(TOOL_INPUT_GROUP);
    const hasUnfilledRequiredInput = inputFields.some(
        (field) => field.optional === false && (field.value === undefined || field.value === "")
    );

    // Ordered by how often each is opened, most first.
    const groups: ToolFormGroup[] = [];
    if (inputFields.length > 0) {
        groups.push({
            id: TOOL_INPUT_GROUP,
            label: "Inputs and Mapping",
            defaultCollapsed: !hasUnfilledRequiredInput,
        });
    }
    if (visibleIn(OAUTH_GROUP).length > 0) {
        groups.push({ id: OAUTH_GROUP, label: "OAuth Client Configuration", defaultCollapsed: true });
    }
    if (visibleIn(RESULT_TYPE_GROUP).length > 0) {
        groups.push({ id: RESULT_TYPE_GROUP, label: "Result Type", defaultCollapsed: true });
    }
    return groups;
}

/**
 * A resource action's symbol is only its accessor, so seed from the last named segment too.
 *
 *   `post` + `/users/[userId]/labels`      -> `postLabels`
 *   `get`  + `/users/[userId]/labels/[id]` -> `getLabels`
 */
export function resourceToolNameSeed(accessor: string, resourcePath: string): string {
    const path = (resourcePath || "").trim();
    // The rest-path placeholder is not a real endpoint.
    if (!path || path === "/" || path === REST_RESOURCE_PATH) {
        return accessor || "";
    }

    // Skip parameters and segments `suggestToolName` would strip to nothing.
    const named = path
        .split("/")
        .filter((segment) => segment && !segment.startsWith("[") && /[a-zA-Z0-9]/.test(segment));

    const last = named.length > 0 ? named[named.length - 1] : "";
    if (!last) {
        return accessor || "";
    }
    return `${accessor}${last.charAt(0).toUpperCase()}${last.slice(1)}`;
}

const BALLERINA_RESERVED_TOOL_NAMES = new Set(["function", "type", "class", "service", "resource", "remote", "client"]);

/** `append` -> `appendTool`, with a numeric suffix when taken. */
export function suggestToolName(symbol: string, taken: Iterable<string>): string {
    const existing = new Set(taken);
    // Camel-case across separators: `get-range` -> `getRange`, not `getrange`.
    const words = (symbol || "").split(/[^a-zA-Z0-9]+/).filter(Boolean);
    const cleaned = words
        .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
        .join("");
    if (!cleaned) {
        return "newTool";
    }
    let base = `${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}`;
    if (!/^[a-zA-Z_]/.test(base)) {
        base = `tool${base}`;
    }
    if (!base.toLowerCase().endsWith("tool")) {
        base = `${base}Tool`;
    }
    if (BALLERINA_RESERVED_TOOL_NAMES.has(base)) {
        base = `${base}Tool`;
    }
    if (!existing.has(base)) {
        return base;
    }
    let suffix = 2;
    while (existing.has(`${base}${suffix}`)) {
        suffix++;
    }
    return `${base}${suffix}`;
}

/** Names already used by the agent's tools, so a suggestion never collides. */
export function getExistingToolNames(agentNode: { properties?: Record<string, any> } | undefined): string[] {
    const raw = agentNode?.properties?.tools?.value;
    if (Array.isArray(raw)) {
        return raw.map((entry) => String(entry).trim()).filter(Boolean);
    }
    if (typeof raw !== "string") {
        return [];
    }
    return raw
        .replace(/^\s*\[/, "")
        .replace(/\]\s*$/, "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}
