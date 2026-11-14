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

import { runAction } from "../features/agent-manager/flows";

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
    it("refuses while Config.toml is not git-ignored, and pushes nothing", async () => {
        fs.writeFileSync(path.join(project, "Config.toml"), "apiKey = \"local\"\n");
        const result = await runAction(project, "commitAndPush", undefined, "Update agent");
        expect(result.success).toBe(false);
        expect(result.message).toContain("Config.toml");
        expect(pushedFiles()).toEqual(["main.bal"]);
    });

    it("commits and pushes once Config.toml is git-ignored", async () => {
        fs.writeFileSync(path.join(project, "Config.toml"), "apiKey = \"local\"\n");
        fs.writeFileSync(path.join(project, ".gitignore"), "Config.toml\n");
        const result = await runAction(project, "commitAndPush", undefined, "Update agent");
        expect(result.success).toBe(true);
        expect(pushedFiles().sort()).toEqual([".gitignore", "main.bal"]);
    });
});
