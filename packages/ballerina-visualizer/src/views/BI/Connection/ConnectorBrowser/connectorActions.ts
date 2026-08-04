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
//
// Connector-generic: shared by the agent tool wizard and, in future, the flow diagram. Anything
// specific to the agent tool form lives in AIChatAgent/toolForm.ts.

import { AvailableNode, Category, CodeData, Item, NodeKind } from "@wso2/ballerina-core";
import { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";
import { formatMethodName } from "@wso2/ballerina-side-panel";

// Local, not from src/constants: that pulls in the ballerina-core barrel and breaks tests.
const REMOTE_ACTION_CALL: NodeKind = "REMOTE_ACTION_CALL";
const RESOURCE_ACTION_CALL: NodeKind = "RESOURCE_ACTION_CALL";

export function formatActionLabel(symbol: string): string {
    return formatMethodName(symbol, { casing: "sentence" });
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export function actionDisplayLabel(label: string | undefined): string {
    const text = label ?? "";
    return IDENTIFIER.test(text) ? formatActionLabel(text) : text;
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
export const REST_RESOURCE_PATH = "/path/to/subdirectory";

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
