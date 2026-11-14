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

// config.bal and the language server are fakes: each configurable sits on its own line, and `mockProject.readers` says which are still read.
const mockProject = {
    configurables: [] as { name: string; env?: string }[],
    readers: new Set<string>(),
    manifest: {} as { mcpServers?: { proxy: string; env: { url: string } }[]; llmProviders?: { provider: string; env: { url: string; apikey?: string } }[] },
    deleted: [] as string[],
};
const mockNode = (index: number) => {
    const { name, env } = mockProject.configurables[index];
    return {
        properties: { variable: { value: name }, defaultValue: { value: env ? `os:getEnv("${env}")` : `"local"` } },
        codedata: { lineRange: { fileName: "config.bal", startLine: { line: index, offset: 0 }, endLine: { line: index, offset: 1 } } },
    };
};

jest.mock("@wso2/ballerina-core", () => ({ __esModule: true, isSamePath: (a: string, b: string) => a === b }));
jest.mock("../rpc-managers/bi-diagram/rpc-manager", () => ({
    __esModule: true,
    BiDiagramRpcManager: jest.fn().mockImplementation(() => ({
        getConfigVariablesV2: async () => ({ configVariables: { "acme/agent": { "": mockProject.configurables.map((_, index) => mockNode(index)) } } }),
        deleteConfigVariableV2: async ({ configVariable }: { configVariable: { properties: { variable: { value: string } } } }) => {
            const name = configVariable.properties.variable.value;
            mockProject.deleted.push(name);
            mockProject.configurables = mockProject.configurables.filter((configurable) => configurable.name !== name);
        },
    })),
}));
jest.mock("../rpc-managers/ai-panel/repair-utils", () => ({
    __esModule: true,
    checkProjectDiagnostics: async () => [],
    removeUnusedImports: async () => undefined,
}));
jest.mock("../stateMachine", () => ({
    __esModule: true,
    undoRedoManager: { startBatchOperation: jest.fn(), addFileToBatch: jest.fn(), commitBatchOperation: jest.fn() },
    StateMachine: {
        langClient: () => ({
            getSTByRange: async ({ lineRange }: { lineRange: { start: { line: number } } }) => ({
                syntaxTree: { typedBindingPattern: { bindingPattern: { variableName: { position: { startLine: lineRange.start.line, startColumn: 0 } } } } },
            }),
            getReferences: async ({ position }: { position: { line: number } }) => mockProject.readers.has(mockProject.configurables[position.line]?.name)
                ? [{ uri: "file:///project/agents.bal", range: { start: { line: 3, character: 4 } } }]
                : [],
        }),
    },
}));
jest.mock("../utils/config", () => ({ __esModule: true, getProjectTomlValues: async () => ({ package: { org: "acme", name: "agent" } }) }));
jest.mock("../features/agent-manager/client", () => ({
    __esModule: true,
    api: {},
    MANIFEST_FILE: ".wso2/agent-manager.yaml",
    readManifest: () => mockProject.manifest,
    updateManifest: (_path: string, update: (manifest: typeof mockProject.manifest) => typeof mockProject.manifest) => {
        mockProject.manifest = update(mockProject.manifest);
    },
}));

import { removeUnusedGeneratedConfigurables, serially } from "../features/agent-manager/bindings";

const AGENT_ID = [
    { name: "agentIdTokenUrl", env: "AMP_AGENTID_TOKEN_ENDPOINT" },
    { name: "agentIdScopes", env: "AMP_AGENTID_SCOPES" },
    { name: "agentIdClientId", env: "AMP_AGENTID_CLIENT_ID" },
    { name: "agentIdClientSecret", env: "AMP_AGENTID_CLIENT_SECRET" },
];
const AGENT_ID_NAMES = AGENT_ID.map((configurable) => configurable.name);

