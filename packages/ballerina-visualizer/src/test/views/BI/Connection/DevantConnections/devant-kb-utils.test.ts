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
import {
    AddDevantTempConfigReq,
    CreateInternalConnectionReq,
    DeleteDevantTempConfigReq,
    PlatformExtState,
    ReplaceDevantTempConfigValuesReq,
} from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import {
    ConnectionDetailed,
    GetMarketplaceListReq,
    MarketplaceItem,
    MarketplaceItemSchema,
    MarketplaceListResp,
} from "@wso2/wso2-platform-core";
import {
    API_KEY_AUTH_MIN_VERSION,
    API_KEY_ENTRY,
    PrepareDevantKnowledgeBaseDeps,
    SERVICE_URL_ENTRY,
    apiKeyAuthConfigExpression,
    isVersionAtLeast,
    listAllMarketplaceItems,
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

// A service's `projectId` is its project's name, which the selected context's `projectName` is compared with.
const MY_PROJECT = "my-project";

// A knowledge base service in `projectId`; Project visibility only applies within its own project.
const kbService = (projectId: string, name = "docs-kb"): MarketplaceItem =>
    ({
        name,
        serviceId: "svc:docs-kb",
        projectId,
        resourceType: "SERVICE",
        isThirdParty: false,
        visibility: ["PROJECT", "ORGANIZATION"],
        connectionSchemas: [PROJECT_URL_SCHEMA, API_KEY_SCHEMA] as unknown as MarketplaceItemSchema[],
    } as unknown as MarketplaceItem);

const state = {
    session: { org: { handle: "acme", uuid: "org-uuid" } },
    selectedContext: { projectName: MY_PROJECT, project: { id: "proj-1" } },
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

// The node addDevantTempConfig hands back for a placeholder, reduced to what the tests read.
type TempConfigNode = { name: string };

// A module-level `<name> = ...;` declaration as the syntax tree has it, reduced to what the code reads.
const varDecl = (name: string) => ({
    kind: "ModuleVarDecl",
    name,
    typedBindingPattern: { bindingPattern: { kind: "CaptureBindingPattern", variableName: { kind: "IdentifierToken", value: name } } },
});

function setup(opts: {
    serviceProject: string;
    version: string | undefined;
    serviceName?: string;
    biConnNames?: string[];
    integrationId?: string;
}) {
    const tempConfigNames: string[] = [];
    // The variables each project file declares: connections.bal as given, config.bal as the placeholders added so far.
    const declaredIn = (file: string) => (file === "connections.bal" ? opts.biConnNames ?? [] : tempConfigNames);
    const rpc = {
        getNodeTemplate: jest.fn(async (): Promise<{ flowNode?: FlowNode; errorMsg?: string }> => ({ flowNode: template(opts.version) })),
    };
    const visualizer = {
        joinProjectPath: jest.fn(async ({ segments }: { segments: string | string[] }) => ({
            filePath: `/work/app/${([] as string[]).concat(segments).join("/")}`,
            projectPath: "/work/app",
        })),
    };
    const langClient = {
        getST: jest.fn(async ({ documentIdentifier }: { documentIdentifier: { uri: string } }) => ({
            syntaxTree: { members: declaredIn(documentIdentifier.uri.split("/").pop() ?? "").map(varDecl) },
            parseSuccess: true,
        })),
    };
    const platform = {
        getConnections: jest.fn(async (_req: { componentId: string }) => [] as { name: string }[]),
        addDevantTempConfig: jest.fn(async ({ name }: AddDevantTempConfigReq): Promise<{ configNode?: TempConfigNode }> => {
            tempConfigNames.push(name);
            return { configNode: { name } };
        }),
        createInternalConnection: jest.fn(
            async (_req: CreateInternalConnectionReq): Promise<ConnectionDetailed | undefined> =>
                ({ name: "docs_kb", configurations: {} }) as unknown as ConnectionDetailed,
        ),
        deleteDevantTempConfigs: jest.fn(async (_req: DeleteDevantTempConfigReq): Promise<void> => undefined),
        replaceDevantTempConfigValues: jest.fn(async (_req: ReplaceDevantTempConfigValuesReq): Promise<void> => undefined),
        createConnectionConfig: jest.fn(async (): Promise<void> => undefined),
    };
    // The placeholders deleteDevantTempConfigs was asked to remove, by name.
    const deletedNames = (call = 0) =>
        (platform.deleteDevantTempConfigs.mock.calls[call][0].nodes as unknown as TempConfigNode[]).map((n) => n.name);
    const deps = {
        rpcClient: {
            getBIDiagramRpcClient: () => rpc,
            getVisualizerRpcClient: () => visualizer,
            getLangClientRpcClient: () => langClient,
        },
        platformRpcClient: platform,
        platformExtState: opts.integrationId
            ? { ...state, selectedIntegration: { integration: { id: opts.integrationId } } }
            : state,
        item: kbService(opts.serviceProject, opts.serviceName),
        node: { codedata: { org: "ballerinax", module: "ai.wso2.integration" } } as unknown as AvailableNode,
        projectPath: "/work/app",
        target: { line: 1, offset: 0 },
        fileName: "/work/app/connections.bal",
    } as unknown as PrepareDevantKnowledgeBaseDeps;
    return { deps, rpc, platform, tempConfigNames, deletedNames };
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

            const gateway = access === "gateway";
            const urlVar = `docs_kb_${SERVICE_URL_ENTRY}`;
            const apiKeyVar = `docs_kb_${API_KEY_ENTRY}`;

            // The connection is created with the schema of its access mode, naming the configurables the
            // platform fills: the endpoint URL, and with gateway access the API key.
            const createReq = platform.createInternalConnection.mock.calls[0][0];
            expect(createReq.serviceSchemaId).toBe(gateway ? "api-key" : "project-url");
            expect(createReq.serviceVisibility).toBe(gateway ? "ORGANIZATION" : "PROJECT");
            expect(createReq.configurableName).toBe(urlVar);
            expect(createReq.apiKeyConfigurableName).toBe(gateway ? apiKeyVar : undefined);

            // A configurable is made for every entry of the schema, whatever the connector version.
            expect(tempConfigNames).toEqual(gateway ? [urlVar, apiKeyVar] : [urlVar]);

            // The service URL is always wired, as an expression referencing its configurable.
            expect(props.serviceUrl.value).toBe(urlVar);
            expect(props.serviceUrl.types.find((t: any) => t.selected).fieldType).toBe("EXPRESSION");

            if (wiresApiKey) {
                expect(props.knowledgeBaseAuthConfig.value).toBe(`{auth: {apiKey: ${apiKeyVar}}}`);
                expect(props.knowledgeBaseAuthConfig.types.find((t: any) => t.selected).fieldType).toBe("EXPRESSION");
                // The record literal doesn't use `http:`, so the import must not land unused.
                expect(props.knowledgeBaseAuthConfig.imports.http).toBeUndefined();
            } else {
                // The connector can't take the key as its auth (or there is no key): the auth is left as it was.
                expect(props.knowledgeBaseAuthConfig.value).toBe("");
                expect(props.knowledgeBaseAuthConfig.imports.http).toBe("ballerina/http");
            }

            // Every configurable created is rewritten to os:getEnv(...) from the connection's variables,
            // and the API key one is marked secret.
            const replaceReq = platform.replaceDevantTempConfigValues.mock.calls[0][0];
            expect(replaceReq.configs.map((c) => c.name)).toEqual(tempConfigNames);
            const apiKeyConfig = replaceReq.configs.find((c) => c.id === API_KEY_ENTRY);
            expect(!!apiKeyConfig).toBe(gateway);
            if (apiKeyConfig) {
                expect(apiKeyConfig.isSecret).toBe(true);
            }
        },
    );

    it.each<[string, () => Promise<ConnectionDetailed | undefined>]>([
        ["rejects", () => Promise.reject(new Error("409 conflict"))],
        ["returns nothing", () => Promise.resolve(undefined)],
    ])("removes every placeholder configurable when WSO2 Cloud %s", async (_label, create) => {
        const { deps, platform, tempConfigNames, deletedNames } = setup({ serviceProject: "other-proj", version: "1.2.0" });
        platform.createInternalConnection.mockImplementation(create);

        await expect(prepareDevantKnowledgeBase(deps)).rejects.toThrow();

        expect(deletedNames()).toEqual(tempConfigNames);
        expect(tempConfigNames).toHaveLength(2);
        expect(platform.replaceDevantTempConfigValues).not.toHaveBeenCalled();
    });

    it("removes the placeholders already added when a later one can't be added, before connecting", async () => {
        const { deps, platform, tempConfigNames, deletedNames } = setup({ serviceProject: "other-proj", version: "1.2.0" });
        // The service URL placeholder is added; the host fails the API key one and resolves to nothing.
        platform.addDevantTempConfig
            .mockImplementationOnce(async ({ name }) => {
                tempConfigNames.push(name);
                return { configNode: { name } };
            })
            .mockImplementationOnce(async () => undefined);

        await expect(prepareDevantKnowledgeBase(deps)).rejects.toThrow(`docs_kb_${API_KEY_ENTRY}`);

        expect(deletedNames()).toEqual([`docs_kb_${SERVICE_URL_ENTRY}`]);
        expect(platform.createInternalConnection).not.toHaveBeenCalled();
    });

    it("fails with the language server's message when the form template can't be loaded, before touching anything", async () => {
        const { deps, rpc, platform } = setup({ serviceProject: "other-proj", version: "1.2.0" });
        rpc.getNodeTemplate.mockResolvedValueOnce({ errorMsg: "Module not found: ballerinax/ai.wso2.integration" });

        await expect(prepareDevantKnowledgeBase(deps)).rejects.toThrow("Module not found: ballerinax/ai.wso2.integration");

        expect(platform.addDevantTempConfig).not.toHaveBeenCalled();
        expect(platform.createInternalConnection).not.toHaveBeenCalled();
    });

    // Whichever step after the connection fails, no placeholder is left behind in config.bal.
    it.each(["replaceDevantTempConfigValues", "createConnectionConfig"] as const)(
        "removes the placeholders when %s fails after WSO2 Cloud created the connection",
        async (step) => {
            const { deps, platform, tempConfigNames, deletedNames } = setup({ serviceProject: "other-proj", version: "1.2.0" });
            platform[step].mockRejectedValueOnce(new Error("disk full"));

            await expect(prepareDevantKnowledgeBase(deps)).rejects.toThrow(/created in WSO2 Cloud.*disk full/);

            // Found again by name in config.bal, since writing os:getEnv(...) moved their ranges.
            expect(deletedNames()).toEqual(tempConfigNames);
            expect(tempConfigNames).toHaveLength(2);
        },
    );

    it("names the connection apart from the variables connections.bal already declares", async () => {
        const { deps, platform } = setup({ serviceProject: "other-proj", version: "1.2.0", biConnNames: ["docs_kb"] });

        const flowNode = await prepareDevantKnowledgeBase(deps);

        expect(platform.createInternalConnection.mock.calls[0][0].name).toBe("docs_kb1");
        expect((flowNode.properties as { variable: { value: string } }).variable.value).toBe("docs_kb1");
    });

    it("names the connection apart from the selected integration's WSO2 Cloud connections", async () => {
        const { deps, platform } = setup({ serviceProject: "other-proj", version: "1.2.0", integrationId: "int-1" });
        platform.getConnections.mockResolvedValueOnce([{ name: "docs-kb" }]);

        await prepareDevantKnowledgeBase(deps);

        expect(platform.getConnections.mock.calls[0][0].componentId).toBe("int-1");
        expect(platform.createInternalConnection.mock.calls[0][0].name).toBe("docs_kb1");
    });

    it("drops the http import from every property but one whose value uses the prefix", async () => {
        const { deps, rpc } = setup({ serviceProject: "other-proj", version: "1.2.0" });
        const node = template("1.2.0");
        const props = node.properties as Record<string, { value: string; imports?: Record<string, string> }>;
        props.retryConfig = { value: "", imports: { http: "ballerina/http" } };
        props.httpVersion = { value: "http:HTTP_2_0", imports: { http: "ballerina/http" } };
        rpc.getNodeTemplate.mockResolvedValueOnce({ flowNode: node });

        await prepareDevantKnowledgeBase(deps);

        expect(props.knowledgeBaseAuthConfig.imports?.http).toBeUndefined();
        expect(props.retryConfig.imports?.http).toBeUndefined();
        expect(props.httpVersion.imports?.http).toBe("ballerina/http");
    });

    it("names the connection and its configurables with a valid identifier when the service name has a path", async () => {
        // Endpoints are listed as `<integration> / <endpoint>`, and `/` can't be in a Ballerina identifier.
        const { deps, platform, tempConfigNames } = setup({
            serviceProject: "other-proj",
            version: "1.2.0",
            serviceName: "My KB / default",
        });

        const flowNode = await prepareDevantKnowledgeBase(deps);

        const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
        const connName = platform.createInternalConnection.mock.calls[0][0].name;
        expect(connName).toBe("My_KB_default");
        expect((flowNode.properties as { variable: { value: string } }).variable.value).toBe(connName);
        tempConfigNames.forEach((name) => expect(name).toMatch(identifier));
    });

    it("sends the key in the connector's default header, which is the one the gateway reads", () => {
        expect(apiKeyAuthConfigExpression("kb_key")).toBe("{auth: {apiKey: kb_key}}");
        expect(apiKeyAuthConfigExpression("kb_key")).not.toContain("headerName");
    });
});

