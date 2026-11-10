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

import { AvailableNode, FlowNode, LinePosition } from "@wso2/ballerina-core";
import { DevantTempConfig, PlatformExtState } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";
import { PlatformExtRpcClient } from "@wso2/ballerina-rpc-client/lib/rpc-clients/platform-ext/platform-ext-client";
import {
    GetMarketplaceItemsParams,
    MarketplaceItem,
    MarketplaceItemSchema,
    MarketplaceListResp,
    getTypeForDisplayType,
} from "@wso2/wso2-platform-core";
import { generateInitialConnectionName, getInitialVisibility, getPossibleSchemas, getPossibleVisibilities } from "./utils";

// The schema entry holding the knowledge base service's URL. WSO2 Cloud service connections carry it
// with both access modes (Project URL and API Key).
export const SERVICE_URL_ENTRY = "ServiceURL";

// The schema entry holding the gateway API key. Only the API Key access mode carries it; the
// connection exposes it as the `<CONNECTION>_API_KEY` environment variable.
export const API_KEY_ENTRY = "ChoreoAPIKey";

// The first ballerinax/ai.wso2.integration version whose `KnowledgeBaseAuthConfig.auth` accepts an
// `ApiKeyConfig` (ballerina-platform/module-ballerinax-ai.wso2.integration#15). Older versions only
// take a bearer token or OAuth2 client credentials, so the API key can't be pre-filled for them.
export const API_KEY_AUTH_MIN_VERSION = "1.2.0";

export interface PrepareDevantKnowledgeBaseDeps {
    rpcClient: BallerinaRpcClient;
    platformRpcClient: PlatformExtRpcClient;
    platformExtState: PlatformExtState;
    item: MarketplaceItem;
    node: AvailableNode;
    projectPath: string;
    target: LinePosition;
    fileName: string;
}

/**
 * Whether `version` is at least `minVersion`, comparing `major.minor.patch` numerically. A
 * pre-release or build suffix is ignored, so a local `1.2.0-SNAPSHOT` build counts as `1.2.0`.
 * An unknown or unparsable version is treated as too old.
 */
export function isVersionAtLeast(version: string | undefined, minVersion: string): boolean {
    const parse = (v: string) => {
        const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(v.trim());
        return match ? [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)] : undefined;
    };
    const actual = version ? parse(version) : undefined;
    const min = parse(minVersion);
    if (!actual || !min) {
        return false;
    }
    for (let i = 0; i < 3; i++) {
        if (actual[i] !== min[i]) {
            return actual[i] > min[i];
        }
    }
    return true;
}

/** Whether the CloudKnowledgeBase connector at `version` accepts a gateway API key as its auth. */
export function supportsApiKeyAuth(version: string | undefined): boolean {
    return isVersionAtLeast(version, API_KEY_AUTH_MIN_VERSION);
}

/**
 * The `knowledgeBaseAuthConfig` value that sends the API key held by `apiKeyVar` to the WSO2 Cloud
 * gateway. `headerName` is left at the connector's default (`X-API-Key`), which is the header the
 * gateway reads unless the API was configured with another one.
 */
export function apiKeyAuthConfigExpression(apiKeyVar: string): string {
    return `{auth: {apiKey: ${apiKeyVar}}}`;
}

/** The schema entries to write as configurables: the service URL, plus the API key when it can be wired into the auth. */
function entriesToWire(schema: MarketplaceItemSchema | undefined, wireApiKey: boolean) {
    const entries = schema?.entries || [];
    const serviceUrlEntry = entries.find((e) => e.name === SERVICE_URL_ENTRY);
    const apiKeyEntry = wireApiKey ? entries.find((e) => e.name === API_KEY_ENTRY) : undefined;
    return { serviceUrlEntry, apiKeyEntry };
}

/**
 * Every marketplace item matching `request`, read page by page from `request.offset`. Knowledge
 * base services are told apart only by tag, after the host has sliced its list of every endpoint
 * in the project, so a single page could leave one out.
 *
 * Throws when the host returns nothing: it logs its own failure and resolves to `undefined`.
 */
