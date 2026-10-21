/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

jest.mock("@wso2/ballerina-core", () => {
    const SCOPE = {
        EVENT_INTEGRATION: "EVENT_INTEGRATION",
        FILE_INTEGRATION: "FILE_INTEGRATION",
        INTEGRATION_AS_API: "INTEGRATION_AS_API",
        WORKFLOW: "WORKFLOW",
        AUTOMATION: "AUTOMATION",
        LIBRARY: "LIBRARY",
    };
    const byKind: Record<string, string> = {
        event: SCOPE.EVENT_INTEGRATION,
        file: SCOPE.FILE_INTEGRATION,
        http: SCOPE.INTEGRATION_AS_API,
        graphql: SCOPE.INTEGRATION_AS_API,
    };
    const byModule: Record<string, string> = {
        kafka: SCOPE.EVENT_INTEGRATION,
        ftp: SCOPE.FILE_INTEGRATION,
        tcp: SCOPE.INTEGRATION_AS_API,
    };
    return {
        SCOPE,
        // Real enum and real helper: what counts as a workflow artifact is behaviour under test here.
        DIRECTORY_MAP: jest.requireActual("../../../../../ballerina-core/src/interfaces/bi").DIRECTORY_MAP,
        hasWorkflowArtifacts: jest.requireActual(
            "../../../../../ballerina-core/src/utils/identifier-utils").hasWorkflowArtifacts,
        findScope: (triggerKind?: string, moduleName?: string) =>
            (triggerKind && byKind[triggerKind]) ?? (moduleName && byModule[moduleName]),
        findScopeByModule: (moduleName: string) => byModule[moduleName],
    };
});

import { DIRECTORY_MAP, SCOPE } from "@wso2/ballerina-core";
import type { ProjectStructure } from "@wso2/ballerina-core";
import { getIntegrationTypes, hasAgentArtifacts, validateWorkspaceTitle } from "./utils";

function projectWithServices(
    services: Array<{ moduleName: string; triggerKind?: string; kind?: string }>
): ProjectStructure {
    return {
        projectName: "sample",
        directoryMap: {
            [DIRECTORY_MAP.SERVICE]: services.map((service, index) => ({
                id: String(index),
                name: service.moduleName,
                path: "/sample/main.bal",
                type: DIRECTORY_MAP.SERVICE,
                ...service,
            })),
        } as ProjectStructure["directoryMap"],
    };
}

describe("deployment scope extraction", () => {
    it("uses triggerKind for connectors absent from legacy module lists", () => {
        expect(getIntegrationTypes(projectWithServices([
            { moduleName: "new.events", triggerKind: "event" },
            { moduleName: "new.files", triggerKind: "file" },
            { moduleName: "new.api", triggerKind: "http" },
        ]))).toEqual([
            SCOPE.EVENT_INTEGRATION,
            SCOPE.FILE_INTEGRATION,
            SCOPE.INTEGRATION_AS_API,
        ]);
    });

    it("accepts legacy kind and module-only responses", () => {
        expect(getIntegrationTypes(projectWithServices([
            { moduleName: "unknown", kind: "event" },
            { moduleName: "ftp" },
        ]))).toEqual([SCOPE.EVENT_INTEGRATION, SCOPE.FILE_INTEGRATION]);
    });

    it("keeps the workflow scope for a package whose only workflow is a durable agent", () => {
        const project = projectWithServices([]);
        project.directoryMap[DIRECTORY_MAP.AGENT] = [
            { id: "claimAgent", name: "claimAgent", path: "/sample/agents.bal", type: DIRECTORY_MAP.AGENT, moduleName: "workflow", kind: DIRECTORY_MAP.DURABLE_AGENT },
        ];
        expect(getIntegrationTypes(project)).toEqual([SCOPE.WORKFLOW]);
    });
});

// L2 / C02: what the overview shows depends on whether the project has agents yet — the empty
// state and the populated topology are two branches on this one predicate — and on the name
// the user may give a new project from there.

describe("hasAgentArtifacts", () => {
    const withDirectoryMap = (directoryMap: Record<string, unknown[]>) =>
        ({ projectName: "orders", projectPath: "/w/orders", isLibrary: false, directoryMap }) as never;

    it("reports none for a project that has never had an agent", () => {
        expect(hasAgentArtifacts(withDirectoryMap({ [DIRECTORY_MAP.SERVICE]: [{}] }))).toBe(false);
    });

    // A project whose only agent was deleted leaves the key behind as an empty list, and that
    // has to read the same as never having had one or the overview shows a topology with
    // nothing in it instead of the empty state.
    it("reports none when the agent list is present but empty", () => {
        expect(hasAgentArtifacts(withDirectoryMap({ [DIRECTORY_MAP.AGENT]: [] }))).toBe(false);
    });

    it("reports agents once the project has one", () => {
        expect(hasAgentArtifacts(withDirectoryMap({ [DIRECTORY_MAP.AGENT]: [{ name: "greeter" }] }))).toBe(true);
    });

    // The overview asks before its project structure has loaded, so this is the normal first
    // call rather than an error case.
    it.each([
        ["nothing loaded yet", undefined],
        ["a project with no directory map", { projectName: "orders" }],
    ])("reports none for %s", (_label, projectStructure) => {
        expect(hasAgentArtifacts(projectStructure as never)).toBe(false);
    });
});

describe("validateWorkspaceTitle", () => {
    /** Returns "" when the name is acceptable and a message otherwise. */
    const accepted = (value: string) => validateWorkspaceTitle(value) === "";

    it.each([
        ["a plain name", "orders"],
        ["spaces between words", "order processing"],
        ["hyphens and underscores", "order-processing_v2"],
        ["surrounding whitespace, which is trimmed first", "  orders  "],
    ])("accepts %s", (_label, value) => {
        expect(accepted(value)).toBe(true);
    });

    it.each([
        ["empty", ""],
        ["only whitespace", "   "],
        ["a leading digit", "2orders"],
        ["fewer than three characters", "ab"],
        ["special characters", "orders!"],
    ])("rejects %s", (_label, value) => {
        expect(accepted(value)).toBe(false);
    });
});
