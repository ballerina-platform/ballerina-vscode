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
 * The AI Chat migration card (`MigrationContextCard`) is driven by `getActiveMigrationSessionState`
 * and must reflect the state file of the open project only. The legacy globalState key older builds
 * fell back to is seeded where it used to leak state, to pin that it is no longer consulted.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** globalState contents, read lazily by the mock factory below. */
let mockGlobalState: Record<string, unknown> = {};
/** StateMachine context reported for the open project. */
let mockStateMachineContext: Record<string, unknown> = {};

jest.mock("@wso2/ballerina-core", () => ({
    Command: { Agent: "Agent" },
    AIMachineEventType: {},
}));

// Cut the import chains that reach the agent / webview / language-server layers.
jest.mock("../features/ai/agent/AgentExecutor", () => ({ AgentExecutor: class {} }));
jest.mock("../features/ai/utils/events", () => ({}));
jest.mock("../features/ai/utils/ai-utils", () => ({}));
jest.mock("../BalExtensionContext", () => ({
    extension: {
        context: {
            globalState: {
                get: (key: string) => mockGlobalState[key],
                update: async (key: string, value: unknown) => { mockGlobalState[key] = value; },
            },
        },
    },
}));
jest.mock("../stateMachine", () => ({ StateMachine: { context: () => mockStateMachineContext } }));
jest.mock("../views/ai-panel/aiMachine", () => ({ AIStateMachine: {}, openAIPanelWithPrompt: jest.fn() }));
jest.mock("../utils", () => ({}));
jest.mock("../utils/source-utils", () => ({ setMigrationEnhancementActive: jest.fn() }));

import { Uri, workspace } from "./__mocks__/vscode";
import { extension } from "../BalExtensionContext";
import {
    checkAndRunPendingEnhancement,
    getActiveMigrationSessionState,
    writeEnhanceToml,
} from "../features/ai/migration/orchestrator";
import { LEGACY_MIGRATION_PROJECT_ROOT_KEY } from "../features/ai/migration/types";

/** Every state a migrated project can be left in: [label, aiFeatureUsed, fullyEnhanced]. */
const MIGRATION_STATES: Array<[string, boolean, boolean]> = [
    ["enhancement finished", true, true],
    ["enhancement stopped partway", true, false],
    ["enhancement never run", false, false],
];

let tmpDir: string;

function makeProject(name: string): string {
    const dir = path.join(tmpDir, name);
    fs.mkdirSync(dir);
    return dir;
}

function openProject(projectRoot: string): void {
    workspace.workspaceFolders = [{ uri: Uri.file(projectRoot) }];
    mockStateMachineContext = { projectPath: projectRoot };
}

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "migration-session-scope-"));
    mockGlobalState = {};
    mockStateMachineContext = {};
    jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe.each(MIGRATION_STATES)("an earlier migration left %s", (_label, aiFeatureUsed, fullyEnhanced) => {
    let migratedRoot: string;

    beforeEach(() => {
        migratedRoot = makeProject("migrated");
        writeEnhanceToml(migratedRoot, aiFeatureUsed, fullyEnhanced, "/source/project");
        mockGlobalState[LEGACY_MIGRATION_PROJECT_ROOT_KEY] = migratedRoot;
    });

    it("a never-migrated project reports no pending enhancement", () => {
        openProject(makeProject("plain"));

        expect(getActiveMigrationSessionState()).toEqual({
            isActive: false,
            aiFeatureUsed: false,
            fullyEnhanced: true,
        });
    });

    it("the migrated project itself reports its own state", () => {
        openProject(migratedRoot);

        expect(getActiveMigrationSessionState()).toEqual({ isActive: false, aiFeatureUsed, fullyEnhanced });
    });
});

describe.each(MIGRATION_STATES)("the state machine points at a migrated project that left %s", (_label, aiFeatureUsed, fullyEnhanced) => {
    let plainRoot: string;
    let migratedRoot: string;

    beforeEach(() => {
        plainRoot = makeProject("plain");
        // A sibling sharing the open folder's name as a prefix: it is still outside it.
        migratedRoot = makeProject("plain-migrated");
        writeEnhanceToml(migratedRoot, aiFeatureUsed, fullyEnhanced, "/source/project");
    });

    it("is ignored when that project is outside the open workspace", () => {
        workspace.workspaceFolders = [{ uri: Uri.file(plainRoot) }];
        mockStateMachineContext = { projectPath: migratedRoot, workspacePath: migratedRoot };

        expect(getActiveMigrationSessionState()).toEqual({
            isActive: false,
            aiFeatureUsed: false,
            fullyEnhanced: true,
        });
    });

    it("is used when that project is another folder of the open workspace", () => {
        workspace.workspaceFolders = [{ uri: Uri.file(plainRoot) }, { uri: Uri.file(migratedRoot) }];
        mockStateMachineContext = { projectPath: migratedRoot };

        expect(getActiveMigrationSessionState()).toEqual({ isActive: false, aiFeatureUsed, fullyEnhanced });
    });
});

