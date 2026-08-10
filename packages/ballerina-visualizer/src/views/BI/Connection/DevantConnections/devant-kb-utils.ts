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
import { MarketplaceItem, getTypeForDisplayType } from "@wso2/wso2-platform-core";
import { generateInitialConnectionName, getInitialVisibility, getPossibleSchemas, getPossibleVisibilities } from "./utils";

// OAuth2 auth entries wired from Devant environment variables (OAuth2 only for now).
const OAUTH2_ENTRY_NAMES = ["ServiceURL", "TokenURL", "ConsumerKey", "ConsumerSecret"];

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
 * Registers a Devant connection for the given knowledge base service, writes its credentials as
 * `os:getEnv(...)` configurables, and returns a CloudKnowledgeBase form node pre-filled.
 */
export async function prepareDevantKnowledgeBase(deps: PrepareDevantKnowledgeBaseDeps): Promise<FlowNode | null> {
    const { rpcClient, platformRpcClient, platformExtState, item, node, projectPath, target, fileName } = deps;

    const schema = item.connectionSchemas?.[0];
    const neededEntries = (schema?.entries || []).filter((e) => OAUTH2_ENTRY_NAMES.includes(e.name));

    // Devant rejects a duplicate connection name in a project (409), so generate a unique one.
    let existingDevantConnNames: string[] = [];
    try {
        const projConns = await platformRpcClient.getConnections({
            projectId: platformExtState?.selectedContext?.project?.id,
            orgId: platformExtState?.selectedContext?.org?.id?.toString(),
            componentId: "",
        });
        existingDevantConnNames = (projConns || []).map((c) => c.name);
    } catch (e) {
        console.warn(">>> Could not fetch existing Devant connections for name dedup", e);
    }
    const connName = generateInitialConnectionName([], existingDevantConnNames, item.name);

    // Create placeholder configurables in config.bal.
    const devantConfigs: DevantTempConfig[] = [];
    for (const [i, entry] of neededEntries.entries()) {
        const varName = `${connName}_${entry.name}`;
        const resp = await platformRpcClient.addDevantTempConfig({ name: varName, newLine: i === 0 });
        devantConfigs.push({
            id: entry.name,
            name: varName,
            value: "",
            isSecret: entry.isSensitive,
            type: (entry.type as "string" | "int") || "string",
            node: resp.configNode,
        });
    }

    // Register the connection in Devant. The schema must match the chosen visibility, else
    // Devant rejects it (mirrors the normal connection form).
    const isProjectLevel = !platformExtState.selectedComponent?.metadata?.id;
    const visibilities = getPossibleVisibilities(item, platformExtState?.selectedContext?.project);
    const visibility = getInitialVisibility(item, visibilities);
    const chosenSchema = getPossibleSchemas(item, visibility, item.connectionSchemas)[0] || schema;
    const createdConnection = await platformRpcClient.createInternalConnection({
        componentId: isProjectLevel ? "" : platformExtState.selectedComponent?.metadata?.id,
        name: connName,
        orgId: platformExtState.selectedContext?.org?.id?.toString(),
        orgUuid: platformExtState.selectedContext?.org?.uuid,
        projectId: platformExtState.selectedContext?.project?.id,
        serviceSchemaId: chosenSchema?.id || "",
        serviceId: item.serviceId,
        serviceVisibility: visibility,
        componentType: isProjectLevel
            ? "non-component"
            : getTypeForDisplayType(platformExtState.selectedComponent?.spec?.type),
        componentPath: projectPath,
        generateCreds: true,
    });

    // createInternalConnection resolves to undefined on failure; roll back the placeholder configs.
    if (!createdConnection) {
        await platformRpcClient.deleteDevantTempConfigs({ nodes: devantConfigs.map((c) => c.node!) });
        return null;
    }

    // Rewrite each placeholder to `= os:getEnv("CHOREO_...")` using Devant's env-var names.
    await platformRpcClient.replaceDevantTempConfigValues({ configs: devantConfigs, createdConnection });

    // Register the local connection config so the run step resolves this connection's secrets and
    // injects the CHOREO_* env vars; without it os:getEnv(...) is empty at runtime.
    await platformRpcClient.createConnectionConfig({
        marketplaceItem: item,
        name: connName,
        visibility,
        componentDir: projectPath,
    });

    // Fetch the CloudKnowledgeBase form node from the LS.
    const templateResp = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
        position: target,
        filePath: fileName,
        id: node.codedata,
    });
    const flowNode = templateResp.flowNode;

    // Pre-fill serviceUrl/auth to reference the configurables as expressions (not string literals).
    const varOf = (entryName: string) => devantConfigs.find((c) => c.id === entryName)?.name;
    const selectExpression = (prop: any) => {
        if (prop?.types) {
            prop.types = prop.types.map((t: any) => ({ ...t, selected: t.fieldType === "EXPRESSION" }));
        }
    };
    const props: any = flowNode.properties;
    if (props?.variable) {
        props.variable.value = connName;
    }
    if (props?.serviceUrl) {
        props.serviceUrl.value = varOf("ServiceURL");
        selectExpression(props.serviceUrl);
    }
    if (props?.knowledgeBaseAuthConfig) {
        props.knowledgeBaseAuthConfig.value = `{auth: {tokenUrl: ${varOf("TokenURL")}, clientId: ${varOf(
            "ConsumerKey",
        )}, clientSecret: ${varOf("ConsumerSecret")}}}`;
        selectExpression(props.knowledgeBaseAuthConfig);
    }

    // The auth record literal never uses the `http:` prefix, so drop the http import the template
    // carries or it lands unused in connections.bal (BCE2002 unused module prefix 'http').
    Object.values(props || {}).forEach((p: any) => {
        if (p?.imports?.http) {
            delete p.imports.http;
        }
    });

    return flowNode;
}
