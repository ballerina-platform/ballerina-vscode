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

import { AvailableNode, FlowNode } from "@wso2/ballerina-core";
import { PlatformExtState } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { MarketplaceItem, MarketplaceItemSchema } from "@wso2/wso2-platform-core";
import {
    API_KEY_AUTH_MIN_VERSION,
    API_KEY_ENTRY,
    PrepareDevantKnowledgeBaseDeps,
    SERVICE_URL_ENTRY,
    apiKeyAuthConfigExpression,
    isVersionAtLeast,
    prepareDevantKnowledgeBase,
    supportsApiKeyAuth,
} from "../../../../../views/BI/Connection/DevantConnections/devant-kb-utils";

// The two schemas WSO2 Cloud offers for a service connection (see v1-adapters.ts serviceSchema).
const entry = (name: string, isSensitive = false) => ({ name, type: "string", isSensitive, isOptional: false });
const PROJECT_URL_SCHEMA = { id: "project-url", name: "Project URL", entries: [entry(SERVICE_URL_ENTRY)] };
const API_KEY_SCHEMA = {
    id: "api-key",
    name: "API Key",
    entries: [entry(SERVICE_URL_ENTRY), entry(API_KEY_ENTRY, true)],
};

const MY_PROJECT = "proj-1";

// A knowledge base service in `projectId`; Project visibility only applies within its own project.
const kbService = (projectId: string): MarketplaceItem =>
    ({
        name: "docs-kb",
        serviceId: "svc:docs-kb",
        projectId,
        resourceType: "SERVICE",
        isThirdParty: false,
        visibility: ["PROJECT", "ORGANIZATION"],
        connectionSchemas: [PROJECT_URL_SCHEMA, API_KEY_SCHEMA] as unknown as MarketplaceItemSchema[],
    } as unknown as MarketplaceItem);

const state = {
    session: { org: { handle: "acme", uuid: "org-uuid" } },
    selectedContext: { projectName: "my-project", project: { id: MY_PROJECT } },
} as unknown as PlatformExtState;

// The CloudKnowledgeBase node template the LS returns, at a given connector version.
const template = (version: string | undefined): FlowNode =>
    ({
        codedata: { org: "ballerinax", module: "ai.wso2.integration", object: "CloudKnowledgeBase", version },
        properties: {
            variable: { value: "" },
            serviceUrl: { value: "", types: [{ fieldType: "TEXT", selected: true }, { fieldType: "EXPRESSION", selected: false }] },
            knowledgeBaseAuthConfig: {
                value: "",
                types: [{ fieldType: "RECORD_MAP_EXPRESSION", selected: true }, { fieldType: "EXPRESSION", selected: false }],
                imports: { http: "ballerina/http" },
            },
        },
    } as unknown as FlowNode);

function setup(opts: { serviceProject: string; version: string | undefined; createdConnection?: unknown }) {
    const tempConfigNames: string[] = [];
    const rpc = {
        getNodeTemplate: jest.fn(async () => ({ flowNode: template(opts.version) })),
    };
    const platform = {
        getConnections: jest.fn(async () => [] as { name: string }[]),
        addDevantTempConfig: jest.fn(async ({ name }: { name: string }) => {
            tempConfigNames.push(name);
            return { configNode: { name } };
        }),
        createInternalConnection: jest.fn(async () =>
            "createdConnection" in opts ? opts.createdConnection : { name: "docs_kb", configurations: {} },
        ),
        deleteDevantTempConfigs: jest.fn(async (): Promise<void> => undefined),
        replaceDevantTempConfigValues: jest.fn(async (): Promise<void> => undefined),
        createConnectionConfig: jest.fn(async (): Promise<void> => undefined),
    };
    const deps = {
        rpcClient: { getBIDiagramRpcClient: () => rpc },
        platformRpcClient: platform,
        platformExtState: state,
        item: kbService(opts.serviceProject),
        node: { codedata: { org: "ballerinax", module: "ai.wso2.integration" } } as unknown as AvailableNode,
        projectPath: "/work/app",
        target: { line: 1, offset: 0 },
        fileName: "/work/app/connections.bal",
    } as unknown as PrepareDevantKnowledgeBaseDeps;
    return { deps, platform, tempConfigNames };
}

describe("isVersionAtLeast", () => {
    it.each([
        ["1.2.0", "1.2.0", true],
        ["1.2.1", "1.2.0", true],
        ["1.10.0", "1.2.0", true],
        ["2.0.0", "1.2.0", true],
        ["1.2.0-SNAPSHOT", "1.2.0", true],
        ["1.1.9", "1.2.0", false],
        ["1.1.1", "1.2.0", false],
        ["0.9.0", "1.2.0", false],
        [undefined, "1.2.0", false],
        ["", "1.2.0", false],
        ["not-a-version", "1.2.0", false],
    ])("%p >= %p is %p", (version, min, expected) => {
        expect(isVersionAtLeast(version as string | undefined, min)).toBe(expected);
    });

    it("gates API key auth on the first connector version that has ApiKeyConfig", () => {
        expect(supportsApiKeyAuth(API_KEY_AUTH_MIN_VERSION)).toBe(true);
        expect(supportsApiKeyAuth("1.1.1")).toBe(false);
    });
});