describe.each(MIGRATION_STATES)("a multi-root workspace holds a migrated project that left %s", (_label, aiFeatureUsed, fullyEnhanced) => {
    let plainRoot: string;
    let migratedRoot: string;

    beforeEach(() => {
        plainRoot = makeProject("plain");
        migratedRoot = makeProject("migrated");
        writeEnhanceToml(migratedRoot, aiFeatureUsed, fullyEnhanced, "/source/project");
        workspace.workspaceFolders = [{ uri: Uri.file(plainRoot) }, { uri: Uri.file(migratedRoot) }];
    });

    it("reports its state when it is not the first folder and no project is loaded", () => {
        mockStateMachineContext = {};

        expect(getActiveMigrationSessionState()).toEqual({ isActive: false, aiFeatureUsed, fullyEnhanced });
    });

    it("reports no pending enhancement when the state machine loaded the other, never-migrated folder", () => {
        mockStateMachineContext = { projectPath: plainRoot };

        expect(getActiveMigrationSessionState()).toEqual({
            isActive: false,
            aiFeatureUsed: false,
            fullyEnhanced: true,
        });
    });

    it("reports no pending enhancement when the migrated folder comes first and the state machine loaded the other", () => {
        workspace.workspaceFolders = [{ uri: Uri.file(migratedRoot) }, { uri: Uri.file(plainRoot) }];
        mockStateMachineContext = { projectPath: plainRoot };

        expect(getActiveMigrationSessionState()).toEqual({
            isActive: false,
            aiFeatureUsed: false,
            fullyEnhanced: true,
        });
    });

    it("reports the state of the project the state machine loaded when another folder was migrated too", () => {
        writeEnhanceToml(plainRoot, !aiFeatureUsed, !fullyEnhanced, "/source/other");
        mockStateMachineContext = { projectPath: migratedRoot };

        expect(getActiveMigrationSessionState()).toEqual({ isActive: false, aiFeatureUsed, fullyEnhanced });
    });
});

describe.each(MIGRATION_STATES)("the state machine loaded a package of a migration that left %s", (_label, aiFeatureUsed, fullyEnhanced) => {
    let migratedRoot: string;
    let packageRoot: string;

    beforeEach(() => {
        // A migration writes a Ballerina workspace: the state file sits at its root, above the package.
        migratedRoot = makeProject("migrated");
        packageRoot = path.join(migratedRoot, "pkg");
        fs.mkdirSync(packageRoot);
        writeEnhanceToml(migratedRoot, aiFeatureUsed, fullyEnhanced, "/source/project");
    });

    it("reports the workspace root's state when that root is the open folder", () => {
        workspace.workspaceFolders = [{ uri: Uri.file(migratedRoot) }];
        mockStateMachineContext = { projectPath: packageRoot, workspacePath: migratedRoot };

        expect(getActiveMigrationSessionState()).toEqual({ isActive: false, aiFeatureUsed, fullyEnhanced });
    });

    it("reports the state of the open folder holding the package when no workspace path is set", () => {
        workspace.workspaceFolders = [
            { uri: Uri.file(makeProject("plain")) },
            { uri: Uri.file(migratedRoot) },
        ];
        mockStateMachineContext = { projectPath: packageRoot };

        expect(getActiveMigrationSessionState()).toEqual({ isActive: false, aiFeatureUsed, fullyEnhanced });
    });
});

describe("the legacy migration project root in globalState", () => {
    it("is cleared on activation", async () => {
        mockGlobalState[LEGACY_MIGRATION_PROJECT_ROOT_KEY] = makeProject("migrated");

        await checkAndRunPendingEnhancement();

        expect(mockGlobalState[LEGACY_MIGRATION_PROJECT_ROOT_KEY]).toBeUndefined();
    });

    it("is not written to once it is gone", async () => {
        const update = jest.spyOn(extension.context.globalState, "update");

        await checkAndRunPendingEnhancement();

        expect(update).not.toHaveBeenCalled();
    });
});
