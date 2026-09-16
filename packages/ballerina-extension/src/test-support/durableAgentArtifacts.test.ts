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

// The WSO2 Integrator shell lists an explorer entry under Agents only when the entry's type is
// AGENT, so a `workflow:DurableAgent` must publish as AGENT and carry its durability on moduleName.

import type {
    ARTIFACT_TYPE as ArtifactType,
    Artifacts,
    BaseArtifact,
    DIRECTORY_MAP as DirectoryMap,
    ProjectStructure,
    ProjectStructureResponse,
} from "@wso2/ballerina-core";

// The real barrel pulls in a WebSocket LS client that jest cannot load, so stub it. The enum
// values must match the real ones — the assertions below compare against them.
const DIRECTORY_MAP = Object.fromEntries([
    "AUTOMATION", "SERVICE", "LISTENER", "FUNCTION", "CONNECTION", "TYPE", "CONFIGURABLE", "DATA_MAPPER",
    "NP_FUNCTION", "AGENT", "AGENT_DEFINITION", "LOCAL_CONNECTORS", "WORKFLOW", "DURABLE_AGENT", "ACTIVITY",
    "RESOURCE", "REMOTE", "VARIABLE",
].map((key) => [key, key])) as unknown as typeof DirectoryMap;
const ARTIFACT_TYPE = {
    Functions: "Functions", Workflows: "Workflows", Connections: "Connections", Agents: "Agents",
    AgentDefinitions: "Agent Definitions", Listeners: "Listeners", EntryPoints: "Entry Points", Types: "Types",
    NaturalFunctions: "Natural Functions", DataMappers: "Data Mappers", Configurations: "Configurations",
    Variables: "Variables",
} as unknown as typeof ArtifactType;
jest.mock("@wso2/ballerina-core", () => ({
    ARTIFACT_TYPE,
    DIRECTORY_MAP,
    EVENT_TYPE: {},
    MACHINE_VIEW: {},
    PROJECT_KIND: {},
    SHARED_COMMANDS: {},
    isSamePath: (a: string, b: string) => a === b,
    isPathInside: () => false,
    toIconDescriptor: () => undefined,
    resolveBrandIcon: () => undefined,
    resolveKindDefaultIcon: () => undefined,
}));
jest.mock("../stateMachine", () => ({
    StateMachine: { context: jest.fn(), langClient: jest.fn(), updateProjectStructure: jest.fn() },
    openView: jest.fn(),
}));
jest.mock("../utils/config", () => ({ isLibraryProject: jest.fn().mockResolvedValue(false) }));

import { traverseComponents, traverseUpdatedComponents } from "../utils/project-artifacts";

const PROJECT_PATH = "/workspace/durable_claims";

function artifact(name: string, type: DIRECTORY_MAP, module?: string): BaseArtifact {
    return {
        id: name,
        name,
        type,
        module,
        scope: "Global",
        location: { fileName: "agents.bal", startLine: { line: 5, offset: 0 }, endLine: { line: 20, offset: 3 } },
    };
}

function emptyStructure(): ProjectStructure {
    const directoryMap = Object.fromEntries(Object.values(DIRECTORY_MAP).map((key) => [key, []]));
    return { projectName: "durable_claims", projectPath: PROJECT_PATH, directoryMap } as unknown as ProjectStructure;
}

describe("durable agents in the project structure", () => {
    it("publishes a DURABLE_AGENT artifact as an AGENT entry with moduleName workflow", async () => {
        const structure = emptyStructure();
        const artifacts = {
            [ARTIFACT_TYPE.Agents]: {
                claimAgent: artifact("claimAgent", DIRECTORY_MAP.DURABLE_AGENT),
                faqAgent: artifact("faqAgent", DIRECTORY_MAP.AGENT, "ai"),
            },
        } as unknown as Artifacts;

        await traverseComponents(artifacts, PROJECT_PATH, structure);

        const agents = structure.directoryMap[DIRECTORY_MAP.AGENT];
        expect(agents.map((entry) => entry.name).sort()).toEqual(["claimAgent", "faqAgent"]);
        expect(agents.find((entry) => entry.name === "claimAgent"))
            .toMatchObject({ type: DIRECTORY_MAP.AGENT, moduleName: "workflow", icon: "bi-ai-agent" });
        expect(agents.find((entry) => entry.name === "faqAgent"))
            .toMatchObject({ type: DIRECTORY_MAP.AGENT, moduleName: "ai" });
        expect(structure.directoryMap[DIRECTORY_MAP.WORKFLOW]).toEqual([]);
    });

    it("adds and removes a durable agent through the incremental Agents category", async () => {
        const structure = emptyStructure();
        const workspace: ProjectStructureResponse = { workspaceName: "w", workspacePath: "/workspace", projects: [structure] };
        const claimAgent = artifact("claimAgent", DIRECTORY_MAP.DURABLE_AGENT);

        await traverseUpdatedComponents(
            { [ARTIFACT_TYPE.Agents]: { additions: { claimAgent } } } as unknown as Artifacts,
            workspace,
            PROJECT_PATH
        );
        expect(structure.directoryMap[DIRECTORY_MAP.AGENT]).toMatchObject([
            { name: "claimAgent", type: DIRECTORY_MAP.AGENT, moduleName: "workflow", icon: "bi-ai-agent" },
        ]);

        await traverseUpdatedComponents(
            { [ARTIFACT_TYPE.Agents]: { deletions: { claimAgent } } } as unknown as Artifacts,
            workspace,
            PROJECT_PATH
        );
        expect(structure.directoryMap[DIRECTORY_MAP.AGENT]).toEqual([]);
    });
});