export async function listAllMarketplaceItems(
    platformRpcClient: Pick<PlatformExtRpcClient, "getMarketplaceItems"> | undefined,
    orgId: string,
    request: GetMarketplaceItemsParams,
): Promise<MarketplaceListResp> {
    if (!platformRpcClient) {
        throw new Error("WSO2 Cloud is not available in this window.");
    }
    const start = request.offset ?? 0;
    const data: MarketplaceItem[] = [];
    let page: MarketplaceListResp | undefined;
    do {
        page = await platformRpcClient.getMarketplaceItems({ orgId, request: { ...request, offset: start + data.length } });
        if (!page) {
            throw new Error("WSO2 Cloud returned no services. See the extension log for details.");
        }
        data.push(...(page.data || []));
        // An empty page ends the walk even when `total` says more, so a miscounting host can't loop it.
    } while (page.data?.length && start + data.length < (page.pagination?.total ?? 0));
    return { ...page, count: data.length, data };
}

/** Selects the expression input of a form property, so its value is used as code rather than a string literal. */
function selectExpression(prop: any) {
    if (prop?.types) {
        prop.types = prop.types.map((t: any) => ({ ...t, selected: t.fieldType === "EXPRESSION" }));
    }
}

/**
 * Creates a WSO2 Cloud connection to the given knowledge base service, writes its variables as
 * `os:getEnv(...)` configurables, and returns a CloudKnowledgeBase form node pre-filled with them.
 *
 * - The service URL is always pre-filled.
 * - With API Key access (the service is in another project), the connection also carries an API
 *   key, and `knowledgeBaseAuthConfig` is pre-filled as `{auth: {apiKey: <API key configurable>}}`,
 *   provided the connector version supports `ApiKeyConfig` (see {@link API_KEY_AUTH_MIN_VERSION}).
 * - With Project URL access, or an older connector, the authentication is left for the user to fill in.
 *
 * Throws when WSO2 Cloud refuses the connection; the placeholder configurables are removed first.
 */
