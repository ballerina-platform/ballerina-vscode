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

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const mockAuth = {
    getAuthCredentials: jest.fn(),
    getRefreshedAccessToken: jest.fn(),
    getAccessToken: jest.fn(),
};
jest.mock("../utils/ai/auth", () => ({
    getAuthCredentials: () => mockAuth.getAuthCredentials(),
    getRefreshedAccessToken: () => mockAuth.getRefreshedAccessToken(),
    getAccessToken: () => mockAuth.getAccessToken(),
    isNotLoggedInError: () => false,
    isPlatformExtensionAvailable: () => false,
}));
jest.mock("@wso2/ballerina-core", () => ({
    LoginMethod: { BI_INTEL: "biIntel", ANTHROPIC_KEY: "anthropic_key" },
    GET_DEFAULT_MODEL_PROVIDER: "getDefaultModelProvider",
    GET_DEFAULT_EMBEDDING_PROVIDER: "getDefaultEmbeddingProvider",
}));
jest.mock("@wso2/ballerina-core/lib/state-machine-types", () => ({ AIMachineEventType: { LOGOUT: "LOGOUT" } }));
jest.mock("../stateMachine", () => ({ StateMachine: {} }));
jest.mock("../views/ai-panel/aiMachine", () => ({ AIStateMachine: { service: () => ({ send: jest.fn() }) } }));
jest.mock("../features/config-generator/configGenerator", () => ({}));
jest.mock("../features/ai/activator", () => ({ langClient: {} }));
jest.mock("../rpc-managers/ai-panel/utils", () => ({ addToIntegration: jest.fn() }));
jest.mock("../rpc-managers/diagram-validity", () => ({ recordAiTouchedFile: jest.fn() }));
jest.mock("../features/ai/utils/project/ls-schema-notifications", () => ({ seedNewPackageBaseline: jest.fn() }));
jest.mock("../BalExtensionContext", () => ({ extension: { ballerinaExtInstance: { getBallerinaCmd: () => "bal" } } }));
jest.mock("../features/project/cmds/cmd-runner", () => ({ BALLERINA_COMMANDS: { TEST: "test" } }));
jest.mock("../utils", () => ({
    getWorkspaceTomlValues: async (dir: string) =>
        require("@iarna/toml").parse(require("fs").readFileSync(require("path").join(dir, "Ballerina.toml"), "utf-8")),
}));
const mockSpawn = jest.fn((_cmd: string, _args: string[], _cwd: string, _logs: string[]) => {
    const handlers: Record<string, (code: number) => void> = {};
    setTimeout(() => handlers.close?.(0), 0);
    return { process: { on: (event: string, handler: (code: number) => void) => { handlers[event] = handler; } } };
});
jest.mock("../features/ai/agent/tools/running-service-manager", () => ({
    spawnProcess: (...args: [string, string[], string, string[]]) => mockSpawn(...args),
    killProcessGroup: jest.fn(),
}));

import { refreshDefaultProviderToken } from "../features/ai/utils";
import { createEditExecute } from "../features/ai/agent/tools/text-editor";
import { createTestRunnerTool } from "../features/ai/agent/tools/test-runner";
import { DEFAULT_PROVIDER_UNAVAILABLE_FOR_AGENT } from "../features/ai/constants";

const AGENT = "import ballerina/ai;\n\nfinal ai:Wso2ModelProvider model = check ai:getDefaultModelProvider();\n";
const TOKEN = "wso2-session-token";

let root: string;
const configToml = () => path.join(root, "Config.toml");

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "copilot-default-provider-"));
    fs.writeFileSync(path.join(root, "Ballerina.toml"), '[package]\norg = "myorg"\nname = "agent"\nversion = "0.1.0"\n');
    fs.writeFileSync(path.join(root, "main.bal"), AGENT);
    mockAuth.getAuthCredentials.mockReset().mockResolvedValue({ loginMethod: "biIntel" });
    mockAuth.getRefreshedAccessToken.mockReset().mockResolvedValue(TOKEN);
    mockAuth.getAccessToken.mockReset();
    mockSpawn.mockClear();
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

