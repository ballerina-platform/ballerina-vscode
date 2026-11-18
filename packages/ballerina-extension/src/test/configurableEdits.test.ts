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

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { window } from "vscode";

// config.bal and the language server are fakes: each configurable sits on its own line, and `mockProject.readers` says which are still read.
const mockProject = {
    configurables: [] as { name: string; env?: string }[],
    readers: new Set<string>(),
    manifest: {} as { mcpServers?: { proxy: string; env: { url: string } }[]; llmProviders?: { provider: string; env: { url: string; apikey?: string } }[] },
    deleted: [] as string[],
    failOn: undefined as string | undefined,
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
        deleteConfigVariableV2: async ({ configFilePath, configVariable }: { configFilePath: string; configVariable: { properties: { variable: { value: string } } } }) => {
            const name = configVariable.properties.variable.value;
            if (name === mockProject.failOn) {
                throw new Error("timed out");
            }
            mockProject.deleted.push(name);
            mockProject.configurables = mockProject.configurables.filter((configurable) => configurable.name !== name);
            if (fs.existsSync(configFilePath)) {
                fs.writeFileSync(configFilePath, mockProject.configurables.map((configurable) => configurable.name).join("\n"));
                const toml = path.join(path.dirname(configFilePath), "Config.toml");
                if (fs.existsSync(toml)) {
                    fs.writeFileSync(toml, fs.readFileSync(toml, "utf8").split("\n").filter((line) => !line.startsWith(`${name} =`)).join("\n"));
                }
            }
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
    updateManifest: (projectPath: string, update: (manifest: typeof mockProject.manifest) => typeof mockProject.manifest) => {
        mockProject.manifest = update(mockProject.manifest);
        const file = path.join(projectPath, ".wso2", "agent-manager.yaml");
        if (fs.existsSync(file)) {
            fs.writeFileSync(file, JSON.stringify(mockProject.manifest));
        }
    },
}));

import { referencedGeneratedConfigurables, removeFreedConfigurables, serially } from "../features/agent-manager/bindings";
import { undoRedoManager } from "../stateMachine";

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
    mockProject.failOn = undefined;
});

// Reads what the code uses with `before`, then removes what the delete left unread once only `after` is read.
async function deleteReader(before: string[], after: string[], keep?: string[], projectPath = "/project") {
    mockProject.readers = new Set(before);
    const referenced = await referencedGeneratedConfigurables(projectPath);
    mockProject.readers = new Set(after);
    await removeFreedConfigurables(projectPath, referenced, keep);
}

const ALL_GENERATED = ["deepwikiMcpUrl", "docsMcpUrl", "openaiUrl", "openaiKey", ...AGENT_ID.map((configurable) => configurable.name)];

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

