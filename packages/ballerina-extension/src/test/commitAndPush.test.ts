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

// A real git repository whose GitHub remote pushes to a local bare one, so nothing leaves the machine.

import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

jest.mock("@wso2/ballerina-core", () => ({ __esModule: true, isSamePath: (a: string, b: string) => a === b, DIRECTORY_MAP: {} }));
jest.mock("../features/agent-manager/auth", () => ({
    __esModule: true,
    AgentManagerApiError: class extends Error {},
    getSession: jest.fn(),
    isCloudSession: jest.fn(),
    orgDisplayName: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    signOutOfAgentManager: jest.fn(),
}));
jest.mock("../features/agent-manager/copilot", () => ({ __esModule: true, forgetCopilotMcpTokens: jest.fn() }));
jest.mock("../features/agent-manager/configurables", () => ({ __esModule: true, buildConfigFields: jest.fn(), configEnvKey: jest.fn() }));
jest.mock("../features/agent-manager/bindings", () => ({ __esModule: true, injectedEnvNames: jest.fn(), reconcileAgentConfigs: jest.fn() }));
jest.mock("../features/agent-manager/client", () => ({
    __esModule: true,
    api: {},
    MANIFEST_FILE: ".wso2/agent-manager.yaml",
    consoleUrl: jest.fn(),
    DEFAULT_ENVIRONMENT: "default",
    MAX_RESOURCE_NAME: 60,
    readLink: jest.fn(),
    readManifest: () => ({}),
    removeLink: jest.fn(),
    updateManifest: jest.fn(),
    writeLink: jest.fn(),
}));
jest.mock("../BalExtensionContext", () => ({ __esModule: true, extension: {} }));
jest.mock("../stateMachine", () => ({ __esModule: true, StateMachine: {} }));
jest.mock("../features/tracing/tracer-machine", () => ({ __esModule: true, TracerMachine: {} }));
jest.mock("../features/tracing/utils", () => ({ __esModule: true, getActiveTracingProvider: jest.fn(), updateOrAddSection: jest.fn() }));
jest.mock("../utils/config", () => ({ __esModule: true, getProjectTomlValues: jest.fn() }));

import * as vscode from "vscode";
import { runAction } from "../features/agent-manager/flows";
import { localOnlyNotes, readFacts } from "../features/agent-manager/github";
import * as github from "../features/agent-manager/github";

const GITHUB_URL = "https://github.com/acme/agent.git";
const run = (cwd: string, ...args: string[]) => cp.execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
let root: string;
let project: string;
let remote: string;

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "commit-and-push-"));
    remote = path.join(root, "remote.git");
    project = path.join(root, "agent");
    run(root, "init", "-q", "--bare", remote);
    fs.mkdirSync(project);
    run(project, "init", "-q", "-b", "main");
    run(project, "config", "user.email", "test@example.com");
    run(project, "config", "user.name", "Test");
    run(project, "config", `url.${remote}.pushInsteadOf`, GITHUB_URL);
    run(project, "remote", "add", "origin", GITHUB_URL);
    fs.writeFileSync(path.join(project, "main.bal"), "public function main() {}\n");
    run(project, "add", "-A");
    run(project, "commit", "-q", "-m", "Initial");
    run(project, "push", "-q", "-u", "origin", "main");
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const pushedFiles = () => run(remote, "ls-tree", "-r", "--name-only", "main").split("\n");

