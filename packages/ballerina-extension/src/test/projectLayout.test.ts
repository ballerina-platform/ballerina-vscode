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

let mockProjectKind = "BUILD_PROJECT";

// The barrel pulls in an ESM-only websocket transport; only PROJECT_KIND is needed here.
jest.mock("@wso2/ballerina-core", () => ({
    PROJECT_KIND: { WORKSPACE_PROJECT: "WORKSPACE_PROJECT", BUILD_PROJECT: "BUILD_PROJECT" },
}));

jest.mock("../stateMachine", () => ({
    StateMachine: {
        context: () => ({ projectInfo: { projectKind: mockProjectKind } }),
    },
}));

jest.mock("../rpc-managers/ai-panel/utils", () => ({ addToIntegration: jest.fn() }));

import { formatProjectLayout, getProjectBlock } from "../features/ai/agent/utils";

const pkg = (projectName: string, packagePath = "", isActive = false) => ({
    projectName,
    packagePath,
    isActive,
    sourceFiles: [{ filePath: "main.bal", content: "public function main() {\n}\n" }],
}) as any;

beforeEach(() => {
    mockProjectKind = "BUILD_PROJECT";
});

describe("formatProjectLayout", () => {
    it("names a single package and how to import its modules, with no file list or contents", () => {
        const text = formatProjectLayout([pkg("my_pkg")]);

        expect(text).toBe("<project_layout>\nThis is the Ballerina package \"my_pkg\". Import one of its modules, such as a generated connector under generated/moduleName, as: import my_pkg.moduleName;\n</project_layout>");
    });

    it("lists a workspace's packages by path and marks the active one", () => {
        mockProjectKind = "WORKSPACE_PROJECT";

        const text = formatProjectLayout([pkg("orders", "orders", true), pkg("shared_lib", "libs\\shared")]);

        expect(text).toContain("- orders (package orders), active\n- libs/shared (package shared_lib)\n");
        expect(text).toContain("File paths start with the package path");
        expect(text).toContain("Prefer edits in the active package.");
        expect(text).not.toContain("orders/main.bal");
    });

    it("tells the agent to pick the package when none is active", () => {
        mockProjectKind = "WORKSPACE_PROJECT";

        const text = formatProjectLayout([pkg("a", "a"), pkg("b", "b")]);

        expect(text).not.toContain(", active");
        expect(text).toContain("No package is active: work in the package the request is about.");
    });

    it("escapes names that would break the tags", () => {
        expect(formatProjectLayout([pkg("a<b>&c")])).toContain("\"a&lt;b&gt;&amp;c\"");
    });

    it("is empty without a project", () => {
        expect(formatProjectLayout([])).toBe("");
    });
});

describe("getProjectBlock", () => {
    it("sends a migration stage's map instead of the layout note", () => {
        expect(getProjectBlock([pkg("my_pkg")], { omitCodebaseDump: true, codebaseMapText: "<codebase_map/>" })).toBe("<codebase_map/>");
        expect(getProjectBlock([pkg("my_pkg")], { omitCodebaseDump: true })).toBe("");
        expect(getProjectBlock([pkg("my_pkg")])).toContain("<project_layout>");
    });
});