beforeEach(() => {
    mockProject.configurables = [
        { name: "deepwikiMcpUrl", env: "DEEPWIKI_MCP_URL" },
        { name: "docsMcpUrl", env: "DOCS_MCP_URL" },
        ...AGENT_ID,
        { name: "openaiUrl", env: "OPENAI_URL" },
        { name: "openaiKey", env: "OPENAI_API_KEY" },
        { name: "myToken", env: "MY_TOKEN" },
        { name: "retries" },
    ];
    mockProject.manifest = {
        mcpServers: [{ proxy: "deepwiki", env: { url: "DEEPWIKI_MCP_URL" } }, { proxy: "docs", env: { url: "DOCS_MCP_URL" } }],
        llmProviders: [{ provider: "openai", env: { url: "OPENAI_URL", apikey: "OPENAI_API_KEY" } }],
    };
    mockProject.deleted = [];
});

describe("Configurable edits", () => {
    it("run one at a time in the order asked, past a failed one", async () => {
        const order: string[] = [];
        const edit = (name: string, ms: number, fail = false) => () => new Promise<void>((resolve, reject) => setTimeout(() => {
            order.push(name);
            return fail ? reject(new Error(name)) : resolve();
        }, ms));
        const deferredValues = serially(edit("deferred values", 30));
        const discard = serially(edit("discard", 0, true));
        const nextPick = serially(edit("next pick", 0));
        await expect(discard).rejects.toThrow("discard");
        await Promise.all([deferredValues, nextPick]);
        expect(order).toEqual(["deferred values", "discard", "next pick"]);
    });
});

describe("Removing unused Agent Manager configurables", () => {
    it("drops a deleted MCP server's URL and manifest entry and the AgentID configurables once nothing reads them, never the developer's own", async () => {
        mockProject.readers = new Set(["docsMcpUrl", "openaiUrl", "openaiKey"]);
        await removeUnusedGeneratedConfigurables("/project");
        expect(mockProject.deleted.sort()).toEqual(["deepwikiMcpUrl", ...AGENT_ID_NAMES].sort());
        expect(mockProject.configurables.map((configurable) => configurable.name)).toEqual(["docsMcpUrl", "openaiUrl", "openaiKey", "myToken", "retries"]);
        expect(mockProject.manifest.mcpServers?.map((entry) => entry.proxy)).toEqual(["docs"]);
        expect(mockProject.manifest.llmProviders).toHaveLength(1);
    });

    it("drops a deleted model provider's URL, key and manifest entry", async () => {
        mockProject.readers = new Set(["deepwikiMcpUrl", "docsMcpUrl", ...AGENT_ID_NAMES]);
        await removeUnusedGeneratedConfigurables("/project");
        expect(mockProject.deleted.sort()).toEqual(["openaiKey", "openaiUrl"]);
        expect(mockProject.manifest.llmProviders).toEqual([]);
        expect(mockProject.manifest.mcpServers).toHaveLength(2);
    });

    it("keeps the AgentID configurables while another OAuth server reads them", async () => {
        mockProject.readers = new Set(["docsMcpUrl", "openaiUrl", "openaiKey", ...AGENT_ID_NAMES]);
        await removeUnusedGeneratedConfigurables("/project");
        expect(mockProject.deleted).toEqual(["deepwikiMcpUrl"]);
    });

    it("leaves the env names it is asked to keep, such as an unsaved pick's", async () => {
        mockProject.readers = new Set(["docsMcpUrl"]);
        await removeUnusedGeneratedConfigurables("/project", [...AGENT_ID.map((configurable) => configurable.env), "OPENAI_URL", "OPENAI_API_KEY"]);
        expect(mockProject.deleted).toEqual(["deepwikiMcpUrl"]);
    });

    it("removes nothing while every generated configurable is read", async () => {
        mockProject.readers = new Set(["deepwikiMcpUrl", "docsMcpUrl", "openaiUrl", "openaiKey", ...AGENT_ID_NAMES]);
        await removeUnusedGeneratedConfigurables("/project");
        expect(mockProject.deleted).toEqual([]);
        expect(mockProject.manifest.mcpServers).toHaveLength(2);
    });
});