export async function prepareDevantKnowledgeBase(deps: PrepareDevantKnowledgeBaseDeps): Promise<FlowNode> {
    const { rpcClient, platformRpcClient, platformExtState, item, node, projectPath, target, fileName } = deps;

    const integrationId = platformExtState?.selectedIntegration?.integration.id;
    const isProjectLevel = !integrationId;
    const visibilities = getPossibleVisibilities(item, platformExtState?.selectedContext?.project);
    const visibility = getInitialVisibility(item, visibilities);
    // Project access when the service is in the same project, otherwise through the gateway.
    const chosenSchema = getPossibleSchemas(item, visibility)[0] || item.connectionSchemas?.[0];
    if (!chosenSchema?.entries?.some((e) => e.name === SERVICE_URL_ENTRY)) {
        throw new Error(`The knowledge base service "${item.name}" does not expose a service URL to connect to.`);
    }

    // Fetch the CloudKnowledgeBase form node from the LS first: its connector version decides
    // whether the API key can be wired into the auth, and so which configurables to create.
    const templateResp = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
        position: target,
        filePath: fileName,
        id: node.codedata,
    });
    const flowNode = templateResp.flowNode;
    const props: any = flowNode.properties;
    const connectorVersion = flowNode.codedata?.version || node.codedata?.version;
    const canWireApiKey = !!props?.knowledgeBaseAuthConfig && supportsApiKeyAuth(connectorVersion);
    const { serviceUrlEntry, apiKeyEntry } = entriesToWire(chosenSchema, canWireApiKey);

    // WSO2 Cloud rejects a duplicate connection name in a project, so generate a unique one.
    let existingConnNames: string[] = [];
    try {
        const projConns = await platformRpcClient.getConnections({
            projectId: platformExtState?.selectedContext?.projectName,
            orgId: platformExtState?.session?.org.handle,
            componentId: "",
        });
        existingConnNames = (projConns || []).map((c) => c.name);
    } catch (e) {
        console.warn(">>> Could not fetch existing WSO2 Cloud connections for name dedup", e);
    }
    const connName = generateInitialConnectionName([], existingConnNames, item.name);

    // Create the placeholder configurables in config.bal. One that can't be added fails the whole
    // step, and the ones already added are removed, so config.bal never keeps half of them.
    const devantConfigs: DevantTempConfig[] = [];
    const removePlaceholders = () => platformRpcClient.deleteDevantTempConfigs({ nodes: devantConfigs.map((c) => c.node!) });
    const wiredEntries = [serviceUrlEntry, apiKeyEntry].filter((e): e is NonNullable<typeof e> => !!e);
    try {
        for (const [i, entry] of wiredEntries.entries()) {
            const varName = `${connName}_${entry.name}`;
            const tempConfigResp = await platformRpcClient.addDevantTempConfig({ name: varName, newLine: i === 0 });
            // The host logs its own failure and resolves to nothing.
            if (!tempConfigResp?.configNode) {
                throw new Error(`Could not add the configurable ${varName} to config.bal.`);
            }
            devantConfigs.push({
                id: entry.name,
                name: varName,
                value: "",
                isSecret: entry.isSensitive,
                type: (entry.type as "string" | "int") || "string",
                node: tempConfigResp.configNode,
            });
        }
    } catch (error) {
        if (devantConfigs.length > 0) {
            await removePlaceholders();
        }
        throw error;
    }
    const varOf = (entryName: string) => devantConfigs.find((c) => c.id === entryName)?.name;

    let createdConnection;
    try {
        createdConnection = await platformRpcClient.createInternalConnection({
            componentId: isProjectLevel ? "" : integrationId,
            name: connName,
            orgId: platformExtState?.session?.org.handle,
            orgUuid: platformExtState?.session?.org.uuid,
            projectId: platformExtState?.selectedContext?.projectName,
            serviceSchemaId: chosenSchema?.id || "",
            serviceId: item.serviceId,
            serviceVisibility: visibility,
            componentType: isProjectLevel
                ? "non-component"
                : getTypeForDisplayType(platformExtState?.selectedIntegration?.integration.componentType),
            componentPath: projectPath,
            generateCreds: true,
        });
    } catch (error) {
        await removePlaceholders();
        throw error;
    }
    if (!createdConnection) {
        await removePlaceholders();
        throw new Error(`WSO2 Cloud did not create a connection to "${item.name}".`);
    }

    // Rewrite each placeholder to `= os:getEnv(...)` using the connection's variable names.
    await platformRpcClient.replaceDevantTempConfigValues({ configs: devantConfigs, createdConnection });

    // Register the local connection config so the run step injects the connection's variables;
    // without it os:getEnv(...) is empty at runtime.
    await platformRpcClient.createConnectionConfig({
        marketplaceItem: item,
        name: connName,
        visibility,
        componentDir: projectPath,
    });

    // Pre-fill the form to reference the configurables as expressions (not string literals).
    if (props?.variable) {
        props.variable.value = connName;
    }
    if (props?.serviceUrl) {
        props.serviceUrl.value = varOf(SERVICE_URL_ENTRY);
        selectExpression(props.serviceUrl);
    }
    const apiKeyVar = varOf(API_KEY_ENTRY);
    if (apiKeyVar && props?.knowledgeBaseAuthConfig) {
        props.knowledgeBaseAuthConfig.value = apiKeyAuthConfigExpression(apiKeyVar);
        selectExpression(props.knowledgeBaseAuthConfig);
        // The API key record literal doesn't use the `http:` prefix, so drop the http import the
        // template carries for the bearer/OAuth2 auth types, or it lands unused in connections.bal
        // (BCE2002 unused module prefix 'http'). Every property is cleared, not only the auth: the
        // LS adds a property's imports whenever it reads the property, whether or not its value
        // uses them. A property whose value does use `http:` keeps its import.
        Object.values(props).forEach((p: any) => {
            if (p?.imports?.http && !/\bhttp:/.test(String(p.value ?? ""))) {
                delete p.imports.http;
            }
        });
    }

    return flowNode;
}
