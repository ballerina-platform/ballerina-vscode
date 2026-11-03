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

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

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
import { REQ_KEY } from "../rpc-managers/ai-panel/constants";

const project = (isGenerated: boolean) => ({
    projectName: "my_pkg",
    sourceFiles: [{ filePath: "main.bal", content: "public function main() {\n}\n" }],
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

        expect(text).toContain('<file path="modules/helpers/types.bal" lines="1"/>');
        expect(text).not.toContain('<file path="types.bal"');
    });

    it("does not shadow a root file that shares a module file's name", () => {
        const withRootClash = project(false);
        withRootClash.sourceFiles.push({ filePath: "types.bal", content: "public type Root record {};" });

        const text = formatCodebaseStructure([withRootClash]);

        expect(text).toContain('<file path="types.bal" lines="1"/>');
        expect(text).toContain('<file path="modules/helpers/types.bal" lines="1"/>');
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

        expect(text).toContain('<file path="pkg1/modules/helpers/types.bal" lines="1"/>');
    });
});

describe("formatCodebaseStructure listing", () => {
    it("lists paths with line counts and never file contents", () => {
        const text = formatCodebaseStructure([project(false)]);

        expect(text).toContain('<project name="my_pkg" active="true">');
        expect(text).toContain('<file path="main.bal" lines="2"/>');
        expect(text).not.toContain("public function main");
        expect(text).not.toContain("public type Foo");
    });

    it("leaves out the requirements entry", () => {
        const withRequirements = project(false);
        withRequirements.sourceFiles.push({ filePath: REQ_KEY, content: "The system shall…" });

        const text = formatCodebaseStructure([withRequirements]);

        expect(text).not.toContain(REQ_KEY);
        expect(text).not.toContain("The system shall");
    });

    it("uses posix paths and escapes them", () => {
        mockProjectKind = "WORKSPACE_PROJECT";
        const odd = {
            ...project(false),
            packagePath: "pkgs\\a&b",
            projectTests: [{ filePath: "unit\\x_test.bal", content: "" }],
        };

        const text = formatCodebaseStructure([odd]);

        expect(text).toContain('<file path="pkgs/a&amp;b/main.bal" lines="2"/>');
        expect(text).toContain('<file path="pkgs/a&amp;b/tests/unit/x_test.bal" lines="0"/>');
    });

    it("lists the active package in full and other packages as one line each", () => {
        mockProjectKind = "WORKSPACE_PROJECT";
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "codebase-structure-"));
        try {
            fs.mkdirSync(path.join(root, "other", "tests"), { recursive: true });
            fs.writeFileSync(path.join(root, "other", "Config.toml"), "");
            const active = { ...project(false), packagePath: "main_pkg", isActive: true };
            const other = { ...project(false), projectName: "other_pkg", packagePath: "other", isActive: false };

            const text = formatCodebaseStructure([other, active], root);

            expect(text).toContain('<file path="main_pkg/main.bal" lines="2"/>');
            expect(text).not.toContain('<file path="other/');
            expect(text).toContain('<package name="other_pkg" path="other" files="2"><config_files main="present" tests="absent"/></package>');
            expect(text).toContain('<config_files main="absent" tests="absent"/>\n</project>');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it("treats the first package as active when none is", () => {
        mockProjectKind = "WORKSPACE_PROJECT";
        const first = { ...project(false), packagePath: "a" };
        const second = { ...project(false), projectName: "b_pkg", packagePath: "b" };

        const text = formatCodebaseStructure([first, second]);

        expect(text).toContain('<file path="a/main.bal" lines="2"/>');
        expect(text).toContain('<package name="b_pkg" path="b" files="2">');
        expect(first.isActive).toBeUndefined();
    });

    it("stops at 16,000 characters and says how many files were left out", () => {
        const big = project(false);
        big.sourceFiles = Array.from({ length: 1000 }, (_, i) => ({ filePath: `file_${i}.bal`, content: "x" }));

        const text = formatCodebaseStructure([big]);

        expect(text.length).toBeLessThan(17_000);
        const listed = (text.match(/<file path="file_/g) ?? []).length;
        expect(listed).toBeGreaterThan(0);
        expect(text).toContain(`… ${1000 - listed + 1} more files not listed. Use glob to find them.`);
    });
});