describe("Commit and Push", () => {
    it("git-ignores Config.toml and pushes the source without it", async () => {
        fs.writeFileSync(path.join(project, "Config.toml"), "apiKey = \"local\"\n");
        const result = await runAction(project, "commitAndPush", undefined, "Update agent");
        expect(result.success).toBe(true);
        expect(pushedFiles().sort()).toEqual([".gitignore", "main.bal"]);
    });

    it("untracks a committed Config.toml in the same commit", async () => {
        fs.writeFileSync(path.join(project, "Config.toml"), "apiKey = \"old\"\n");
        run(project, "add", "-A");
        run(project, "commit", "-q", "-m", "Add config");
        fs.writeFileSync(path.join(project, "Config.toml"), "apiKey = \"local\"\n");
        const result = await runAction(project, "commitAndPush", undefined, "Update agent");
        expect(result.success).toBe(true);
        expect(pushedFiles().sort()).toEqual([".gitignore", "main.bal"]);
    });

    it("refuses while changes outside the folder are staged", async () => {
        const pkg = path.join(project, "pkg");
        fs.mkdirSync(pkg);
        fs.writeFileSync(path.join(pkg, "agent.bal"), "public function run() {}\n");
        fs.writeFileSync(path.join(project, "main.bal"), "public function main() { }\n");
        run(project, "add", "main.bal");
        const result = await runAction(pkg, "commitAndPush", undefined, "Update agent");
        expect(result.success).toBe(false);
        expect(result.message).toContain("main.bal");
        expect(pushedFiles()).toEqual(["main.bal"]);
    });

    it("pushes to the branch it tracks when the names differ", async () => {
        run(project, "push", "-q", "origin", "main:release");
        run(project, "branch", "-q", "-u", "origin/release");
        fs.writeFileSync(path.join(project, "agent.bal"), "public function run() {}\n");
        const result = await runAction(project, "commitAndPush", undefined, "Update agent");
        expect(result.success).toBe(true);
        expect(run(remote, "rev-parse", "release")).toBe(run(project, "rev-parse", "HEAD"));
        expect(pushedFiles()).toEqual(["main.bal"]);
    });

    it("counts a push that lost a race as done when GitHub already has the commit", async () => {
        const realGit = github.git;
        const rejected = { status: 1, missing: false, stdout: "", stderr: "! [remote rejected] main -> main (cannot lock ref 'refs/heads/main': reference already exists)" };
        const spy = jest.spyOn(github, "git").mockImplementation((cwd, args, timeout) => {
            if (args[0] === "push") {
                return Promise.resolve(rejected);
            }
            return args[0] === "ls-remote" ? realGit(remote, ["ls-remote", remote, ...args.slice(2)]) : realGit(cwd, args, timeout);
        });
        try {
            expect(await runAction(project, "commitAndPush", undefined, "Update agent")).toEqual({ success: true });
            fs.writeFileSync(path.join(project, "agent.bal"), "public function run() {}\n");
            const result = await runAction(project, "commitAndPush", undefined, "Update agent");
            expect(result.success).toBe(false);
            expect(result.message).toContain("cannot lock ref");
        } finally {
            spy.mockRestore();
        }
    });

    it("removes a tracked Config.toml whose staged edit differs from the file on disk", async () => {
        fs.writeFileSync(path.join(project, "Config.toml"), "apiKey = \"old\"\n");
        run(project, "add", "-A");
        run(project, "commit", "-q", "-m", "Add config");
        fs.writeFileSync(path.join(project, "Config.toml"), "apiKey = \"staged\"\n");
        run(project, "add", "Config.toml");
        fs.writeFileSync(path.join(project, "Config.toml"), "apiKey = \"local\"\n");
        const result = await runAction(project, "commitAndPush", undefined, "Update agent");
        expect(result.success).toBe(true);
        expect(pushedFiles().sort()).toEqual([".gitignore", "main.bal"]);
    });

    it("leaves .gitignore and the index as they were when the commit fails", async () => {
        fs.writeFileSync(path.join(project, "Config.toml"), "apiKey = \"local\"\n");
        fs.writeFileSync(path.join(project, "agent.bal"), "public function run() {}\n");
        fs.writeFileSync(path.join(project, ".git", "hooks", "pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
        const result = await runAction(project, "commitAndPush", undefined, "Update agent", true);
        expect(result.success).toBe(false);
        expect(fs.existsSync(path.join(project, ".gitignore"))).toBe(false);
        expect(run(project, "diff", "--cached", "--name-only")).toBe("");
    });

    it("raises no notification for a quiet caller", async () => {
        const shown = jest.spyOn(vscode.window, "showErrorMessage");
        run(project, "remote", "remove", "origin");
        const result = await runAction(project, "commitAndPush", undefined, "Update agent", true);
        expect(result.success).toBe(false);
        expect(shown).not.toHaveBeenCalled();
        shown.mockRestore();
    });

    it.each([
        ["untracked, Config.toml about to be ignored", "", false, []],
        ["untracked, Config.toml already ignored by an anchored rule", "/Config.toml\n", false, ["tests/Config.toml"]],
        ["tracked, Config.toml about to be ignored", "", true, ["tests/Config.toml"]],
    ])("names a nested Config.toml the commit includes: %s", async (_case, gitignore, tracked, expected) => {
        fs.writeFileSync(path.join(project, "Config.toml"), "apiKey = \"local\"\n");
        fs.mkdirSync(path.join(project, "tests"));
        fs.writeFileSync(path.join(project, "tests", "Config.toml"), "apiKey = \"test\"\n");
        if (gitignore) {
            fs.writeFileSync(path.join(project, ".gitignore"), gitignore);
        }
        if (tracked) {
            run(project, "add", "tests/Config.toml");
            run(project, "commit", "-q", "-m", "Add test config");
            fs.writeFileSync(path.join(project, "tests", "Config.toml"), "apiKey = \"changed\"\n");
        }
        expect((await readFacts(project)).changedConfigs).toEqual(expected);
    });

    it("says which local-only files Commit and Push removes from Git and which it only ignores", async () => {
        fs.writeFileSync(path.join(project, "Config.toml"), "apiKey = \"old\"\n");
        run(project, "add", "Config.toml");
        run(project, "commit", "-q", "-m", "Add config");
        fs.writeFileSync(path.join(project, "trace_enabled.bal"), "");
        expect(await localOnlyNotes(project, ["Config.toml", "trace_enabled.bal"])).toEqual({ keptOut: ["trace_enabled.bal"], removedFromGit: ["Config.toml"] });
    });

    it("commits and pushes once Config.toml is git-ignored", async () => {
        fs.writeFileSync(path.join(project, "Config.toml"), "apiKey = \"local\"\n");
        fs.writeFileSync(path.join(project, ".gitignore"), "Config.toml\n");
        const result = await runAction(project, "commitAndPush", undefined, "Update agent");
        expect(result.success).toBe(true);
        expect(pushedFiles().sort()).toEqual([".gitignore", "main.bal"]);
    });
});