describe("listAllMarketplaceItems", () => {
    const item = (i: number) => ({ name: `svc-${i}` }) as unknown as MarketplaceItem;

    // A host like rpc-manager's: every endpoint in the project, sliced by offset and limit.
    function host(total: number, opts: { miscount?: number } = {}) {
        const all = Array.from({ length: total }, (_, i) => item(i));
        const getMarketplaceItems = jest.fn(async ({ request }: GetMarketplaceListReq): Promise<MarketplaceListResp> => {
            const offset = request.offset ?? 0;
            const limit = request.limit ?? all.length;
            const reported = opts.miscount ?? all.length;
            return { count: reported, pagination: { limit, offset, total: reported }, data: all.slice(offset, offset + limit) };
        });
        return { getMarketplaceItems };
    }

    // Any total against the page size: every item comes back once, in order, whichever page it is on.
    it.each([0, 1, 49, 50, 51, 120])("returns all %p items, reading every page of 50", async (total) => {
        const client = host(total);

        const resp = await listAllMarketplaceItems(client, "acme", { limit: 50, offset: 0 });

        expect(resp.data.map((d) => d.name)).toEqual(Array.from({ length: total }, (_, i) => `svc-${i}`));
        expect(resp.count).toBe(total);
        expect(client.getMarketplaceItems).toHaveBeenCalledTimes(Math.max(1, Math.ceil(total / 50)));
    });

    it("stops at an empty page even when the host reports more", async () => {
        const client = host(10, { miscount: 1000 });

        const resp = await listAllMarketplaceItems(client, "acme", { limit: 50, offset: 0 });

        expect(resp.data).toHaveLength(10);
        expect(client.getMarketplaceItems).toHaveBeenCalledTimes(2);
    });

    it("fails with a clear message when the host returns nothing, instead of resolving to undefined", async () => {
        const client = {
            getMarketplaceItems: jest.fn(async (_req: GetMarketplaceListReq): Promise<MarketplaceListResp> => undefined),
        };

        await expect(listAllMarketplaceItems(client, "acme", { limit: 50 })).rejects.toThrow("WSO2 Cloud returned no services");
        await expect(listAllMarketplaceItems(undefined, "acme", { limit: 50 })).rejects.toThrow("not available");
    });
});
