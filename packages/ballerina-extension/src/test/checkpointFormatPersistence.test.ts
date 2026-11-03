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
import * as zlib from "zlib";
import type { Checkpoint } from "@wso2/ballerina-core/lib/state-machine-types";
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

import { ChatStateStorage } from "../views/ai-panel/chatStateStorage";
import { getCheckpointService } from "../views/ai-panel/checkpoint/checkpointService";
import { checkpointNotifier } from "../views/ai-panel/checkpoint/checkpointNotifier";
import { DEFAULT_CHECKPOINT_CONFIG } from "../views/ai-panel/checkpoint/checkpointConfig";
import { readDiffOriginal } from "../views/ai-panel/checkpoint/checkpointUtils";
import { FsBlobStore } from "../views/ai-panel/checkpoint/blobStore";

const THREAD = "default";
const ORIGINAL_BAL = "// before the generation\n";

describe("checkpoint formats on disk", () => {
    let root: string;
    let settings: Record<string, unknown>;

    const at = (name: string) => path.join(root, name);
    const text = (content: { state: string; bytes?: Buffer } | undefined) =>
        content?.state === "content" ? content.bytes!.toString("utf8") : content?.state;

    const generationWithCheckpoint = async (storage: ChatStateStorage, prompt: string) => {
        const { id } = storage.addGeneration(root, THREAD, prompt, {});
        await storage.waitForCheckpointCapture(id);
        return id;
    };
    const reloaded = (generationId: string): Checkpoint | undefined =>
        new ChatStateStorage().getOrCreateThread(root, THREAD).generations.find(g => g.id === generationId)?.checkpoint;

    beforeEach(() => {
        baseDir.current = fs.mkdtempSync(path.join(os.tmpdir(), "checkpoint-format-store-"));
        root = fs.mkdtempSync(path.join(os.tmpdir(), "checkpoint-format-ws-"));
        fs.writeFileSync(at("main.bal"), ORIGINAL_BAL);
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

    it("captures generations in the content store and round-trips them intact", async () => {
        const generationId = await generationWithCheckpoint(new ChatStateStorage(), "add a service");
        const captured = new ChatStateStorage().getOrCreateThread(root, THREAD)
            .generations.find(g => g.id === generationId)?.checkpoint;

        expect(captured?.storage?.kind).toBe("content-store");
        expect(captured?.schemaVersion).toBe(2);
        expect(captured?.workspaceSnapshot).toBeUndefined();
        expect(captured?.workspaceRoot).toBe(root);
        expect(captured?.ignorePatterns).toEqual(DEFAULT_CHECKPOINT_CONFIG.ignorePatterns);

        fs.writeFileSync(at("main.bal"), "// the generation's edit\n");
        const originals = await getCheckpointService(root).readOriginals(captured!, ["main.bal"]);
        expect(text(originals.get("main.bal"))).toBe(ORIGINAL_BAL);
    });

    it("loads a v1 checkpoint written by the previous release as inline", async () => {
        const writer = new ChatStateStorage();
        const { id: generationId } = writer.addGeneration(root, THREAD, "add a service", {}, undefined, true);
        const v1 = {
            id: "cp-v1",
            messageId: generationId,
            timestamp: 1700000000000,
            fileList: ["main.bal", "Config.toml"],
            snapshotSize: 52,
            workspaceSnapshot: { "main.bal": ORIGINAL_BAL, "Config.toml": 'greeting = "hi"\n' },
            workspaceRoot: root,
            ignorePatterns: ["**/target/**"],
            schemaVersion: 1,
        };
        const file = path.join(writer.getThreadDir(root, THREAD), "checkpoints", `${generationId}.snapshot.gz`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(v1)));

        const loaded = reloaded(generationId);

        expect(loaded).toEqual({ ...v1, schemaVersion: 2, storage: { kind: "inline" } });
        const originals = await getCheckpointService(root).readOriginals(loaded!, ["main.bal", "Config.toml", "added.bal"]);
        expect(text(originals.get("main.bal"))).toBe(ORIGINAL_BAL);
        expect(text(originals.get("Config.toml"))).toBe('greeting = "hi"\n');
        expect(originals.get("added.bal")).toEqual({ state: "absent" });
    });

    it("reads a file left out as too large as unavailable", async () => {
        fs.writeFileSync(at("dataset.csv"), "x".repeat(4096));
        settings.maxFileSize = 1024;
        jest.spyOn(checkpointNotifier, "largeFilesSkipped").mockImplementation(() => {});

        const generationId = await generationWithCheckpoint(new ChatStateStorage(), "load the dataset");
        const originals = await getCheckpointService(root).readOriginals(reloaded(generationId)!, ["dataset.csv", "main.bal"]);

        expect(originals.get("dataset.csv")).toEqual({ state: "unavailable", reason: "tooLarge" });
        expect(text(originals.get("main.bal"))).toBe(ORIGINAL_BAL);
    });

    it("captures against the newest content-store checkpoint in the workspace", async () => {
        const storage = new ChatStateStorage();
        const firstId = await generationWithCheckpoint(storage, "first");
        const first = storage.getOrCreateThread(root, THREAD).generations.find(g => g.id === firstId)?.checkpoint;
        const capture = jest.spyOn(getCheckpointService(root), "capture");

        const otherThread = storage.createNewThread(root);
        const { id: secondId } = storage.addGeneration(root, otherThread, "second", {});
        await storage.waitForCheckpointCapture(secondId);

        expect(capture).toHaveBeenCalledWith(secondId, { previous: first });
    });

    it("throws on a checkpoint from a newer version without the restore-worded notice", async () => {
        const unknownFormat = jest.spyOn(checkpointNotifier, "unknownFormat").mockImplementation(() => {});
        const newer = {
            id: "cp-new", messageId: "gen-new", timestamp: 0, fileList: ["main.bal"], snapshotSize: 0,
            schemaVersion: 3, storage: { kind: "journal" },
        } as unknown as Checkpoint;

        await expect(getCheckpointService(root).readOriginals(newer, ["main.bal"])).rejects.toThrow();

        expect(unknownFormat).not.toHaveBeenCalled();
    });

    describe("diff originals", () => {
        it("gives the stored text, or an empty original for a file the generation added", async () => {
            const cp = (await getCheckpointService(root).capture("gen-1"))!;

            await expect(readDiffOriginal(root, cp, "main.bal")).resolves.toEqual({ kind: "content", content: ORIGINAL_BAL });
            await expect(readDiffOriginal(root, cp, "added.bal")).resolves.toEqual({ kind: "content", content: "" });
        });

        it("explains a too-large file instead of diffing it against nothing", async () => {
            fs.writeFileSync(at("dataset.csv"), "x".repeat(4096));
            settings.maxFileSize = 1024;
            jest.spyOn(checkpointNotifier, "largeFilesSkipped").mockImplementation(() => {});
            const cp = (await getCheckpointService(root).capture("gen-1"))!;

            await expect(readDiffOriginal(root, cp, "dataset.csv")).resolves.toEqual({
                kind: "unavailable",
                message: "This file is too large to be included in the checkpoint, so there is no earlier version to compare.",
            });
        });

        it("reports a checkpoint from a newer version", async () => {
            const newer = { id: "cp-new", messageId: "g", timestamp: 0, fileList: [], snapshotSize: 0, schemaVersion: 3 } as Checkpoint;

            await expect(readDiffOriginal(root, newer, "main.bal")).resolves.toEqual({ kind: "newerFormat" });
        });

        it("reports a missing stored blob as unavailable rather than failing", async () => {
            const cp = (await getCheckpointService(root).capture("gen-1"))!;
            jest.spyOn(console, "error").mockImplementation(() => {});
            fs.rmSync(path.join(baseDir.current, "workspaces"), { recursive: true, force: true });

            await expect(readDiffOriginal(root, cp, "main.bal")).resolves.toMatchObject({ kind: "unavailable" });
        });

        it("reports a stored blob it cannot read as missing rather than failing", async () => {
            const cp = (await getCheckpointService(root).capture("gen-1"))!;
            const error = jest.spyOn(console, "error").mockImplementation(() => {});
            jest.spyOn(FsBlobStore.prototype, "get").mockRejectedValue(Object.assign(new Error("EACCES"), { code: "EACCES" }));

            await expect(readDiffOriginal(root, cp, "main.bal")).resolves.toEqual({
                kind: "unavailable",
                message: "The earlier version of this file is missing from the checkpoint, so it cannot be compared.",
            });
            expect(error).toHaveBeenCalled();
        });
    });
});
