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
 * Three tooling gaps reported from connector testing: module files were addressed by their bare
 * name, there was no way to delete a file, and no way to run a throwaway snippet.
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

/** Records what the tools asked the workspace layer to do. */
let integrationCalls: Array<{ root: string; changes: Array<{ filePath: string; content: string; deleted?: boolean }> }> = [];
/** When set, addToIntegration throws instead of applying. */
let integrationFailure: Error | undefined;
/** When true, addToIntegration reports success without touching disk. */
let integrationSkipsDisk = false;

jest.mock("../rpc-managers/ai-panel/utils", () => ({
    addToIntegration: jest.fn(async (root: string, changes: any[]) => {
        integrationCalls.push({ root, changes });
        if (integrationFailure) {
            throw integrationFailure;
        }
        if (integrationSkipsDisk) {
            return;
        }
        for (const change of changes) {
            const target = path.join(root, change.filePath);
            if (change.deleted) {
                fs.rmSync(target, { force: true });
                continue;
            }
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, change.content, "utf8");
        }
    }),
}));

jest.mock("../rpc-managers/diagram-validity", () => ({ recordAiTouchedFile: jest.fn() }));
jest.mock("../features/ai/utils/project/ls-schema-notifications", () => ({ seedNewPackageBaseline: jest.fn() }));

// Only buildScratchTestSource is under test; these reach the real extension host.
jest.mock("../features/ai/agent/tools/running-service-manager", () => ({
    spawnProcess: jest.fn(),
    killProcessGroup: jest.fn(),
}));
jest.mock("../BalExtensionContext", () => ({
    extension: { ballerinaExtInstance: { getBallerinaCmd: () => "bal" } },
}));
jest.mock("../features/project/cmds/cmd-runner", () => ({ BALLERINA_COMMANDS: { TEST: "test" } }));
jest.mock("../features/ai/agent/tools/diagnostics", () => ({ DIAGNOSTICS_TOOL_NAME: "getCompilationErrors" }));

import { formatCodebaseStructure } from "../features/ai/agent/utils";
import { createDeleteExecute, FILE_DELETE_TOOL_NAME } from "../features/ai/agent/tools/text-editor";
import { buildScratchTestSource } from "../features/ai/agent/tools/ballerina-scratch-run";

const noopEvents = () => undefined;

let projectRoot = "";

beforeEach(() => {
    integrationCalls = [];
    integrationFailure = undefined;
    integrationSkipsDisk = false;
    mockProjectKind = "BUILD_PROJECT";
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-file-tooling-"));
});

afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
});

// ── 1. Codebase structure: module files keep their modules/ path ─────────────

