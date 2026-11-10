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

import { AvailableNode, BINodeTemplateResponse, FlowNode, LinePosition } from "@wso2/ballerina-core";
import { DevantTempConfig, PlatformExtState } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";
import { PlatformExtRpcClient } from "@wso2/ballerina-rpc-client/lib/rpc-clients/platform-ext/platform-ext-client";
import { ModulePart, ModuleVarDecl, STKindChecker } from "@wso2/syntax-tree";
import {
    GetMarketplaceItemsParams,
    MarketplaceItem,
    MarketplaceItemSchema,
    MarketplaceListResp,
    getTypeForDisplayType,
} from "@wso2/wso2-platform-core";
import { URI } from "vscode-uri";
import {
    errorMessageOf,
    generateInitialConnectionName,
    getInitialVisibility,
    getPossibleSchemas,
    getPossibleVisibilities,
} from "./utils";

// The schema entry holding the service URL, present with both access modes.
export const SERVICE_URL_ENTRY = "ServiceURL";

// The schema entry holding the gateway API key, present only with API Key access.
export const API_KEY_ENTRY = "ChoreoAPIKey";

// The first ballerinax/ai.wso2.integration version whose auth accepts an `ApiKeyConfig` (module-ballerinax-ai.wso2.integration#15).
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

/** Whether `version` is at least `minVersion` by `major.minor.patch`; a suffix is ignored and an unparsable version is too old. */
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

/** The auth value sending `apiKeyVar` in the connector's default `X-API-Key` header, which the gateway reads. */
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

/** Every marketplace item matching `request`, read page by page; throws when the host returns nothing. */
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
        // An empty page ends the walk, so a host that miscounts `total` can't loop it.
    } while (page.data?.length && start + data.length < (page.pagination?.total ?? 0));
    return { ...page, count: data.length, data };
}

/** Selects the expression input of a form property, so its value is used as code rather than a string literal. */
function selectExpression(prop: any) {
    if (prop?.types) {
        prop.types = prop.types.map((t: any) => ({ ...t, selected: t.fieldType === "EXPRESSION" }));
    }
}

/** The module-level variable declarations of a file at the project root. */
async function moduleVarDecls(rpcClient: BallerinaRpcClient, file: string): Promise<ModuleVarDecl[]> {
    const { filePath } = await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [file] });
    const stResp = await rpcClient.getLangClientRpcClient().getST({
        documentIdentifier: { uri: URI.file(filePath).toString() },
    });
    return ((stResp?.syntaxTree as ModulePart)?.members || []).filter((m): m is ModuleVarDecl =>
        STKindChecker.isModuleVarDecl(m),
    );
}

/** The variable name a module-level declaration binds, if it binds a single one. */
function varNameOf(decl: ModuleVarDecl): string | undefined {
    const pattern = decl.typedBindingPattern?.bindingPattern;
    if (pattern && STKindChecker.isCaptureBindingPattern(pattern) && STKindChecker.isIdentifierToken(pattern.variableName)) {
        return pattern.variableName.value;
    }
    return undefined;
}

/** The variable names declared in connections.bal, which a new connection must not reuse. */
export async function getBIConnectionNames(rpcClient: BallerinaRpcClient): Promise<string[]> {
    const names = (await moduleVarDecls(rpcClient, "connections.bal")).map(varNameOf);
    return Array.from(new Set(names.filter((name): name is string => !!name)));
}

/**
 * Creates a WSO2 Cloud connection to a knowledge base service and returns the CloudKnowledgeBase form
 * node pre-filled with its `os:getEnv(...)` configurables. The service URL is always pre-filled; the
 * API key auth only with API Key access and a connector at {@link API_KEY_AUTH_MIN_VERSION} or later.
 * Throws on failure, after removing the placeholder configurables.
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

    // The template comes first: its connector version decides which configurables to create.
    const templateResp = (await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
        position: target,
        filePath: fileName,
        id: node.codedata,
    })) as BINodeTemplateResponse & { errorMsg?: string };
    if (templateResp?.errorMsg || !templateResp?.flowNode) {
        throw new Error(templateResp?.errorMsg || "Could not load the knowledge base form.");
    }
    const flowNode = templateResp.flowNode;
    const props: any = flowNode.properties;
    const connectorVersion = flowNode.codedata?.version || node.codedata?.version;
    const canWireApiKey = !!props?.knowledgeBaseAuthConfig && supportsApiKeyAuth(connectorVersion);
    const { serviceUrlEntry, apiKeyEntry } = entriesToWire(chosenSchema, canWireApiKey);

    // The name must be new both in connections.bal and among the integration's WSO2 Cloud connections.
    const [biConnNames, cloudConnNames] = await Promise.all([
        getBIConnectionNames(rpcClient).catch((e) => {
            console.warn(">>> Could not read connections.bal for name dedup", e);
            return [] as string[];
        }),
        platformRpcClient
            .getConnections({
                projectId: platformExtState?.selectedContext?.projectName,
                orgId: platformExtState?.session?.org.handle,
                componentId: integrationId || "",
            })
            .then((conns) => (conns || []).map((c) => c.name))
            .catch((e) => {
                console.warn(">>> Could not fetch existing WSO2 Cloud connections for name dedup", e);
                return [] as string[];
            }),
    ]);
    const connName = generateInitialConnectionName(biConnNames, cloudConnNames, item.name);

    // Placeholder configurables in config.bal; on any failure, the ones already added are removed.
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

    try {
        // Point each placeholder at the connection's env var with `os:getEnv(...)`.
        await platformRpcClient.replaceDevantTempConfigValues({ configs: devantConfigs, createdConnection });
        // The local connection reference makes the run step inject those env vars.
        await platformRpcClient.createConnectionConfig({
            marketplaceItem: item,
            name: connName,
            visibility,
            componentDir: projectPath,
        });
    } catch (error) {
        await removeRewrittenPlaceholders(rpcClient, platformRpcClient, devantConfigs);
        throw new Error(
            `The connection "${connName}" was created in WSO2 Cloud, but could not be set up here: ${errorMessageOf(error)}`,
        );
    }

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
        // The LS adds `http` whatever the value, so drop it where the value doesn't use it (BCE2002 unused import).
        Object.values(props).forEach((p: any) => {
            if (p?.imports?.http && !/\bhttp:/.test(String(p.value ?? ""))) {
                delete p.imports.http;
            }
        });
    }

    return flowNode;
}

/** Removes the placeholders after `os:getEnv(...)` was written into them, finding them again by name since their ranges changed. */
async function removeRewrittenPlaceholders(
    rpcClient: BallerinaRpcClient,
    platformRpcClient: PlatformExtRpcClient,
    configs: DevantTempConfig[],
) {
    try {
        const names = new Set(configs.map((c) => c.name));
        const nodes = (await moduleVarDecls(rpcClient, "config.bal")).filter((decl) => names.has(varNameOf(decl) ?? ""));
        if (nodes.length > 0) {
            await platformRpcClient.deleteDevantTempConfigs({ nodes });
        }
    } catch (e) {
        console.warn(">>> Could not remove the WSO2 Cloud knowledge base configurables", e);
    }
}
