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

import { AgentUsage, AgentUsageTrigger, CDModel, ProjectDirectoryMap } from "@wso2/ballerina-core";
import { AgentDeletion, agentDeletionScope, deleteAgentWithTriggers, loadAgentDeletion, planAgentDeletion, triggerKey } from "./agentDeletion";
import { AgentTriggerScopes } from "./agentUsages";

const AGENT_UUID = "c371fce0-2d2e-4e47-2f32-13911cf544a8";
const AGENTS_BAL = "/proj/agents.bal";
const SERVICES_BAL = "/proj/services.bal";
const MAIN_BAL = "/proj/main.bal";

const range = (line: number) => ({
    startLine: { line, offset: 0 },
    endLine: { line: line + 1, offset: 1 },
});

describe("deleting an agent with its triggers", () => {
    const entryPoint = { label: "POST /ask", documentUri: SERVICES_BAL, position: { startLine: 7 } };
    const trigger = (extra: Partial<AgentUsageTrigger> = {}) =>
        ({ serviceName: "/api", documentUri: SERVICES_BAL, position: { startLine: 6 }, listeners: [], ...extra }) as AgentUsageTrigger;

    it("removes a whole service only when nothing else on it remains", () => {
        expect(agentDeletionScope(trigger())).toBe("service");
        expect(agentDeletionScope(trigger({ entryPoint, orphansService: true }))).toBe("service");
        expect(agentDeletionScope(trigger({ entryPoint, orphansService: false }))).toBe("endpoint");
    });

    const CHAT_FILE = "/proj/_agent_chat.bal";
    const OTHER_AGENT_UUID = "0ther-agent";
    const agentAt = (symbol: string, uuid: string, line: number, extra = {}) =>
        ({ symbol, location: { filePath: AGENTS_BAL, ...range(line) }, scope: "GLOBAL", kind: "Agent", uuid, ...extra });
    const resource = (path: string, line: number, filePath: string, connections: string[]) =>
        ({ accessor: "post", path, location: { filePath, ...range(line) }, connections, agentCalls: connections.map((connection) => ({ connection, line })) });
    const service = (filePath: string, line: number, uuid: string, type: string, resources: ReturnType<typeof resource>[]) => ({
        location: { filePath, ...range(line) },
        attachedListeners: [`${uuid}-listener`],
        connections: [...new Set(resources.flatMap((fn) => fn.connections))],
        functions: [],
        remoteFunctions: [],
        resourceFunctions: resources,
        absolutePath: `/${uuid}`,
        type,
        uuid,
    });
    const chatService = (filePath: string, line: number, uuid: string) =>
        service(filePath, line, uuid, "ai:Service", [resource("chat", line + 1, filePath, [AGENT_UUID])]);
    const listenerOf = (filePath: string, line: number, uuid: string) =>
        ({ symbol: `${uuid}Listener`, location: { filePath, ...range(line) }, attachedServices: [uuid], uuid: `${uuid}-listener` });
    const designModel = (services: unknown[], listeners: unknown[], agentLine = 4, extra: Partial<CDModel> = {}) =>
        ({ connections: [agentAt("mathTutorAgent", AGENT_UUID, agentLine)], listeners, services, ...extra }) as unknown as CDModel;
    const scopes: AgentTriggerScopes = new Map([["ai", "SERVICE"], ["http", "ENTRY_POINT"]]);
    const ref = { filePath: AGENTS_BAL, startLine: 4, symbol: "mathTutorAgent" };
    const deletionOf = (model: CDModel): AgentDeletion =>
        ({ plan: planAgentDeletion(model, ref, "agent", scopes), scopes, chatServices: 0, dangling: [], cleanup: [] });
    const labels = (rows: AgentUsage[]) => rows.map((row) => row.label);

    it("deletes a chat trigger and an endpoint, but blocks on main and on agents that use it as a tool", () => {
        const api = service(SERVICES_BAL, 10, "api", "http:Service", [
            resource("ask", 11, SERVICES_BAL, [AGENT_UUID]),
            resource("health", 14, SERVICES_BAL, []),
        ]);
        const plan = planAgentDeletion(designModel([chatService(MAIN_BAL, 6, "MathTutor"), api], [], 4, {
            connections: [agentAt("mathTutorAgent", AGENT_UUID, 4), agentAt("supervisor", OTHER_AGENT_UUID, 9, { delegatesTo: [AGENT_UUID] })],
            automation: { name: "main", displayName: "main", location: { filePath: MAIN_BAL, ...range(1) }, connections: [AGENT_UUID], agentCalls: [{ connection: AGENT_UUID, line: 2 }], uuid: "auto" },
        } as never), ref, "agent", scopes);

        expect(labels(plan.triggers)).toEqual(["Agent Chat", "POST /ask"]);
        expect(plan.triggers.map((row) => agentDeletionScope(row.trigger!))).toEqual(["service", "endpoint"]);
        expect(labels(plan.blockers)).toEqual(["main", "supervisor"]);
        expect(plan.shared).toEqual([]);
    });

    it("will not delete an endpoint or a service that also runs another agent", () => {
        const router = service(SERVICES_BAL, 10, "hub", "http:Service", [
            resource("route", 11, SERVICES_BAL, [AGENT_UUID, OTHER_AGENT_UUID]),
            resource("only", 14, SERVICES_BAL, [AGENT_UUID]),
        ]);
        const chat = service(MAIN_BAL, 6, "chat", "ai:Service", [resource("chat", 7, MAIN_BAL, [AGENT_UUID, OTHER_AGENT_UUID])]);
        const plan = planAgentDeletion(designModel([router, chat], [], 4, {
            connections: [agentAt("mathTutorAgent", AGENT_UUID, 4), agentAt("otherAgent", OTHER_AGENT_UUID, 9)],
        } as never), ref, "agent", scopes);

        expect(labels(plan.triggers)).toEqual(["POST /only"]);
        expect(labels(plan.shared)).toEqual(["Agent Chat", "POST /route"]);
    });

    it("does not count the sub-agents a supervisor delegates to as other agents on its endpoint", () => {
        const sales = service(SERVICES_BAL, 10, "sales", "http:Service", [
            { ...resource("ask", 11, SERVICES_BAL, [AGENT_UUID, OTHER_AGENT_UUID]), agentCalls: [{ connection: AGENT_UUID, line: 12 }] },
        ]);
        const plan = planAgentDeletion(designModel([sales], [], 4, {
            connections: [agentAt("mathTutorAgent", AGENT_UUID, 4, { delegatesTo: [OTHER_AGENT_UUID] }), agentAt("quoteAgent", OTHER_AGENT_UUID, 9)],
        } as never), ref, "agent", scopes);

        expect(labels(plan.triggers)).toEqual(["POST /ask"]);
        expect(plan.shared).toEqual([]);
    });

    it("blocks on an event handler that calls the agent itself instead of through a helper", () => {
        const events = { ...service(SERVICES_BAL, 10, "events", "kafka:Service", []), connections: [AGENT_UUID, OTHER_AGENT_UUID], remoteFunctions: [
            { name: "onConsumerRecord", location: { filePath: SERVICES_BAL, ...range(11) }, connections: [AGENT_UUID] },
            { name: "onError", location: { filePath: SERVICES_BAL, ...range(14) }, connections: [OTHER_AGENT_UUID] },
        ] };
        const plan = planAgentDeletion(designModel([events], [], 4, {
            connections: [agentAt("mathTutorAgent", AGENT_UUID, 4), agentAt("otherAgent", OTHER_AGENT_UUID, 9)],
        } as never), ref, "agent", new Map([["kafka", "ENTRY_POINT_BODY"]]));

        expect(labels(plan.blockers)).toEqual(["onConsumerRecord"]);
        expect(plan.triggers).toEqual([]);
    });

    // Each deletion moves the project to the next model, however many reads happen in between.
    const clientSeeing = (models: CDModel[]) => {
        let state = 0;
        const deletions: unknown[][] = [];
        const deleteByComponentInfo = jest.fn((request) => {
            state = Math.min(state + 1, models.length - 1);
            deletions.push(...(request.components ?? [request.component]).map((component) => [component.name, component.startLine]));
            return Promise.resolve({});
        });
        return {
            client: {
                getVisualizerLocation: jest.fn().mockResolvedValue({ projectPath: "/proj" }),
                getBIDiagramRpcClient: () => ({
                    getDesignModel: jest.fn(() => Promise.resolve({ designModel: models[state] })),
                    deleteByComponentInfo,
                }),
                getAIAgentRpcClient: () => ({ fixMissingImports: jest.fn().mockResolvedValue(undefined) }),
            } as never,
            deleted: () => deletions,
        };
    };

    it("deletes the test chat, then each trigger with its listener, re-reading the model in between, then the agent", async () => {
        const main = chatService(MAIN_BAL, 6, "MathTutor");
        const chat = chatService(CHAT_FILE, 3, "agentChat");
        const mainListener = listenerOf(MAIN_BAL, 3, "MathTutor");
        const chatListener = listenerOf(CHAT_FILE, 1, "agentChat");
        const first = designModel([main, chat], [mainListener, chatListener]);
        const { client, deleted } = clientSeeing([
            first,
            designModel([main], [mainListener]),
            designModel([], [], 2),
        ]);

        await deleteAgentWithTriggers(client, "/proj", ref, "agent", { ...deletionOf(first), chatServices: 1 });

        expect(deleted()).toEqual([
            ["/agentChat", 3],
            ["agentChatListener", 1],
            ["/MathTutor", 6],
            ["MathTutorListener", 3],
            ["mathTutorAgent", 2],
        ]);
    });

    it("leaves the triggers the user chose to keep", async () => {
        const main = chatService(MAIN_BAL, 6, "MathTutor");
        const api = service(SERVICES_BAL, 10, "api", "http:Service", [
            resource("ask", 11, SERVICES_BAL, [AGENT_UUID]),
            resource("health", 14, SERVICES_BAL, []),
        ]);
        const first = designModel([main, api], []);
        const ask = planAgentDeletion(first, ref, "agent", scopes).triggers.find((usage) => usage.label === "POST /ask");
        const { client, deleted } = clientSeeing([first, designModel([api], [])]);

        await deleteAgentWithTriggers(client, "/proj", ref, "agent", deletionOf(first), [], new Set([triggerKey(ask!.trigger!)]));

        expect(deleted()).toEqual([["/MathTutor", 6], ["mathTutorAgent", 4]]);
    });

    it("stops before touching the agent when a trigger survives its deletion", async () => {
        const stuck = designModel([chatService(MAIN_BAL, 6, "MathTutor")], []);
        const { client, deleted } = clientSeeing([stuck]);

        await expect(deleteAgentWithTriggers(client, "/proj", ref, "agent", deletionOf(stuck)))
            .rejects.toThrow("remain");
        expect(deleted()).toEqual([["/MathTutor", 6]]);
    });
});