describe("Removing the configurables a delete freed", () => {
    it("drops a deleted MCP server's URL and manifest entry and the AgentID configurables once nothing reads them, never the developer's own", async () => {
        await deleteReader([...ALL_GENERATED, "myToken"], ["docsMcpUrl", "openaiUrl", "openaiKey"]);
        expect(mockProject.deleted.sort()).toEqual(["deepwikiMcpUrl", ...AGENT_ID_NAMES].sort());
        expect(mockProject.configurables.map((configurable) => configurable.name)).toEqual(["docsMcpUrl", "openaiUrl", "openaiKey", "myToken", "retries"]);
        expect(mockProject.manifest.mcpServers?.map((entry) => entry.proxy)).toEqual(["docs"]);
        expect(mockProject.manifest.llmProviders).toHaveLength(1);
    });

    it("drops a deleted model provider's URL, key and manifest entry", async () => {
        await deleteReader(ALL_GENERATED, ["deepwikiMcpUrl", "docsMcpUrl", ...AGENT_ID_NAMES]);
        expect(mockProject.deleted.sort()).toEqual(["openaiKey", "openaiUrl"]);
        expect(mockProject.manifest.llmProviders).toEqual([]);
        expect(mockProject.manifest.mcpServers).toHaveLength(2);
    });

    it("keeps the AgentID configurables while another OAuth server reads them", async () => {
        await deleteReader(ALL_GENERATED, ["docsMcpUrl", "openaiUrl", "openaiKey", ...AGENT_ID_NAMES]);
        expect(mockProject.deleted).toEqual(["deepwikiMcpUrl"]);
    });

    it("leaves the env names it is asked to keep, such as an unsaved pick's", async () => {
        await deleteReader(ALL_GENERATED, ["docsMcpUrl"], [...AGENT_ID.map((configurable) => configurable.env), "OPENAI_URL", "OPENAI_API_KEY"]);
        expect(mockProject.deleted).toEqual(["deepwikiMcpUrl"]);
    });

    it("leaves a generated configurable nothing read before the delete", async () => {
        await deleteReader(["deepwikiMcpUrl", "docsMcpUrl", ...AGENT_ID_NAMES], ["docsMcpUrl", ...AGENT_ID_NAMES]);
        expect(mockProject.deleted).toEqual(["deepwikiMcpUrl"]);
        expect(mockProject.manifest.llmProviders).toHaveLength(1);
    });

    it("removes nothing while every generated configurable is read", async () => {
        await deleteReader(ALL_GENERATED, ALL_GENERATED);
        expect(mockProject.deleted).toEqual([]);
        expect(mockProject.manifest.mcpServers).toHaveLength(2);
    });

    it("warns on a failed removal, keeps the manifest and still records what changed for undo", async () => {
        const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "configurable-edits-"));
        fs.writeFileSync(path.join(projectPath, "config.bal"), mockProject.configurables.map((configurable) => configurable.name).join("\n"));
        const warn = jest.spyOn(window, "showWarningMessage");
        mockProject.failOn = AGENT_ID_NAMES[0];
        try {
            await deleteReader(ALL_GENERATED, ["docsMcpUrl", "openaiUrl", "openaiKey"], [], projectPath);
            expect(mockProject.deleted).toEqual(["deepwikiMcpUrl"]);
            expect(warn).toHaveBeenCalledWith(expect.stringContaining("timed out"));
            expect(warn.mock.calls[0][0]).not.toContain("deepwikiMcpUrl");
            expect(mockProject.manifest.mcpServers).toHaveLength(2);
            expect(undoRedoManager.addFileToBatch).toHaveBeenCalledWith(path.join(projectPath, "config.bal"), expect.any(String), expect.any(String));
        } finally {
            warn.mockRestore();
            fs.rmSync(projectPath, { recursive: true, force: true });
        }
    });

    it("records the Config.toml values and the manifest it removes for undo", async () => {
        const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "configurable-edits-"));
        const toml = path.join(projectPath, "Config.toml");
        const manifest = path.join(projectPath, ".wso2", "agent-manager.yaml");
        fs.writeFileSync(path.join(projectPath, "config.bal"), mockProject.configurables.map((configurable) => configurable.name).join("\n"));
        fs.writeFileSync(toml, 'deepwikiMcpUrl = "https://mcp.example.com"\nretries = 3');
        fs.mkdirSync(path.dirname(manifest));
        fs.writeFileSync(manifest, JSON.stringify(mockProject.manifest));
        const recorded = jest.mocked(undoRedoManager.addFileToBatch);
        recorded.mockClear();
        try {
            await deleteReader(["deepwikiMcpUrl"], [], [], projectPath);
            expect(recorded).toHaveBeenCalledWith(toml, expect.stringContaining("deepwikiMcpUrl"), "retries = 3");
            expect(recorded).toHaveBeenCalledWith(manifest, expect.stringContaining("deepwiki"), expect.not.stringContaining("deepwiki"));
        } finally {
            fs.rmSync(projectPath, { recursive: true, force: true });
        }
    });
});
