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

// The schema entry holding the knowledge base service's URL. WSO2 Cloud service connections carry it
// with both access modes (Project URL and API Key).
const SERVICE_URL_ENTRY = "ServiceURL";

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
 * Creates a WSO2 Cloud connection to the given knowledge base service, writes its URL as an
 * `os:getEnv(...)` configurable, and returns a CloudKnowledgeBase form node with the URL pre-filled.
 *
 * The knowledge base authentication is left for the user to fill in: the connector takes a bearer
 * token or OAuth2 client credentials, and a WSO2 Cloud service connection provides neither (only a
 * Project URL, or a URL and an API key through the gateway).
 *
 * Throws when WSO2 Cloud refuses the connection; the placeholder configurable is removed first.
 */
export async function prepareDevantKnowledgeBase(deps: PrepareDevantKnowledgeBaseDeps): Promise<FlowNode> {
    const { rpcClient, platformRpcClient, platformExtState, item, node, projectPath, target, fileName } = deps;

    const integrationId = platformExtState?.selectedIntegration?.integration.id;
    const isProjectLevel = !integrationId;
    const visibilities = getPossibleVisibilities(item, platformExtState?.selectedContext?.project);
    const visibility = getInitialVisibility(item, visibilities);
    // Project access when the service is in the same project, otherwise through the gateway.
    const chosenSchema = getPossibleSchemas(item, visibility)[0] || item.connectionSchemas?.[0];
    const serviceUrlEntry = chosenSchema?.entries?.find((e) => e.name === SERVICE_URL_ENTRY);
    if (!serviceUrlEntry) {
        throw new Error(`The knowledge base service "${item.name}" does not expose a service URL to connect to.`);
    }

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

    // Create the placeholder configurable in config.bal.
    const varName = `${connName}_${serviceUrlEntry.name}`;
    const tempConfigResp = await platformRpcClient.addDevantTempConfig({ name: varName, newLine: true });
    const devantConfigs: DevantTempConfig[] = [
        {
            id: serviceUrlEntry.name,
            name: varName,
            value: "",
            isSecret: serviceUrlEntry.isSensitive,
            type: (serviceUrlEntry.type as "string" | "int") || "string",
            node: tempConfigResp.configNode,
        },
    ];

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
        await platformRpcClient.deleteDevantTempConfigs({ nodes: devantConfigs.map((c) => c.node!) });
        throw error;
    }
    if (!createdConnection) {
        await platformRpcClient.deleteDevantTempConfigs({ nodes: devantConfigs.map((c) => c.node!) });
        throw new Error(`WSO2 Cloud did not create a connection to "${item.name}".`);
    }

    // Rewrite the placeholder to `= os:getEnv(...)` using the connection's variable name.
    await platformRpcClient.replaceDevantTempConfigValues({ configs: devantConfigs, createdConnection });

    // Register the local connection config so the run step injects the connection's variables;
    // without it os:getEnv(...) is empty at runtime.
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

    // Pre-fill the service URL to reference the configurable as an expression (not a string literal).
    const props: any = flowNode.properties;
    if (props?.variable) {
        props.variable.value = connName;
    }
    if (props?.serviceUrl) {
        props.serviceUrl.value = varName;
        if (props.serviceUrl.types) {
            props.serviceUrl.types = props.serviceUrl.types.map((t: any) => ({
                ...t,
                selected: t.fieldType === "EXPRESSION",
            }));
        }
    }

    return flowNode;
}
