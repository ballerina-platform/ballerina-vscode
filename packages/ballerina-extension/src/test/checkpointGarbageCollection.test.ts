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

import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as zlib from "zlib";
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
import { getCheckpointService } from "../views/ai-panel/checkpoint/checkpointService";
import { FsBlobStore } from "../views/ai-panel/checkpoint/blobStore";

const GC_NOW = { checkpointGc: { debounceMs: 0, minAgeMs: 0 } };

describe("checkpoint garbage collection", () => {
    let root: string;
    let settings: Record<string, unknown>;

    const at = (name: string) => path.join(root, name);
    const objectsDir = () => path.join(new CopilotPersistenceStore().getWorkspaceDir(root), "objects");
    const blobOf = (content: string) => {
        const id = crypto.createHash("sha256").update(Buffer.from(content)).digest("hex");
        return path.join(objectsDir(), id.slice(0, 2), id);
    };
    const captured = async (storage: ChatStateStorage, threadId: string, prompt: string) => {
        const { id } = storage.addGeneration(root, threadId, prompt, {});
        await storage.waitForCheckpointCapture(id);
        return id;
    };

    beforeEach(() => {
        baseDir.current = fs.mkdtempSync(path.join(os.tmpdir(), "checkpoint-gc-store-"));
        root = fs.mkdtempSync(path.join(os.tmpdir(), "checkpoint-gc-ws-"));
        settings = {};

        workspace.workspaceFolders = [{ uri: Uri.file(root) }];
        workspace.findFiles = () => Promise.resolve(fs.readdirSync(root).map(name => Uri.file(at(name))));
        workspace.textDocuments = [];
        workspace.getConfiguration = () => ({
            get: (section: string, defaultValue?: unknown) => (section in settings ? settings[section] : defaultValue),
            update: () => Promise.resolve(),
            inspect: () => undefined,
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(baseDir.current, { recursive: true, force: true });
    });

    it("deletes a blob only a checkpoint pruned past maxCount used", async () => {
        settings.maxCount = 1;
        const storage = new ChatStateStorage(GC_NOW);
        const thread = storage.createNewThread(root);
        fs.writeFileSync(at("main.bal"), "// kept\n");
        fs.writeFileSync(at("service.bal"), "// first\n");
        await captured(storage, thread, "first");
        fs.writeFileSync(at("service.bal"), "// second\n");

        await captured(storage, thread, "second");
        await storage.flushCheckpointGc(root);

        expect(fs.existsSync(blobOf("// first\n"))).toBe(false);
        expect(fs.existsSync(blobOf("// second\n"))).toBe(true);
        expect(fs.existsSync(blobOf("// kept\n"))).toBe(true);
    });

    it("keeps a blob another thread's persisted checkpoint still uses", async () => {
        const storage = new ChatStateStorage(GC_NOW);
        const doomed = storage.createNewThread(root);
        fs.writeFileSync(at("main.bal"), "// shared\n");
        fs.writeFileSync(at("only.bal"), "// only the doomed thread\n");
        await captured(storage, doomed, "doomed");

        fs.rmSync(at("only.bal"));
        const otherWindow = new ChatStateStorage(GC_NOW);
        await captured(otherWindow, otherWindow.createNewThread(root), "survivor");

        await storage.deleteThread(root, doomed);
        await storage.flushCheckpointGc(root);

        expect(fs.existsSync(blobOf("// only the doomed thread\n"))).toBe(false);
        expect(fs.existsSync(blobOf("// shared\n"))).toBe(true);
    });

    it("keeps a blob only an in-memory checkpoint whose save failed uses", async () => {
        const storage = new ChatStateStorage(GC_NOW);
        const doomed = storage.createNewThread(root);
        fs.writeFileSync(at("only.bal"), "// only the doomed thread\n");
        await captured(storage, doomed, "doomed");

        fs.rmSync(at("only.bal"));
        fs.writeFileSync(at("unsaved.bal"), "// never saved\n");
        jest.spyOn(CopilotPersistenceStore.prototype, "saveCheckpointAsync").mockRejectedValueOnce(new Error("disk full"));
        const survivor = storage.createNewThread(root);
        const survivorGen = await captured(storage, survivor, "survivor");
        expect(storage.getGeneration(root, survivor, survivorGen)?.checkpoint).toBeDefined();
        expect(new CopilotPersistenceStore().listCheckpoints(root, survivor)).toEqual([]);

        await storage.deleteThread(root, doomed);
        await storage.flushCheckpointGc(root);

        expect(fs.existsSync(blobOf("// only the doomed thread\n"))).toBe(false);
        expect(fs.existsSync(blobOf("// never saved\n"))).toBe(true);
    });

    it("waits for a pending capture and keeps the blobs it wrote", async () => {
        const storage = new ChatStateStorage(GC_NOW);
        const doomed = storage.createNewThread(root);
        fs.writeFileSync(at("only.bal"), "// only the doomed thread\n");
        await captured(storage, doomed, "doomed");

        fs.rmSync(at("only.bal"));
        fs.writeFileSync(at("pending.bal"), "// captured while GC waits\n");
        const service = getCheckpointService(root);
        const capture = service.capture.bind(service);
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        let blobsWritten!: () => void;
        const written = new Promise<void>(resolve => { blobsWritten = resolve; });
        jest.spyOn(service, "capture").mockImplementation(async (...args) => {
            const checkpoint = await capture(...args);
            blobsWritten();
            await gate;
            return checkpoint;
        });
        const survivor = storage.createNewThread(root);
        const { id: pendingGen } = storage.addGeneration(root, survivor, "pending", {});
        await written;

        await storage.deleteThread(root, doomed);
        let settled = false;
        const gc = storage.flushCheckpointGc(root).then(() => { settled = true; });
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(settled).toBe(false);
        release();
        await gc;

        expect(storage.getGeneration(root, survivor, pendingGen)?.checkpoint).toBeDefined();
        expect(fs.existsSync(blobOf("// captured while GC waits\n"))).toBe(true);
        expect(fs.existsSync(blobOf("// only the doomed thread\n"))).toBe(false);
    });

    it("never creates or reads the blob store in a workspace with only v1 checkpoints", async () => {
        const storage = new ChatStateStorage(GC_NOW);
        const thread = storage.createNewThread(root);
        const { id: generationId } = storage.addGeneration(root, thread, "old", {}, undefined, true);
        const v1 = {
            id: "cp-v1", messageId: generationId, timestamp: 1700000000000, fileList: ["main.bal"],
            snapshotSize: 10, workspaceSnapshot: { "main.bal": "// v1\n" }, workspaceRoot: root, schemaVersion: 1,
        };
        const file = path.join(storage.getThreadDir(root, thread), "checkpoints", `${generationId}.snapshot.gz`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(v1)));
        const sweep = jest.spyOn(FsBlobStore.prototype, "sweep");
        const readdir = jest.spyOn(fs.promises, "readdir");

        storage.removeGeneration(root, thread, generationId);
        await storage.flushCheckpointGc(root);

        expect(fs.existsSync(objectsDir())).toBe(false);
        expect(sweep).not.toHaveBeenCalled();
        expect(readdir.mock.calls.filter(([dir]) => String(dir).startsWith(objectsDir()))).toEqual([]);
    });

    it("reads only the checkpoints it does not hold in memory, and keeps their blobs", async () => {
        const storage = new ChatStateStorage(GC_NOW);
        const doomed = storage.createNewThread(root);
        fs.writeFileSync(at("only.bal"), "// only the doomed thread\n");
        await captured(storage, doomed, "doomed");
        fs.rmSync(at("only.bal"));
        const kept = storage.createNewThread(root);
        fs.writeFileSync(at("kept.bal"), "// in memory\n");
        await captured(storage, kept, "kept");

        fs.rmSync(at("kept.bal"));
        fs.writeFileSync(at("other.bal"), "// other window\n");
        const otherWindow = new ChatStateStorage(GC_NOW);
        const otherThread = otherWindow.createNewThread(root);
        const otherGen = await captured(otherWindow, otherThread, "other");

        const persistence = (storage as unknown as { persistenceStore: CopilotPersistenceStore }).persistenceStore;
        const load = jest.spyOn(persistence, "loadCheckpointAsync");
        await storage.deleteThread(root, doomed);
        await storage.flushCheckpointGc(root);

        expect(load.mock.calls.map(([, threadId, generationId]) => [threadId, generationId])).toEqual([[otherThread, otherGen]]);
        expect(fs.existsSync(blobOf("// only the doomed thread\n"))).toBe(false);
        expect(fs.existsSync(blobOf("// in memory\n"))).toBe(true);
        expect(fs.existsSync(blobOf("// other window\n"))).toBe(true);
    });

    it("does not let a capture reuse a blob the sweep is about to delete", async () => {
        const storage = new ChatStateStorage(GC_NOW);
        const doomed = storage.createNewThread(root);
        fs.writeFileSync(at("Config.toml"), "port = 8080\n");
        await captured(storage, doomed, "doomed");
        fs.rmSync(at("Config.toml"));
        const later = storage.createNewThread(root);

        let laterGen = "";
        const sweep = FsBlobStore.prototype.sweep;
        jest.spyOn(FsBlobStore.prototype, "sweep").mockImplementation(async function (this: FsBlobStore, ...args) {
            fs.writeFileSync(at("Config.toml"), "port = 8080\n");
            laterGen = storage.addGeneration(root, later, "later", {}).id;
            await new Promise(resolve => setTimeout(resolve, 50));
            return sweep.apply(this, args);
        });

        await storage.deleteThread(root, doomed);
        await storage.flushCheckpointGc(root);
        await storage.waitForCheckpointCapture(laterGen);

        expect(fs.existsSync(blobOf("port = 8080\n"))).toBe(true);
    });

    it("moves an unreadable persisted checkpoint aside and still collects", async () => {
        const storage = new ChatStateStorage(GC_NOW);
        const doomed = storage.createNewThread(root);
        fs.writeFileSync(at("only.bal"), "// only the doomed thread\n");
        await captured(storage, doomed, "doomed");
        fs.rmSync(at("only.bal"));

        const otherWindow = new ChatStateStorage(GC_NOW);
        const otherThread = otherWindow.createNewThread(root);
        const otherGen = await captured(otherWindow, otherThread, "other");
        const checkpointFile = path.join(storage.getThreadDir(root, otherThread), "checkpoints", `${otherGen}.snapshot.gz`);
        fs.writeFileSync(checkpointFile, "not gzip");

        await storage.deleteThread(root, doomed);
        await storage.flushCheckpointGc(root);

        expect(fs.existsSync(blobOf("// only the doomed thread\n"))).toBe(false);
        expect(fs.existsSync(checkpointFile)).toBe(false);
        expect(fs.existsSync(`${checkpointFile}.unreadable`)).toBe(true);
    });

    it("leaves a checkpoint it cannot read in place and skips the run", async () => {
        const storage = new ChatStateStorage(GC_NOW);
        const doomed = storage.createNewThread(root);
        fs.writeFileSync(at("only.bal"), "// only the doomed thread\n");
        await captured(storage, doomed, "doomed");
        fs.rmSync(at("only.bal"));

        const otherWindow = new ChatStateStorage(GC_NOW);
        const otherThread = otherWindow.createNewThread(root);
        const otherGen = await captured(otherWindow, otherThread, "other");
        const checkpointFile = path.join(storage.getThreadDir(root, otherThread), "checkpoints", `${otherGen}.snapshot.gz`);
        const readFile = fs.promises.readFile;
        jest.spyOn(fs.promises, "readFile").mockImplementation(((file: fs.PathLike, ...rest: unknown[]) =>
            String(file) === checkpointFile
                ? Promise.reject(Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" }))
                : (readFile as (...a: unknown[]) => Promise<Buffer>)(file, ...rest)) as typeof readFile);
        const sweep = jest.spyOn(FsBlobStore.prototype, "sweep");
        jest.spyOn(console, "warn").mockImplementation(() => undefined);

        await storage.deleteThread(root, doomed);
        await storage.flushCheckpointGc(root);

        expect(fs.existsSync(checkpointFile)).toBe(true);
        expect(fs.existsSync(`${checkpointFile}.unreadable`)).toBe(false);
        expect(sweep).not.toHaveBeenCalled();
        expect(fs.existsSync(blobOf("// only the doomed thread\n"))).toBe(true);
    });

    it("loads persisted checkpoints without holding up a capture", async () => {
        const storage = new ChatStateStorage(GC_NOW);
        const doomed = storage.createNewThread(root);
        fs.writeFileSync(at("only.bal"), "// only the doomed thread\n");
        await captured(storage, doomed, "doomed");
        fs.rmSync(at("only.bal"));
        const otherWindow = new ChatStateStorage(GC_NOW);
        await captured(otherWindow, otherWindow.createNewThread(root), "other");

        const persistence = (storage as unknown as { persistenceStore: CopilotPersistenceStore }).persistenceStore;
        const load = persistence.loadCheckpointAsync.bind(persistence);
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        let loading!: () => void;
        const loadStarted = new Promise<void>(resolve => { loading = resolve; });
        jest.spyOn(persistence, "loadCheckpointAsync").mockImplementation(async (...args) => {
            loading();
            await gate;
            return load(...args);
        });
        const sweep = jest.spyOn(FsBlobStore.prototype, "sweep");

        await storage.deleteThread(root, doomed);
        const gc = storage.flushCheckpointGc(root);
        await loadStarted;
        fs.writeFileSync(at("during.bal"), "// captured while GC loads\n");
        const { id } = storage.addGeneration(root, storage.createNewThread(root), "during", {});
        const outcome = await Promise.race([
            storage.waitForCheckpointCapture(id).then(() => "captured"),
            new Promise(resolve => setTimeout(() => resolve("blocked"), 1000)),
        ]);
        release();
        await gc;

        expect(outcome).toBe("captured");
        expect(sweep).toHaveBeenCalled();
        expect(fs.existsSync(blobOf("// captured while GC loads\n"))).toBe(true);
        expect(fs.existsSync(blobOf("// only the doomed thread\n"))).toBe(false);
    });

    describe("with roots that share one workspace identity", () => {
        let otherRoot: string;

        beforeEach(() => {
            process.env.CLOUD_INITIAL_PROJECT_ID = "shared-project";
            otherRoot = fs.mkdtempSync(path.join(os.tmpdir(), "checkpoint-gc-ws-other-"));
        });

        afterEach(() => {
            delete process.env.CLOUD_INITIAL_PROJECT_ID;
            fs.rmSync(otherRoot, { recursive: true, force: true });
        });

        it("runs a capture for one root only after a sweep for the other", async () => {
            const storage = new ChatStateStorage(GC_NOW);
            const doomed = storage.createNewThread(root);
            fs.writeFileSync(at("main.bal"), "// main\n");
            await captured(storage, doomed, "doomed");

            let release!: () => void;
            const gate = new Promise<void>(resolve => { release = resolve; });
            let sweeping!: () => void;
            const sweepStarted = new Promise<void>(resolve => { sweeping = resolve; });
            const sweep = FsBlobStore.prototype.sweep;
            jest.spyOn(FsBlobStore.prototype, "sweep").mockImplementation(async function (this: FsBlobStore, ...args) {
                sweeping();
                await gate;
                return sweep.apply(this, args);
            });
            const otherService = getCheckpointService(otherRoot);
            const otherCapture = jest.spyOn(otherService, "capture");

            await storage.deleteThread(root, doomed);
            const gc = storage.flushCheckpointGc(root);
            await sweepStarted;
            const { id } = storage.addGeneration(otherRoot, storage.createNewThread(otherRoot), "other root", {});
            await new Promise(resolve => setTimeout(resolve, 50));
            const calledDuringSweep = otherCapture.mock.calls.length;
            release();
            await gc;
            await storage.waitForCheckpointCapture(id);

            expect(calledDuringSweep).toBe(0);
            expect(otherCapture).toHaveBeenCalledTimes(1);
        });
    });
});
