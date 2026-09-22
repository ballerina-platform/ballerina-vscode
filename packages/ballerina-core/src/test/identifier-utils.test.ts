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

import { DevantScopes } from "@wso2/wso2-platform-core";
import { DIRECTORY_MAP, ProjectStructure } from "../interfaces/bi";
import { SCOPE } from "../interfaces/shared-types";
import { findDevantScope } from "../rpc-types/platform-ext/utils";
import { findScope, hasWorkflowArtifacts } from "../utils/identifier-utils";

describe("metadata-driven integration scope", () => {
    it.each([
        ["event", SCOPE.EVENT_INTEGRATION],
        ["file", SCOPE.FILE_INTEGRATION],
        ["http", SCOPE.INTEGRATION_AS_API],
        ["graphql", SCOPE.INTEGRATION_AS_API],
        ["ai", SCOPE.AI_AGENT],
        ["mcp", SCOPE.MCP],
    ])("maps a new %s connector without a module allowlist", (triggerKind, expected) => {
        expect(findScope(triggerKind, "new.connector.not.in.any.allowlist")).toBe(expected);
    });

    it("keeps module fallback behavior for legacy responses", () => {
        expect(findScope(undefined, "kafka")).toBe(SCOPE.EVENT_INTEGRATION);
        expect(findScope(undefined, "ftp")).toBe(SCOPE.FILE_INTEGRATION);
        expect(findScope(undefined, "tcp")).toBe(SCOPE.INTEGRATION_AS_API);
    });

    it.each([
        ["event", DevantScopes.EVENT_INTEGRATION],
        ["file", DevantScopes.FILE_INTEGRATION],
        ["http", DevantScopes.INTEGRATION_AS_API],
    ])("routes a new %s connector for deployment using only triggerKind", (triggerKind, expected) => {
        expect(findDevantScope(triggerKind, "new.connector.not.in.any.allowlist")).toBe(expected);
    });
});

describe("hasWorkflowArtifacts", () => {
    const project = (directoryMap: Record<string, unknown[]>): ProjectStructure =>
        ({ projectName: "approvalagent", directoryMap } as ProjectStructure);
    const workflow = { id: "w1", name: "expenseApproval", path: "", type: DIRECTORY_MAP.WORKFLOW };
    const aiAgent = { id: "a1", name: "chatAgent", path: "", type: DIRECTORY_MAP.AGENT };
    // Listed under AGENT so the explorer shows it in the Agents section; `kind` keeps what it is.
    const durableAgent = {
        id: "a2", name: "expenseApproval", path: "", type: DIRECTORY_MAP.AGENT, kind: DIRECTORY_MAP.DURABLE_AGENT,
    };

    it.each<[string, boolean, ProjectStructure | undefined]>([
        ["a plain workflow", true, project({ [DIRECTORY_MAP.WORKFLOW]: [workflow] })],
        ["a durable agent alone", true, project({ [DIRECTORY_MAP.AGENT]: [durableAgent] })],
        ["a durable agent beside an AI agent", true, project({ [DIRECTORY_MAP.AGENT]: [aiAgent, durableAgent] })],
        ["a plain AI agent", false, project({ [DIRECTORY_MAP.AGENT]: [aiAgent] })],
        ["a service only", false, project({ [DIRECTORY_MAP.SERVICE]: [{ id: "s1" }] })],
        ["no artifacts", false, project({})],
        ["no project", false, undefined],
    ])("%s counts as a workflow: %s", (_label, expected, structure) => {
        expect(hasWorkflowArtifacts(structure)).toBe(expected);
    });
});