describe("prepareDevantKnowledgeBase", () => {
    // Every access mode × connector version: the auth is pre-filled with the API key exactly when the
    // connection goes through the gateway AND the connector can take an ApiKeyConfig.
    const cases = [
        { access: "gateway", serviceProject: "other-proj", version: "1.2.0", wiresApiKey: true },
        { access: "gateway", serviceProject: "other-proj", version: "1.3.4", wiresApiKey: true },
        { access: "gateway", serviceProject: "other-proj", version: "1.1.1", wiresApiKey: false },
        { access: "gateway", serviceProject: "other-proj", version: undefined, wiresApiKey: false },
        { access: "project", serviceProject: MY_PROJECT, version: "1.2.0", wiresApiKey: false },
        { access: "project", serviceProject: MY_PROJECT, version: "1.1.1", wiresApiKey: false },
    ];

    it.each(cases)(
        "$access access, connector $version: pre-fills the API key auth = $wiresApiKey",
        async ({ access, serviceProject, version, wiresApiKey }) => {
            const { deps, platform, tempConfigNames } = setup({ serviceProject, version });

            const flowNode = await prepareDevantKnowledgeBase(deps);
            const props = flowNode.properties as any;

            // The connection is created with the schema of its access mode.
            const createReq = (platform.createInternalConnection.mock.calls[0] as any[])[0];
            expect(createReq.serviceSchemaId).toBe(access === "gateway" ? "api-key" : "project-url");

            // The service URL is always wired, as an expression referencing its configurable.
            expect(props.serviceUrl.value).toBe(`docs_kb_${SERVICE_URL_ENTRY}`);
            expect(props.serviceUrl.types.find((t: any) => t.selected).fieldType).toBe("EXPRESSION");

            const apiKeyVar = `docs_kb_${API_KEY_ENTRY}`;
            if (wiresApiKey) {
                expect(tempConfigNames).toEqual([`docs_kb_${SERVICE_URL_ENTRY}`, apiKeyVar]);
                expect(props.knowledgeBaseAuthConfig.value).toBe(`{auth: {apiKey: ${apiKeyVar}}}`);
                expect(props.knowledgeBaseAuthConfig.types.find((t: any) => t.selected).fieldType).toBe("EXPRESSION");
                // The record literal doesn't use `http:`, so the import must not land unused.
                expect(props.knowledgeBaseAuthConfig.imports.http).toBeUndefined();
            } else {
                // No configurable is created that nothing would reference.
                expect(tempConfigNames).toEqual([`docs_kb_${SERVICE_URL_ENTRY}`]);
                expect(props.knowledgeBaseAuthConfig.value).toBe("");
                expect(props.knowledgeBaseAuthConfig.imports.http).toBe("ballerina/http");
            }

            // Every configurable created is rewritten to os:getEnv(...) from the connection's variables,
            // and the API key one is marked secret.
            const replaceReq = (platform.replaceDevantTempConfigValues.mock.calls[0] as any[])[0];
            expect(replaceReq.configs.map((c: any) => c.name)).toEqual(tempConfigNames);
            const apiKeyConfig = replaceReq.configs.find((c: any) => c.id === API_KEY_ENTRY);
            expect(!!apiKeyConfig).toBe(wiresApiKey);
            if (apiKeyConfig) {
                expect(apiKeyConfig.isSecret).toBe(true);
            }
        },
    );

    it.each([
        ["rejects", () => Promise.reject(new Error("409 conflict"))],
        ["returns nothing", () => Promise.resolve(undefined)],
    ])("removes every placeholder configurable when WSO2 Cloud %s", async (_label, create) => {
        const { deps, platform, tempConfigNames } = setup({ serviceProject: "other-proj", version: "1.2.0" });
        platform.createInternalConnection.mockImplementation(create as any);

        await expect(prepareDevantKnowledgeBase(deps)).rejects.toThrow();

        const deleteReq = (platform.deleteDevantTempConfigs.mock.calls[0] as any[])[0];
        expect(deleteReq.nodes.map((n: any) => n.name)).toEqual(tempConfigNames);
        expect(tempConfigNames).toHaveLength(2);
        expect(platform.replaceDevantTempConfigValues).not.toHaveBeenCalled();
    });

    it("sends the key in the connector's default header, which is the one the gateway reads", () => {
        expect(apiKeyAuthConfigExpression("kb_key")).toBe("{auth: {apiKey: kb_key}}");
        expect(apiKeyAuthConfigExpression("kb_key")).not.toContain("headerName");
    });
});