describe("checking what else uses the agent", () => {
    const FUNCTIONS_BAL = "/proj/functions.bal";
    const TEST_BAL = "/proj/tests/agent_test.bal";
    const agent = {
        symbol: "mathTutorAgent", location: { filePath: AGENTS_BAL, ...range(4) }, scope: "GLOBAL", kind: "Agent", uuid: AGENT_UUID,
        modelProvider: { symbol: "tutorModel", type: "Wso2ModelProvider" }, memory: { symbol: "sharedMemory", type: "MessageWindowChatMemory" },
        dependentFunctions: ["sumTool"], mcpToolKits: ["http://localhost:9000/mcp"],
    };
    const model = {
        connections: [
            agent,
            { symbol: "tutorModel", location: { filePath: AGENTS_BAL, ...range(1) }, scope: "GLOBAL", kind: "Model Provider", uuid: "model" },
            { symbol: "sharedMemory", location: { filePath: AGENTS_BAL, ...range(8) }, scope: "GLOBAL", kind: "Connection", uuid: "memory" },
        ],
        listeners: [],
        services: [
            {
                location: { filePath: MAIN_BAL, startLine: { line: 6, offset: 0 }, endLine: { line: 11, offset: 1 } }, attachedListeners: [], connections: [AGENT_UUID], functions: [], remoteFunctions: [],
                resourceFunctions: [{ accessor: "post", path: "chat", location: { filePath: MAIN_BAL, ...range(7) }, connections: [AGENT_UUID], agentCalls: [{ connection: AGENT_UUID, line: 8 }] }],
                absolutePath: "/MathTutor ", type: "ai:Service", uuid: "chat",
            },
            {
                location: { filePath: SERVICES_BAL, startLine: { line: 10, offset: 0 }, endLine: { line: 20, offset: 1 } }, attachedListeners: [], connections: [], functions: [], remoteFunctions: [],
                resourceFunctions: [{ accessor: "get", path: "state", location: { filePath: SERVICES_BAL, ...range(14) }, connections: [] }],
                absolutePath: "/api", type: "http:Service", uuid: "api",
            },
        ],
    } as unknown as CDModel;
    const directoryMap = {
        AGENT_TOOL: [{ name: "sumTool", path: FUNCTIONS_BAL, position: { startLine: 1, startColumn: 0, endLine: 3, endColumn: 1 } }],
    } as unknown as ProjectDirectoryMap;
    const at = (filePath: string, line: number) => ({ filePath, position: { line, offset: 4 } });
    const storeNode = (name: string, line: number) => ({
        codedata: { node: "SHORT_TERM_MEMORY_STORE", lineRange: { fileName: "agents.bal", ...range(line) } },
        properties: { variable: { value: name } },
    });
    const referencesByDeclaration: Record<string, unknown[]> = {
        [`${AGENTS_BAL}:4`]: [at(MAIN_BAL, 8), at(SERVICES_BAL, 15), at(TEST_BAL, 3)],
        [`${AGENTS_BAL}:1`]: [at(AGENTS_BAL, 5)],
        [`${AGENTS_BAL}:8`]: [at(AGENTS_BAL, 5)],
        [`${AGENTS_BAL}:6`]: [at(AGENTS_BAL, 8)],
        [`${AGENTS_BAL}:12`]: [at(AGENTS_BAL, 5), at(SERVICES_BAL, 15)],
        [`${FUNCTIONS_BAL}:1`]: [at(AGENTS_BAL, 5)],
    };
    const client = {
        getBIDiagramRpcClient: () => ({
            getDesignModel: jest.fn().mockResolvedValue({ designModel: model }),
            getProjectStructure: jest.fn().mockResolvedValue({ projects: [{ projectPath: "/proj", directoryMap }] }),
            getDeclarationReferences: jest.fn(({ filePath, startLine }) =>
                Promise.resolve({ references: referencesByDeclaration[`${filePath}:${startLine.line}`] })),
            getModuleNodes: jest.fn().mockResolvedValue({ flowModel: { connections: [
                storeNode("sharedStore", 6),
                storeNode("otherStore", 12),
            ], variables: [] } }),
        }),
        getVisualizerRpcClient: () => ({
            joinProjectPath: jest.fn(({ segments }) => Promise.resolve({ filePath: `/proj/${segments[0]}` })),
        }),
        getServiceDesignerRpcClient: () => ({
            getTriggerModels: jest.fn().mockResolvedValue({ local: [
                { agentTriggerKind: "CHAT", listenerProtocol: "ai", deletionScope: "SERVICE" },
                { agentTriggerKind: "HTTP", listenerProtocol: "http", deletionScope: "ENTRY_POINT" },
            ] }),
        }),
    } as never;

    it("warns about uses outside what gets deleted, and offers only what nothing else uses, the memory's own store included", async () => {
        const deletion = await loadAgentDeletion(client, "/proj", { filePath: AGENTS_BAL, startLine: 4, symbol: "mathTutorAgent" }, "agent");

        expect(deletion.plan.triggers.map((usage) => usage.label)).toEqual(["Agent Chat"]);
        expect(deletion.dangling.map((place) => [place.label, place.serviceName])).toEqual([["GET /state", "/api"], ["Tests", undefined]]);
        expect(deletion.cleanup.map((group) => [group.key, group.declarations.map((declaration) => declaration.name)]))
            .toEqual([["model", ["tutorModel"]], ["memory", ["sharedMemory"]], ["tools", ["sumTool"]], ["store", ["sharedStore"]]]);
    });
});