describe("formatCodebaseStructure module paths", () => {
    const project = (isGenerated: boolean) => ({
        projectName: "my_pkg",
        sourceFiles: [{ filePath: "main.bal", content: "public function main() {}" }],
        projectModules: [{
            moduleName: "helpers",
            isGenerated,
            sourceFiles: [{ filePath: "types.bal", content: "public type Foo record {};" }],
        }],
    }) as any;

    it("addresses a modules/ file by the path it actually has on disk", () => {
        const text = formatCodebaseStructure([project(false)]);

        expect(text).toContain('<file path="modules/helpers/types.bal">');
        expect(text).not.toContain('<file path="types.bal">');
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

// ── 2. file_delete ───────────────────────────────────────────────────────────

describe("file_delete", () => {
    const ctx = () => ({ workspacePath: projectRoot }) as any;

    const write = (relative: string, content = "// content\n") => {
        const target = path.join(projectRoot, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content, "utf8");
        return target;
    };

    it("removes the file and records it as modified so review and revert see it", async () => {
        write("scratch.bal");
        const modifiedFiles: string[] = [];
        const allModifiedFiles = new Set<string>();
        const execute = createDeleteExecute(noopEvents, projectRoot, modifiedFiles, allModifiedFiles, ctx());

        const result = await execute({ file_path: "scratch.bal" });

        expect(result.success).toBe(true);
        expect(result.action).toBe("deleted");
        expect(fs.existsSync(path.join(projectRoot, "scratch.bal"))).toBe(false);
        expect(modifiedFiles).toEqual(["scratch.bal"]);
        expect(allModifiedFiles.has("scratch.bal")).toBe(true);
    });

    it("goes through the workspace layer rather than deleting behind its back", async () => {
        write("todo.bal");
        const execute = createDeleteExecute(noopEvents, projectRoot, [], new Set(), ctx());

        await execute({ file_path: "todo.bal" });

        expect(integrationCalls).toEqual([{
            root: projectRoot,
            changes: [{ filePath: "todo.bal", content: "", deleted: true }],
        }]);
    });

    it("succeeds on a path that is already gone instead of inviting a retry", async () => {
        const modifiedFiles: string[] = [];
        const execute = createDeleteExecute(noopEvents, projectRoot, modifiedFiles, new Set(), ctx());

        const result = await execute({ file_path: "never_existed.bal" });

        expect(result.success).toBe(true);
        expect(result.message).toContain("does not exist");
        expect(modifiedFiles).toEqual([]);
        expect(integrationCalls).toEqual([]);
    });

    it.each([
        ["Ballerina.toml"],
        ["Dependencies.toml"],
        ["Config.toml"],
        ["tests/Config.toml"],
        ["generated/fooApi/client.bal"],
    ])("refuses to delete %s", async (relative) => {
        write(relative);
        const execute = createDeleteExecute(noopEvents, projectRoot, [], new Set(), ctx());

        const result = await execute({ file_path: relative });

        expect(result.success).toBe(false);
        expect(fs.existsSync(path.join(projectRoot, relative))).toBe(true);
        expect(integrationCalls).toEqual([]);
    });

    it("refuses a path that escapes the project", async () => {
        const execute = createDeleteExecute(noopEvents, projectRoot, [], new Set(), ctx());

        const result = await execute({ file_path: "../outside.bal" });

        expect(result.success).toBe(false);
        expect(integrationCalls).toEqual([]);
    });

    it("refuses a directory even when its name passes the extension check", async () => {
        // The isFile guard is only reachable through a directory named like a source file.
        fs.mkdirSync(path.join(projectRoot, "legacy.bal"), { recursive: true });
        const execute = createDeleteExecute(noopEvents, projectRoot, [], new Set(), ctx());

        const result = await execute({ file_path: "legacy.bal" });

        expect(result.success).toBe(false);
        expect(result.message).toContain("directory");
        expect(fs.existsSync(path.join(projectRoot, "legacy.bal"))).toBe(true);
    });

    it("rejects a path with no source extension before it reaches the filesystem", async () => {
        fs.mkdirSync(path.join(projectRoot, "modules", "helpers"), { recursive: true });
        const execute = createDeleteExecute(noopEvents, projectRoot, [], new Set(), ctx());

        const result = await execute({ file_path: "modules/helpers" });

        expect(result.success).toBe(false);
        expect(integrationCalls).toEqual([]);
    });

    it("reports failure, and does not claim the file is gone, when the edit cannot be applied", async () => {
        write("scratch.bal");
        integrationFailure = new Error("document version changed");
        const modifiedFiles: string[] = [];
        const execute = createDeleteExecute(noopEvents, projectRoot, modifiedFiles, new Set(), ctx());

        const result = await execute({ file_path: "scratch.bal" });

        expect(result.success).toBe(false);
        expect(result.message).toContain("document version changed");
        expect(fs.existsSync(path.join(projectRoot, "scratch.bal"))).toBe(true);
        expect(modifiedFiles).toEqual([]);
    });

    it("reports failure when the file survives a delete that reported success", async () => {
        write("scratch.bal");
        integrationSkipsDisk = true;
        const execute = createDeleteExecute(noopEvents, projectRoot, [], new Set(), ctx());

        const result = await execute({ file_path: "scratch.bal" });

        expect(result.success).toBe(false);
        expect(result.message).toContain("still present on disk");
    });

    it("writes straight to disk when there is no execution context", async () => {
        write("scratch.bal");
        const execute = createDeleteExecute(noopEvents, projectRoot, [], new Set(), undefined);

        const result = await execute({ file_path: "scratch.bal" });

        expect(result.success).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, "scratch.bal"))).toBe(false);
        expect(integrationCalls).toEqual([]);
    });

    it("is named file_delete", () => {
        expect(FILE_DELETE_TOOL_NAME).toBe("file_delete");
    });
});

// ── 3. Scratch run source generation ─────────────────────────────────────────

describe("buildScratchTestSource", () => {
    it("wraps the snippet in a test, not a main, so it cannot collide with the package's own", () => {
        const source = buildScratchTestSource({ code: 'io:println("hi");', imports: ["ballerina/io"] });

        expect(source).toContain("@test:Config {}");
        expect(source).toContain("function scratchRun() returns error? {");
        expect(source).not.toContain("function main(");
    });

    it("always imports ballerina/test and never duplicates it", () => {
        const source = buildScratchTestSource({ code: "int a = 1;", imports: ["ballerina/test", "ballerina/io"] });

        expect(source.match(/import ballerina\/test;/g)).toHaveLength(1);
        expect(source).toContain("import ballerina/io;");
    });

    it("accepts imports written as full statements, which the model tends to send", () => {
        const source = buildScratchTestSource({ code: "int a = 1;", imports: ["import ballerina/io;", "  ballerina/lang.value  "] });

        expect(source).toContain("import ballerina/io;");
        expect(source).toContain("import ballerina/lang.value;");
        expect(source).not.toContain("import import");
    });

    it("indents the snippet into the function body and keeps its line structure", () => {
        const source = buildScratchTestSource({ code: "int a = 1;\nint b = 2;" });

        expect(source).toContain("    int a = 1;\n    int b = 2;");
    });

    it("emits module-level declarations outside the test function", () => {
        const source = buildScratchTestSource({
            code: "Foo f = {};",
            declarations: "type Foo record {};",
        });

        expect(source.indexOf("type Foo record {};")).toBeLessThan(source.indexOf("@test:Config {}"));
    });
});
