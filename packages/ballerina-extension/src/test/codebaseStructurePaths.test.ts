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

/**
 * Every path the agent edits or writes comes from the codebase structure it is handed, so a file
 * listed at the wrong path is a file the agent cannot reach. getProjectSource stores module files
 * under their bare name, and the listing has to put the `modules/` prefix back.
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

import { formatCodebaseStructure } from "../features/ai/agent/utils";

const project = (isGenerated: boolean) => ({
    projectName: "my_pkg",
    sourceFiles: [{ filePath: "main.bal", content: "public function main() {}" }],
    projectModules: [{
        moduleName: "helpers",
        isGenerated,
        sourceFiles: [{ filePath: "types.bal", content: "public type Foo record {};" }],
    }],
}) as any;

beforeEach(() => {
    mockProjectKind = "BUILD_PROJECT";
});

describe("formatCodebaseStructure module paths", () => {
    it("addresses a modules/ file by the path it actually has on disk", () => {
        const text = formatCodebaseStructure([project(false)]);

        expect(text).toContain('<file path="modules/helpers/types.bal">');
        expect(text).not.toContain('<file path="types.bal">');
    });

    it("does not shadow a root file that shares a module file's name", () => {
        const withRootClash = project(false);
        withRootClash.sourceFiles.push({ filePath: "types.bal", content: "public type Root record {};" });

        const text = formatCodebaseStructure([withRootClash]);

        expect(text).toContain('<file path="types.bal">');
        expect(text).toContain('<file path="modules/helpers/types.bal">');
    });

    it("still lists generated modules as path-only entries under generated/", () => {
        const text = formatCodebaseStructure([project(true)]);

        expect(text).toContain('<file path="generated/helpers/types.bal"/>');
        expect(text).toContain("<generated_files>");
    });

    it("keeps the package prefix for workspace projects", () => {
        mockProjectKind = "WORKSPACE_PROJECT";
        const workspaceProject = { ...project(false), packagePath: "pkg1" };

        const text = formatCodebaseStructure([workspaceProject]);

        expect(text).toContain('<file path="pkg1/modules/helpers/types.bal">');
    });
});