describe("deleting the parts the user picked", () => {
    it("re-locates each one after the agent is gone, since its lines may have moved", async () => {
        const agentModel = (line: number) => ({
            connections: [{ symbol: "mathTutorAgent", location: { filePath: AGENTS_BAL, ...range(line) }, scope: "GLOBAL", kind: "Agent", uuid: AGENT_UUID }],
            listeners: [],
            services: [],
        });
        const getDesignModel = jest.fn().mockResolvedValue({ designModel: agentModel(4) });
        const deleteByComponentInfo = jest.fn().mockResolvedValue({});
        const getProjectStructure = jest.fn().mockResolvedValue({
            projects: [{ projectPath: "/proj", directoryMap: { AGENT_TOOL: [{ name: "sumTool", path: AGENTS_BAL, position: { startLine: 6, startColumn: 0, endLine: 8, endColumn: 1 } }] } }],
        });
        const client = { getBIDiagramRpcClient: () => ({ getDesignModel, deleteByComponentInfo, getProjectStructure }) } as never;
        const ref = { filePath: AGENTS_BAL, startLine: 4, symbol: "mathTutorAgent" };
        const plan = { triggers: [], blockers: [], shared: [] };

        await deleteAgentWithTriggers(client, "/proj", ref, "agent", { plan, scopes: new Map(), chatServices: 0, dangling: [], cleanup: [] }, [
            { key: "tools", declarations: [{ name: "sumTool", filePath: AGENTS_BAL, position: { startLine: 12, startColumn: 0, endLine: 14, endColumn: 1 } }] },
        ]);

        expect(deleteByComponentInfo.mock.calls.map((call) => [call[0].component.name, call[0].component.startLine])).toEqual([
            ["mathTutorAgent", 4],
            ["sumTool", 6],
        ]);
    });
});
