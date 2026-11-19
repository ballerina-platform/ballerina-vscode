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
 * "Restore Checkpoint" runs on one click and the panel offers to undo it, instead of a
 * confirmation popup (wso2/product-integrator#2286). The undo only holds if what the restore
 * dropped is still there to put back, so these pin the storage half of it:
 *  - while a restore is undoable, GC keeps every blob the undo needs (the pre-restore snapshot
 *    and the dropped turns' checkpoints); once it is final, those blobs become collectable;
 *  - undoing puts the dropped turns back in order, with their checkpoint files re-persisted;
 *  - every action that builds on the restored state makes the restore final.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Uri, workspace } from "./__mocks__/vscode";

const baseDir = { current: "" };

jest.mock("@wso2/copilot-utilities/chat-persistence", () => {
    const actual = jest.requireActual("@wso2/copilot-utilities/chat-persistence");
    class TempDirPersistenceStore extends actual.CopilotPersistenceStore {
        constructor(config: Record<string, unknown> = {}) {
            super({ ...config, baseDir: baseDir.current });
        }
    }
    return { ...actual, CopilotPersistenceStore: TempDirPersistenceStore };
});
jest.mock("../features/ai/state/ApprovalManager", () => ({
    approvalManager: { cancelAllPending: jest.fn() },
}));
jest.mock("../features/ai/utils/project/temp-project", () => ({
    cleanupTempProject: jest.fn(),
    getReviewBaselinePath: (p: string) => `${p}-review-baseline`,
}));
jest.mock("../rpc-managers/visualizer/rpc-manager", () => ({
    VisualizerRpcManager: class {
        updateCurrentArtifactLocation() {}
    },
}));
jest.mock("../stateMachine", () => ({
    StateMachine: { context: () => ({}) },
    updateView: () => {},
}));
jest.mock("../rpc-managers/data-mapper/utils", () => ({
    refreshDataMapper: () => Promise.resolve(),
}));
jest.mock("../RPCLayer", () => ({
    notifyCurrentWebview: () => {},
    notifyCheckpointCaptured: () => {},
    suppressWebviewNotifications: () => () => {},
}));

import { CopilotPersistenceStore } from "@wso2/copilot-utilities/chat-persistence";
import { ChatStateStorage } from "../views/ai-panel/chatStateStorage";

const GC_NOW = { checkpointGc: { debounceMs: 0, minAgeMs: 0 } };

describe("checkpoint restore undo", () => {
    let root: string;
    let storage: ChatStateStorage;
    let thread: string;

    const at = (name: string) => path.join(root, name);
    const objectsDir = () => path.join(new CopilotPersistenceStore().getWorkspaceDir(root), "objects");
    const blobOf = (content: string) => {
        const id = crypto.createHash("sha256").update(Buffer.from(content)).digest("hex");
        return path.join(objectsDir(), id.slice(0, 2), id);
    };
    const captured = async (prompt: string) => {
        const { id } = storage.addGeneration(root, thread, prompt, {});
        await storage.waitForCheckpointCapture(id);
        return id;
    };
    const checkpointOf = (generationId: string) => storage.getGeneration(root, thread, generationId)!.checkpoint!;
    const generationIds = () => storage.getGenerations(root, thread).map(g => g.id);

    /**
     * Three turns, each changing service.bal, then a restore to the second turn's checkpoint the
     * way the RPC manager runs one: snapshot, rewrite the files, truncate the thread.
     */
    const restoredToSecondTurn = async () => {
        fs.writeFileSync(at("service.bal"), "// v1\n");
        const first = await captured("first");
        fs.writeFileSync(at("service.bal"), "// v2\n");
        const second = await captured("second");
        fs.writeFileSync(at("service.bal"), "// v3\n");
        const third = await captured("third");
        fs.writeFileSync(at("service.bal"), "// v4, after the last turn\n");

        expect(await storage.prepareRestoreUndo(root, thread)).toBe(true);
        fs.writeFileSync(at("service.bal"), "// v2\n");
        expect(storage.restoreThreadToCheckpoint(root, thread, checkpointOf(second).id)).toBe(true);
        return { first, second, third };
    };

    beforeEach(() => {
        baseDir.current = fs.mkdtempSync(path.join(os.tmpdir(), "restore-undo-store-"));
        root = fs.mkdtempSync(path.join(os.tmpdir(), "restore-undo-ws-"));
        workspace.workspaceFolders = [{ uri: Uri.file(root) }];
        workspace.findFiles = () => Promise.resolve(fs.readdirSync(root).map(name => Uri.file(at(name))));
        workspace.textDocuments = [];
        workspace.getConfiguration = () => ({
            get: (_section: string, defaultValue?: unknown) => defaultValue,
            update: () => Promise.resolve(),
            inspect: () => undefined,
        });
        storage = new ChatStateStorage(GC_NOW);
        thread = storage.createNewThread(root);
    });

    afterEach(async () => {
        // Discarding an undo schedules a sweep; let it finish before the store is removed.
        await storage.flushCheckpointGc(root);
        jest.restoreAllMocks();
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(baseDir.current, { recursive: true, force: true });
    });

    it("offers no undo until the restore has truncated the thread", async () => {
        fs.writeFileSync(at("service.bal"), "// v1\n");
        await captured("first");
        expect(await storage.prepareRestoreUndo(root, thread)).toBe(true);
        expect(storage.getRestoreUndo(root)).toBeUndefined();
    });

    it("reports the dropped turns of the active thread", async () => {
        const { second, third } = await restoredToSecondTurn();
        expect(storage.getRestoreUndo(root)?.dropped.map(g => g.id)).toEqual([second, third]);
    });

    it("keeps every blob the undo needs while the restore can still be undone", async () => {
        await restoredToSecondTurn();
        await storage.flushCheckpointGc(root);

        expect(fs.existsSync(blobOf("// v4, after the last turn\n"))).toBe(true);
        expect(fs.existsSync(blobOf("// v3\n"))).toBe(true);
        expect(fs.existsSync(blobOf("// v2\n"))).toBe(true);
    });

    it("releases those blobs once the restore is final", async () => {
        await restoredToSecondTurn();
        storage.discardRestoreUndo(root);
        await storage.flushCheckpointGc(root);

        expect(fs.existsSync(blobOf("// v4, after the last turn\n"))).toBe(false);
        expect(fs.existsSync(blobOf("// v3\n"))).toBe(false);
        expect(fs.existsSync(blobOf("// v1\n"))).toBe(true);
    });

    it("puts the dropped turns back in order, with their checkpoint files", async () => {
        const { first, second, third } = await restoredToSecondTurn();
        expect(new CopilotPersistenceStore().listCheckpoints(root, thread).sort()).toEqual([first]);

        const reinstated = await storage.reapplyRestoreUndo(root);

        expect(reinstated?.map(g => g.id)).toEqual([second, third]);
        expect(generationIds()).toEqual([first, second, third]);
        expect(new CopilotPersistenceStore().listCheckpoints(root, thread).sort()).toEqual([first, second, third].sort());
        expect(storage.getRestoreUndo(root)).toBeUndefined();
    });

    it("survives a reload of the thread from disk after an undo", async () => {
        const { first, second, third } = await restoredToSecondTurn();
        await storage.reapplyRestoreUndo(root);

        const reloaded = new ChatStateStorage(GC_NOW);
        expect(reloaded.getGenerations(root, thread).map(g => g.id)).toEqual([first, second, third]);
    });

    it.each<[string, (s: ChatStateStorage, ids: { first: string }) => unknown]>([
        ["a new prompt", s => s.addGeneration(root, thread, "next", {}, undefined, true)],
        ["a new chat", s => s.createNewThread(root)],
        ["a switch to another thread", s => {
            const other = s.createNewThread(root);
            s.switchToThread(root, thread);
            s.switchToThread(root, other);
        }],
        ["deleting the thread", s => s.deleteThread(root, thread)],
        ["removing a kept turn", (s, { first }) => s.removeGeneration(root, thread, first)],
        ["clearing the workspace", s => s.clearWorkspace(root)],
    ])("makes the restore final on %s", async (_name, act) => {
        const ids = await restoredToSecondTurn();
        await act(storage, ids);
        expect(storage.getRestoreUndo(root)).toBeUndefined();
        expect(await storage.reapplyRestoreUndo(root)).toBeUndefined();
    });

    it("keeps the undo when the thread is re-selected", async () => {
        await restoredToSecondTurn();
        storage.switchToThread(root, thread);
        expect(storage.getRestoreUndo(root)).toBeDefined();
    });

    it("does not offer another thread's undo", async () => {
        await restoredToSecondTurn();
        const other = storage.createNewThread(root);
        storage.switchToThread(root, other);
        storage.switchToThread(root, thread);
        expect(storage.getRestoreUndo(root)).toBeUndefined();
    });
});
