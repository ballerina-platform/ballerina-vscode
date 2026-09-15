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
 * The migration package loop makes two promises that look the same from the outside but must
 * not be: a package whose stage failed is reported and the loop moves on ("Continuing to next
 * package"), while the user pressing stop ends the run then and there.
 *
 * Both are decided by an `AbortController`, and `AgentExecutor` aborts whatever controller it is
 * handed when a stage fails — so as long as the loop hands it the shared user controller, a
 * failure is indistinguishable from an abort and silently swallows every remaining package. The
 * invariant these tests pin, over both entry points (migration panel and wizard): only the user
 * stops the loop.
 *
 * The fake `AgentExecutor` below deliberately reproduces that abort-on-failure contract; without
 * it these tests would pass against the bug.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ── Test-controlled state, read lazily by the mock factories below ───────────
type StageOutcome = "ok" | "fail" | "user-abort";

/** Absolute path of the temp project root for the current test. */
let mockProjectRoot = "";
/** `[workspace]` packages reported for the project root. */
let mockWorkspacePackages: string[] = [];
/** Every `executionContext.projectPath` an `AgentExecutor` was constructed with, in order. */
let mockAgentCalls: string[] = [];
/** Events the orchestrator emitted to the UI. */
let mockEvents: Array<Record<string, unknown>> = [];
/** Decides what the fake agent does for a given stage invocation. */
let mockStagePlan: (packagePath: string, callIndex: number) => StageOutcome = () => "ok";

jest.mock("@wso2/ballerina-core", () => ({
    Command: { Agent: "Agent" },
    AIMachineEventType: {},
}));

jest.mock("../features/ai/agent/AgentExecutor", () => ({
    AgentExecutor: class {
        constructor(private readonly config: any) {}
        async run() {
            const packagePath = this.config.executionContext.projectPath;
            const outcome = mockStagePlan(packagePath, mockAgentCalls.length);
            mockAgentCalls.push(packagePath);

            if (outcome === "fail") {
                // Mirrors AgentExecutor.execute(): a non-abort failure aborts the controller it
                // was given (to cancel in-flight tool calls) and reports the error in `result`.
                this.config.abortController.abort();
                return { tempProjectPath: "", modifiedFiles: [], error: new Error(`stage failed in ${packagePath}`) };
            }
            if (outcome === "user-abort") {
                // Mirrors AgentExecutor.execute(): an abort is re-thrown, not returned.
                const err = new Error("The operation was aborted");
                err.name = "AbortError";
                throw err;
            }
            return { tempProjectPath: "", modifiedFiles: [] };
        }
    },
}));

jest.mock("../features/ai/utils/events", () => {
    const collect = () => (event: Record<string, unknown>) => { mockEvents.push(event); };
    return {
        createMigrationEventHandler: collect,
        createAIPanelMigrationEventHandler: collect,
        createVisualizerMigrationEventHandler: collect,
    };
});

jest.mock("../features/ai/utils/ai-utils", () => ({
    sendVisualizerMigrationNotification: jest.fn(),
    sendAIPanelNotification: jest.fn(),
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

// Cut the import chains that reach the webview / language-server layers.
jest.mock("../BalExtensionContext", () => ({
    extension: { context: { globalState: { get: () => mockProjectRoot, update: jest.fn() } } },
}));
jest.mock("../stateMachine", () => ({ StateMachine: { context: () => ({}) } }));
jest.mock("../views/ai-panel/aiMachine", () => ({
    AIStateMachine: {
        state: () => "Authenticated",
        context: () => ({}),
        sendEvent: jest.fn(),
        service: () => ({ subscribe: () => ({ unsubscribe() {} }) }),
    },
    openAIPanelWithPrompt: jest.fn(),
}));
jest.mock("../utils", () => ({
    getWorkspaceTomlValues: async () => ({ workspace: { packages: mockWorkspacePackages } }),
}));
jest.mock("../utils/source-utils", () => ({ setMigrationEnhancementActive: jest.fn() }));

import {
    abortMigrationAgent,
    readEnhanceToml,
    runMigrationAgent,
    runWizardMigrationEnhancement,
    setWizardProjectRoot,
    writeEnhanceToml,
} from "../features/ai/migration/orchestrator";

const PACKAGES = ["pkgA", "pkgB", "pkgC"];

/** Package paths the agent actually ran stages for, de-duplicated, workspace validation dropped. */
function packagesRun(): string[] {
    const seen: string[] = [];
    for (const call of mockAgentCalls) {
        if (call !== mockProjectRoot && !seen.includes(call)) {
            seen.push(call);
        }
    }
    return seen.map(p => path.relative(mockProjectRoot, p));
}

/** All `content_block` text emitted during the run, concatenated. */
function emittedText(): string {
    return mockEvents
        .filter(e => e.type === "content_block" && typeof e.content === "string")
        .map(e => e.content as string)
        .join("");
}

beforeEach(() => {
    mockProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "migration-loop-"));
    mockWorkspacePackages = [...PACKAGES];
    mockAgentCalls = [];
    mockEvents = [];
    mockStagePlan = () => "ok";

    for (const pkg of PACKAGES) {
        fs.mkdirSync(path.join(mockProjectRoot, pkg), { recursive: true });
        fs.writeFileSync(path.join(mockProjectRoot, pkg, "Ballerina.toml"), `[package]\nname = "${pkg}"\n`);
    }
    writeEnhanceToml(mockProjectRoot, true, false, undefined, undefined, undefined, undefined, true);
});

afterEach(() => {
    fs.rmSync(mockProjectRoot, { recursive: true, force: true });
});

describe.each([
    { flow: "migration panel", run: () => runMigrationAgent() },
    { flow: "wizard", run: () => { setWizardProjectRoot(mockProjectRoot); return runWizardMigrationEnhancement(); } },
])("$flow package loop", ({ run }) => {
    it("reports a failed package and keeps going through the rest of the workspace", async () => {
        // First stage of the first package fails; every later stage succeeds.
        mockStagePlan = (_pkg, callIndex) => (callIndex === 0 ? "fail" : "ok");

        await run();

        expect(packagesRun()).toEqual(PACKAGES);
        expect(emittedText()).toContain("Package `pkgA` failed");
        expect(emittedText()).toContain("**2** of **3** packages enhanced successfully.");
        expect(readEnhanceToml(mockProjectRoot)?.fullyEnhanced).toBe(true);
    });

    it("stops at the package the user aborted on and leaves the run incomplete", async () => {
        mockStagePlan = (_pkg, callIndex) => {
            if (callIndex !== 0) { return "ok"; }
            abortMigrationAgent(); // user presses stop mid-stage
            return "user-abort";
        };

        await run();

        expect(packagesRun()).toEqual(["pkgA"]);
        expect(emittedText()).not.toContain("Enhancement Report");
        expect(readEnhanceToml(mockProjectRoot)?.fullyEnhanced).toBe(false);
    });

    it("runs workspace validation only after every package has had its turn", async () => {
        mockStagePlan = (_pkg, callIndex) => (callIndex === 0 ? "fail" : "ok");

        await run();

        const validationAt = mockAgentCalls.indexOf(mockProjectRoot);
        expect(validationAt).toBeGreaterThan(-1);
        expect(mockAgentCalls.slice(validationAt)).not.toContain(path.join(mockProjectRoot, "pkgC"));
    });
});