describe("refreshDefaultProviderToken without the prompt (Copilot run and test tools)", () => {
    it("writes the WSO2 provider config for a WSO2 sign-in on a project that never had it", async () => {
        expect(await refreshDefaultProviderToken(root, false)).toBe(true);
        expect(fs.readFileSync(configToml(), "utf-8")).toContain(`accessToken = "${TOKEN}"`);
    });

    it("does not run for a sign-in with the user's own key", async () => {
        mockAuth.getAuthCredentials.mockResolvedValue({ loginMethod: "anthropic_key" });

        expect(await refreshDefaultProviderToken(root, false)).toBe(false);
        expect(fs.existsSync(configToml())).toBe(false);
        expect(mockAuth.getRefreshedAccessToken).not.toHaveBeenCalled();
    });

    it("does not run when the WSO2 token can't be fetched", async () => {
        mockAuth.getRefreshedAccessToken.mockRejectedValue(new Error("TOKEN_EXPIRED"));

        expect(await refreshDefaultProviderToken(root, false)).toBe(false);
    });

    it("does not run when refreshing an existing token fails", async () => {
        fs.writeFileSync(configToml(), '[ballerina.ai.wso2ProviderConfig]\nserviceUrl = "x"\naccessToken = "old"\n');
        mockAuth.getAccessToken.mockRejectedValue(new Error("TOKEN_EXPIRED"));

        expect(await refreshDefaultProviderToken(root, false)).toBe(false);
    });

    it("runs a project that doesn't use the default provider without touching Config.toml", async () => {
        fs.writeFileSync(path.join(root, "main.bal"), "public function main() {}\n");

        expect(await refreshDefaultProviderToken(root, false)).toBe(true);
        expect(fs.existsSync(configToml())).toBe(false);
        expect(mockAuth.getAuthCredentials).not.toHaveBeenCalled();
    });
});

describe("refreshDefaultProviderToken with the prompt (Run button, Testing view)", () => {
    it("still asks first, and writes nothing when the user declines", async () => {
        expect(await refreshDefaultProviderToken(root)).toBe(false);
        expect(fs.existsSync(configToml())).toBe(false);
        expect(mockAuth.getRefreshedAccessToken).not.toHaveBeenCalled();
    });
});

describe("Copilot test tool", () => {
    const events = jest.fn();
    const runTests = () => (createTestRunnerTool(root, events) as unknown as {
        execute: (input: object, context: object) => Promise<{ output: string; exitCode: number }>;
    }).execute({}, { toolCallId: "t1" });

    beforeEach(() => {
        fs.writeFileSync(path.join(root, "Ballerina.toml"), '[workspace]\npackages = ["agent"]\n');
        fs.rmSync(path.join(root, "main.bal"));
        fs.mkdirSync(path.join(root, "agent"));
        fs.writeFileSync(path.join(root, "agent", "Ballerina.toml"), '[package]\norg = "myorg"\nname = "agent"\nversion = "0.1.0"\n');
        fs.writeFileSync(path.join(root, "agent", "main.bal"), AGENT);
    });

    it("sets up each workspace package that uses the default provider before running", async () => {
        expect((await runTests()).exitCode).toBe(0);
        expect(fs.readFileSync(path.join(root, "agent", "Config.toml"), "utf-8")).toContain(`accessToken = "${TOKEN}"`);
        expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it("returns the sign-in message without running when the provider can't be set up", async () => {
        mockAuth.getAuthCredentials.mockResolvedValue({ loginMethod: "anthropic_key" });

        expect(await runTests()).toEqual({ output: DEFAULT_PROVIDER_UNAVAILABLE_FOR_AGENT, exitCode: -1 });
        expect(mockSpawn).not.toHaveBeenCalled();
        expect(events).toHaveBeenLastCalledWith(expect.objectContaining({
            type: "tool_result",
            toolOutput: expect.objectContaining({ status: "error", summary: "Tests did not complete" }),
        }));
    });
});

describe("file edit tool on Config.toml", () => {
    it("does not show the file content when the text to replace isn't found", async () => {
        fs.writeFileSync(configToml(), `[ballerina.ai.wso2ProviderConfig]\naccessToken = "${TOKEN}"\n`);
        const edit = createEditExecute(jest.fn(), root, [], new Set(), { workspacePath: root, projectPath: root } as never);

        const result = await edit({ file_path: "Config.toml", old_string: "missing", new_string: "other" });

        expect(result.success).toBe(false);
        expect(result.message).not.toContain(TOKEN);
    });
});
