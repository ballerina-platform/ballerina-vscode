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

// A checkpoint restore rewrites the workspace and then waits for the Language Server to publish
// the artifacts of what it just wrote. That notification is advisory — it only refreshes the
// visualizer's current location — and it can legitimately never arrive, so whether it does must
// not decide the restore's outcome: the caller truncates the chat history on the strength of that
// boolean, and a stale history against reverted files is the state to avoid.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Checkpoint } from "@wso2/ballerina-core/lib/state-machine-types";
// The module jest maps `vscode` to, imported by path so the stubs tests reassign stay mutable.
import { Uri, window, workspace } from "./__mocks__/vscode";
import { ArtifactNotificationHandler, ArtifactsUpdated } from "../utils/project-artifacts-handler";

const artifactLocationUpdates: unknown[] = [];

jest.mock("../rpc-managers/visualizer/rpc-manager", () => ({
    VisualizerRpcManager: class {
        updateCurrentArtifactLocation(params: unknown) {
            artifactLocationUpdates.push(params);
        }
    },
}));
const dataMapper: { context: unknown; refresh: () => Promise<void> } = {
    context: {},
    refresh: () => Promise.resolve(),
};

jest.mock("../stateMachine", () => ({
    StateMachine: { context: () => dataMapper.context },
    updateView: () => {},
}));
jest.mock("../rpc-managers/data-mapper/utils", () => ({
    refreshDataMapper: () => dataMapper.refresh(),
}));
jest.mock("../RPCLayer", () => ({
    notifyCurrentWebview: () => {},
    suppressWebviewNotifications: () => () => {},
}));

import { getCheckpointConfig } from "../views/ai-panel/checkpoint/checkpointConfig";
import { CheckpointService } from "../views/ai-panel/checkpoint/checkpointService";
import { FsBlobStore } from "../views/ai-panel/checkpoint/blobStore";
import { InlineSnapshotBackend } from "../views/ai-panel/checkpoint/backends/inlineSnapshotBackend";
import { ContentStoreBackend } from "../views/ai-panel/checkpoint/backends/contentStoreBackend";

const ORIGINAL_CONFIG = 'greeting = "before the generation"\n';
/** PNG magic bytes plus sequences no UTF-8 decoder can round-trip. */
const RAW_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0x80]);
const ORIGINAL_BAL = "// before the generation\n";

/** Answers the deletion modal by taking its first button, as a click would. */
function answerDeletionPrompt(choice = 0): void {
    window.showWarningMessage = ((_message: string, ...rest: unknown[]) => {
        const isModal = typeof rest[0] === "object" && rest[0] !== null;
        return Promise.resolve(isModal ? (rest[1 + choice] as string) : undefined);
    }) as never;
}

const realSetImmediate = setImmediate;

/** Yields to real I/O (blob reads, hashing) until the condition holds; fake timers never advance here. */
async function waitUntil(condition: () => boolean, what: string): Promise<void> {
    for (let i = 0; i < 20_000; i++) {
        if (condition()) {
            return;
        }
        await new Promise(resolve => realSetImmediate(resolve));
    }
    throw new Error(`Timed out waiting for ${what}`);
}

function track<T>(promise: Promise<T>): { promise: Promise<T>; settled: () => boolean } {
    let done = false;
    const tracked = promise.finally(() => { done = true; });
    return { promise: tracked, settled: () => done };
}

const hasArtifactSubscriber = () =>
    (ArtifactNotificationHandler.getInstance() as unknown as { subscribers: Map<string, unknown> })
        .subscribers.has(ArtifactsUpdated.method);

/** The handler is a process-wide singleton; drop any subscription an earlier test abandoned. */
function resetArtifactSubscribers(): void {
    const handler = ArtifactNotificationHandler.getInstance() as unknown as { subscribers: Map<string, unknown> };
    handler.subscribers.clear();
}

function publishArtifactsUpdated(): void {
    ArtifactNotificationHandler.getInstance().publish(ArtifactsUpdated.method, {
        data: [{ id: "svc" }] as never,
        timestamp: Date.now(),
    });
}

type Kind = "inline" | "content-store";

/** One storage backend's view of a checkpoint fixture: how a test builds, reads and tampers with it. */
function harness(kind: Kind) {
    let storeDir = "";
    let store: FsBlobStore;
    let service: CheckpointService;

    const setup = () => {
        storeDir = fs.mkdtempSync(path.join(os.tmpdir(), "checkpoint-objects-"));
        store = new FsBlobStore(storeDir);
        service = new CheckpointService({
            backends: [new InlineSnapshotBackend(), new ContentStoreBackend(store)],
            defaultKind: kind,
            config: getCheckpointConfig,
            notify: { tooLarge() {}, largeFilesSkipped() {}, unknownFormat() {}, contentUnavailable() {} },
        });
    };
    const teardown = () => fs.rmSync(storeDir, { recursive: true, force: true });

    const storedPaths = (cp: Checkpoint): string[] =>
        kind === "inline" || cp.storage?.kind !== "content-store"
            ? Object.keys(cp.workspaceSnapshot ?? {})
            : Object.entries(cp.storage.files).filter(([, entry]) => "hash" in entry).map(([p]) => p);

    const setStored = async (cp: Checkpoint, filePath: string, content: string): Promise<void> => {
        if (kind === "inline") {
            cp.workspaceSnapshot = { ...cp.workspaceSnapshot, [filePath]: content };
            return;
        }
        if (cp.storage?.kind !== "content-store") {
            throw new Error("not a content-store checkpoint");
        }
        const bytes = Buffer.from(content, "utf8");
        const { id } = await store.put(bytes);
        cp.storage.files[filePath] = { hash: id, size: bytes.length, mtimeMs: 0 };
    };

    const makeCheckpoint = async (base: Omit<Checkpoint, "workspaceSnapshot">, snapshot: Record<string, string>) => {
        const cp: Checkpoint = kind === "inline"
            ? { ...base, workspaceSnapshot: {} }
            : { ...base, schemaVersion: 2, storage: { kind: "content-store", files: {} } };
        for (const [filePath, content] of Object.entries(snapshot)) {
            await setStored(cp, filePath, content);
        }
        return cp;
    };

    return {
        setup,
        teardown,
        storedPaths,
        setStored,
        makeCheckpoint,
        captureWorkspaceSnapshot: (messageId: string) => service.capture(messageId),
        restoreWorkspaceSnapshot: (cp: Checkpoint, skipArtifactWait = false) => service.restore(cp, { skipArtifactWait }),
    };
}

const KINDS: Kind[] = ["inline", "content-store"];

describe.each(KINDS)("checkpoint restore outcome vs. the artifact-update notification (%s)", (kind) => {
    const h = harness(kind);
    const { restoreWorkspaceSnapshot } = h;
    let root: string;
    let checkpoint: Checkpoint;

    beforeEach(async () => {
        h.setup();
        artifactLocationUpdates.length = 0;
        resetArtifactSubscribers();
        dataMapper.context = {};
        dataMapper.refresh = () => Promise.resolve();
        workspace.textDocuments = [];
        answerDeletionPrompt();
        root = fs.mkdtempSync(path.join(os.tmpdir(), "checkpoint-restore-"));
        fs.writeFileSync(path.join(root, "main.bal"), "// the generation's edit\n");
        fs.writeFileSync(path.join(root, "Config.toml"), 'greeting = "the generation\'s edit"\n');
        fs.writeFileSync(path.join(root, "extra.txt"), "added by the generation\n");

        checkpoint = await h.makeCheckpoint({
            id: "cp-1",
            messageId: "msg-1",
            timestamp: 0,
            fileList: ["main.bal", "Config.toml"],
            snapshotSize: ORIGINAL_BAL.length + ORIGINAL_CONFIG.length,
        }, { "main.bal": ORIGINAL_BAL, "Config.toml": ORIGINAL_CONFIG });

        workspace.workspaceFolders = [{ uri: Uri.file(root) }];
        workspace.findFiles = () =>
            Promise.resolve(
                ["main.bal", "Config.toml", "extra.txt"].map(name => Uri.file(path.join(root, name)))
            );
        workspace.applyEdit = () => Promise.resolve(true);
        workspace.saveAll = () => Promise.resolve(true);
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
        fs.rmSync(root, { recursive: true, force: true });
        h.teardown();
    });

    it("reports the restore as successful when no artifact update ever arrives", async () => {
        const restore = track(restoreWorkspaceSnapshot(checkpoint));
        await waitUntil(() => hasArtifactSubscriber() || restore.settled(), "the restore to wait for artifacts");
        await jest.advanceTimersByTimeAsync(10_000);

        await expect(restore.promise).resolves.toBe(true);
        expect(fs.readFileSync(path.join(root, "Config.toml"), "utf8")).toBe(ORIGINAL_CONFIG);
        expect(fs.existsSync(path.join(root, "extra.txt"))).toBe(false);
    });

    it("does not miss an artifact update published while the edits are being applied", async () => {
        // The Language Server can answer the edit before the restore gets back to its own wait.
        workspace.applyEdit = () => {
            publishArtifactsUpdated();
            return Promise.resolve(true);
        };

        // No fake timer is advanced, so a missed update would leave the restore waiting until this times out.
        const restore = track(restoreWorkspaceSnapshot(checkpoint));
        await waitUntil(restore.settled, "the restore to settle without its artifact timeout");

        await expect(restore.promise).resolves.toBe(true);
        expect(artifactLocationUpdates).toEqual([{ artifacts: [{ id: "svc" }] }]);
    });

    it("forwards the artifacts to the visualizer when the update arrives after the edits", async () => {
        const restore = track(restoreWorkspaceSnapshot(checkpoint));
        await waitUntil(hasArtifactSubscriber, "the restore to wait for artifacts");
        publishArtifactsUpdated();
        await waitUntil(restore.settled, "the restore to settle after the update");

        await expect(restore.promise).resolves.toBe(true);
        expect(artifactLocationUpdates).toEqual([{ artifacts: [{ id: "svc" }] }]);
    });

    it("reports failure when the workspace edit itself does not apply, and stops listening", async () => {
        workspace.applyEdit = () => Promise.resolve(false);

        const restore = track(restoreWorkspaceSnapshot(checkpoint));
        await waitUntil(restore.settled, "the failed restore to settle");

        await expect(restore.promise).resolves.toBe(false);

        publishArtifactsUpdated();
        await jest.advanceTimersByTimeAsync(10_000);
        expect(artifactLocationUpdates).toEqual([]);
    });
});

const realDelete = workspace.fs.delete;

describe.each(KINDS)("what a checkpoint restore is allowed to touch (%s)", (kind) => {
    const h = harness(kind);
    const { captureWorkspaceSnapshot, restoreWorkspaceSnapshot, storedPaths, setStored } = h;
    const inlineOnly = kind === "inline" ? it : it.skip;
    const contentStoreOnly = kind === "content-store" ? it : it.skip;
    let root: string;
    let checkpoint: Checkpoint;
    let applied: { op: string; uri: { fsPath: string }; content?: string }[];
    let warnings: string[];

    const at = (name: string) => path.join(root, name);

    beforeEach(async () => {
        h.setup();
        artifactLocationUpdates.length = 0;
        resetArtifactSubscribers();
        dataMapper.context = {};
        dataMapper.refresh = () => Promise.resolve();
        workspace.textDocuments = [];
        applied = [];
        warnings = [];
        workspace.fs.delete = realDelete;

        root = fs.mkdtempSync(path.join(os.tmpdir(), "checkpoint-touch-"));
        fs.writeFileSync(at("main.bal"), "// the generation's edit\n");
        fs.writeFileSync(at("Config.toml"), 'greeting = "the generation\'s edit"\n');

        checkpoint = await h.makeCheckpoint({
            id: "cp-1",
            messageId: "msg-1",
            timestamp: 0,
            fileList: ["main.bal", "Config.toml"],
            snapshotSize: 0,
        }, { "main.bal": ORIGINAL_BAL, "Config.toml": ORIGINAL_CONFIG });

        workspace.workspaceFolders = [{ uri: Uri.file(root) }];
        workspace.findFiles = () =>
            Promise.resolve(fs.readdirSync(root).map(name => Uri.file(at(name))));
        workspace.applyEdit = (edit: unknown) => {
            applied.push(...(edit as { entries: typeof applied }).entries);
            return Promise.resolve(true);
        };
        workspace.saveAll = () => Promise.resolve(true);
        window.showWarningMessage = ((message: string, ...rest: unknown[]) => {
            const isModal = typeof rest[0] === "object" && rest[0] !== null;
            if (!isModal) { warnings.push(message); }
            return Promise.resolve(isModal ? (rest[1] as string) : undefined);
        }) as never;
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
        h.teardown();
    });

    inlineOnly("captures a non-text file into the file list but not into the snapshot", async () => {
        fs.writeFileSync(at("logo.png"), RAW_BYTES);

        const captured: any = await captureWorkspaceSnapshot("msg-1");

        // In the file list so a restore never deletes it; out of the snapshot so a restore never
        // writes a lossy decode over it.
        expect(captured.fileList).toContain("logo.png");
        expect(storedPaths(captured)).not.toContain("logo.png");
        expect(storedPaths(captured)).toContain("Config.toml");
    });

    contentStoreOnly("captures a non-text file byte for byte", async () => {
        fs.writeFileSync(at("logo.png"), RAW_BYTES);

        const captured: any = await captureWorkspaceSnapshot("msg-1");

        expect(captured.fileList).toContain("logo.png");
        expect(storedPaths(captured)).toContain("logo.png");
        expect(storedPaths(captured)).toContain("Config.toml");
    });

    it("leaves a non-text file alone without reporting it, when the snapshot never held it", async () => {
        fs.writeFileSync(at("logo.png"), RAW_BYTES);
        checkpoint.fileList.push("logo.png");

        await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);

        expect(fs.readFileSync(at("logo.png")).equals(RAW_BYTES)).toBe(true);
        expect(warnings).toEqual([]);
    });

    inlineOnly("never recreates a file from a lossy snapshot entry left by an older checkpoint", async () => {
        // The generation deleted the image, so a restore would have to write it back — and the only
        // content an older checkpoint has for it is the mangled decode.
        checkpoint.fileList.push("logo.png");
        await setStored(checkpoint, "logo.png", RAW_BYTES.toString("utf8"));

        await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);

        expect(fs.existsSync(at("logo.png"))).toBe(false);
        expect(warnings.join(" ")).toContain("logo.png");
    });

    it("restores a file even when an SCM diff document shares its path", async () => {
        fs.writeFileSync(at("main.bal"), "// the generation's edit\n");
        // A `git:` document mirrors main.bal with the same fsPath and HEAD's content, which equals
        // the snapshot — comparing against it would skip restoring the real file.
        workspace.textDocuments = [{
            uri: { fsPath: at("main.bal"), toString: () => `git://${at("main.bal")}`, scheme: "git" },
            isDirty: false,
            save: () => Promise.resolve(true),
            getText: () => ORIGINAL_BAL,
        } as never];

        await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);

        expect(applied.filter(e => e.op === "replace").map(e => e.content)).toContain(ORIGINAL_BAL);
    });

    it("restores a file whose open editor still holds pre-generation text", async () => {
        // The agent writes non-.bal files straight to disk, so an open, unmodified editor can lag
        // behind: its buffer matches the snapshot while disk holds the generation's content.
        workspace.textDocuments = [{
            uri: Uri.file(at("Config.toml")),
            isDirty: false,
            save: () => Promise.resolve(true),
            getText: () => ORIGINAL_CONFIG,
        } as never];

        await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);

        expect(fs.readFileSync(at("Config.toml"), "utf8")).toBe(ORIGINAL_CONFIG);
    });

    it("follows the user's trash setting when deleting a file the snapshot never captured", async () => {
        fs.writeFileSync(at("added-by-hand.csv"), "id,name\n1,ada\n");
        const deletes: Array<boolean | undefined> = [];
        workspace.fs.delete = (_uri: { fsPath: string }, options?: { useTrash?: boolean }) => {
            deletes.push(options?.useTrash);
            return Promise.resolve();
        };
        const originalGetConfiguration = workspace.getConfiguration;
        workspace.getConfiguration = ((section?: string) => ({
            get: (key: string, defaultValue?: unknown) =>
                section === "files" && key === "enableTrash" ? false : defaultValue,
            update: () => Promise.resolve(),
            inspect: () => undefined,
        })) as never;

        try {
            await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);
            expect(deletes).toEqual([false]);
        } finally {
            workspace.getConfiguration = originalGetConfiguration;
        }
    });

    it("leaves a file in place when the trash refuses it, rather than deleting it permanently", async () => {
        fs.writeFileSync(at("added-by-hand.csv"), "id,name\n1,ada\n");
        workspace.fs.delete = () => Promise.reject(new Error("trash is not available"));

        await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);

        expect(fs.existsSync(at("added-by-hand.csv"))).toBe(true);
        expect(warnings.join(" ")).toContain("added-by-hand.csv");
    });

    it("does not rewrite a file that already matches the snapshot", async () => {
        fs.writeFileSync(at("main.bal"), ORIGINAL_BAL);
        fs.writeFileSync(at("Config.toml"), ORIGINAL_CONFIG);
        const before = fs.statSync(at("Config.toml")).mtimeMs;

        await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);

        expect(applied).toEqual([]);
        expect(fs.statSync(at("Config.toml")).mtimeMs).toBe(before);
    });

    it("rewrites an unsaved editor over an unchanged file only for inline checkpoints", async () => {
        fs.writeFileSync(at("main.bal"), ORIGINAL_BAL);
        workspace.textDocuments = [{
            uri: Uri.file(at("main.bal")),
            isDirty: true,
            save: () => Promise.resolve(true),
            getText: () => "// half-typed edit the user has not saved\n",
        }];

        await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);

        const replaced = applied.filter(e => e.op === "replace").map(e => e.content);
        if (kind === "inline") {
            expect(replaced).toContain(ORIGINAL_BAL);
        } else {
            expect(replaced).not.toContain(ORIGINAL_BAL);
        }
    });

    it("sends a file the snapshot never captured to the trash rather than unlinking it", async () => {
        fs.writeFileSync(at("added-by-hand.csv"), "id,name\n1,ada\n");
        const deletes: { fsPath: string; useTrash?: boolean }[] = [];
        workspace.fs.delete = (uri: { fsPath: string }, options?: { useTrash?: boolean }) => {
            deletes.push({ fsPath: uri.fsPath, useTrash: options?.useTrash });
            return Promise.resolve();
        };

        await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);

        expect(deletes).toEqual([{ fsPath: at("added-by-hand.csv"), useTrash: true }]);
        // The stub deliberately does not remove it: had the code fallen back to unlink, it would be gone.
        expect(fs.existsSync(at("added-by-hand.csv"))).toBe(true);
    });

    it("applies every other file before reporting a file it could not write", async () => {
        // A path the generation turned into a directory: writeFileSync throws EISDIR.
        fs.rmSync(at("Config.toml"));
        fs.mkdirSync(at("Config.toml"));

        await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(false);

        expect(applied.filter(e => e.op === "replace").map(e => e.content)).toContain(ORIGINAL_BAL);
    });

    it("reports success when the post-restore data mapper refresh fails", async () => {
        dataMapper.context = { dataMapperMetadata: { name: "transform", codeData: { lineRange: { fileName: "main.bal" } } } };
        dataMapper.refresh = () => Promise.reject(new Error("Data mapper refresh failed."));

        await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);

        expect(fs.readFileSync(at("Config.toml"), "utf8")).toBe(ORIGINAL_CONFIG);
    });
    it("asks before removing files the checkpoint does not contain", async () => {
        fs.writeFileSync(at("added-by-hand.csv"), "id,name\n1,ada\n");
        const prompts: string[] = [];
        window.showWarningMessage = ((message: string, ...rest: unknown[]) => {
            const isModal = typeof rest[0] === "object" && rest[0] !== null;
            if (isModal) { prompts.push(message); }
            return Promise.resolve(isModal ? (rest[1] as string) : undefined);
        }) as never;

        await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);

        expect(prompts).toHaveLength(1);
        expect(prompts[0]).toContain("added-by-hand.csv");
        expect(fs.existsSync(at("added-by-hand.csv"))).toBe(false);
    });

    it("does not promise the trash when the trash is switched off", async () => {
        fs.writeFileSync(at("added-by-hand.csv"), "id,name\n1,ada\n");
        const prompts: string[] = [];
        const buttons: string[] = [];
        window.showWarningMessage = ((message: string, ...rest: unknown[]) => {
            const isModal = typeof rest[0] === "object" && rest[0] !== null;
            if (isModal) {
                prompts.push(message);
                buttons.push(...(rest.slice(1) as string[]));
            }
            return Promise.resolve(isModal ? (rest[1] as string) : undefined);
        }) as never;
        const originalGetConfiguration = workspace.getConfiguration;
        workspace.getConfiguration = ((section?: string) => ({
            get: (key: string, defaultValue?: unknown) =>
                section === "files" && key === "enableTrash" ? false : defaultValue,
            update: () => Promise.resolve(),
            inspect: () => undefined,
        })) as never;

        try {
            await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);

            expect(buttons).toContain("Delete Permanently");
            expect(buttons).not.toContain("Move to Trash");
            expect(prompts[0]).toContain("cannot be recovered");
        } finally {
            workspace.getConfiguration = originalGetConfiguration;
        }
    });

    it("keeps the files and still restores the rest when the prompt is declined", async () => {
        fs.writeFileSync(at("added-by-hand.csv"), "id,name\n1,ada\n");
        window.showWarningMessage = ((_message: string, ...rest: unknown[]) => {
            const isModal = typeof rest[0] === "object" && rest[0] !== null;
            return Promise.resolve(isModal ? "Keep Them" : undefined);
        }) as never;

        await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);

        expect(fs.existsSync(at("added-by-hand.csv"))).toBe(true);
        expect(fs.readFileSync(at("Config.toml"), "utf8")).toBe(ORIGINAL_CONFIG);
    });

    it("writes nothing when the prompt is dismissed", async () => {
        fs.writeFileSync(at("added-by-hand.csv"), "id,name\n1,ada\n");
        window.showWarningMessage = (() => Promise.resolve(undefined)) as never;

        await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(false);

        expect(fs.existsSync(at("added-by-hand.csv"))).toBe(true);
        expect(fs.readFileSync(at("Config.toml"), "utf8")).not.toBe(ORIGINAL_CONFIG);
        expect(applied).toEqual([]);
    });

    it("lists a file it could not read at capture, without snapshotting it", async () => {
        fs.writeFileSync(at("locked.txt"), "held by another process\n");
        const realReadFile = workspace.fs.readFile;
        workspace.fs.readFile = (uri: { fsPath: string }) =>
            uri.fsPath.endsWith("locked.txt")
                ? Promise.reject(new Error("EBUSY"))
                : realReadFile(uri);

        try {
            const captured: any = await captureWorkspaceSnapshot("msg-1");

            // Listed so a restore leaves it alone; unsnapshotted because there is no content for it.
            expect(captured.fileList).toContain("locked.txt");
            expect(storedPaths(captured)).not.toContain("locked.txt");
        } finally {
            workspace.fs.readFile = realReadFile;
        }
    });

    it("does not delete a file the capture could not read", async () => {
        fs.writeFileSync(at("locked.txt"), "held by another process\n");
        checkpoint.fileList.push("locked.txt");

        await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);

        expect(fs.existsSync(at("locked.txt"))).toBe(true);
    });

    it("scans with the patterns recorded at capture, not the ones configured now", async () => {
        const excludes: string[] = [];
        workspace.findFiles = (_include?: unknown, exclude?: { pattern?: string }) => {
            if (exclude?.pattern) { excludes.push(exclude.pattern); }
            return Promise.resolve(["main.bal", "Config.toml"].map(name => Uri.file(at(name))));
        };
        checkpoint.ignorePatterns = ["**/captured-under-this/**"];

        await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);

        expect(excludes.join(" ")).toContain("captured-under-this");
    });

    it("records the root it captured against", async () => {
        const captured: any = await captureWorkspaceSnapshot("msg-1");

        expect(captured.workspaceRoot).toBe(root);
    });

    it("refuses a checkpoint captured against a different workspace root", async () => {
        checkpoint.workspaceRoot = path.join(path.dirname(root), "some-other-workspace");

        await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(false);

        // Nothing was touched: the paths in it describe a tree this workspace does not own.
        expect(fs.readFileSync(at("Config.toml"), "utf8")).not.toBe(ORIGINAL_CONFIG);
        expect(applied).toEqual([]);
    });

    it("restores when the recorded root is the same directory reached through a symlink", async () => {
        // VS Code can report /tmp/ws one session and /private/tmp/ws the next; same directory.
        const linkedRoot = path.join(path.dirname(root), `${path.basename(root)}-link`);
        fs.symlinkSync(root, linkedRoot, "dir");
        checkpoint.workspaceRoot = linkedRoot;

        try {
            await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);
            expect(fs.readFileSync(at("Config.toml"), "utf8")).toBe(ORIGINAL_CONFIG);
        } finally {
            fs.rmSync(linkedRoot, { force: true });
        }
    });

    it("refuses a path it cannot resolve, rather than falling back to a string compare", async () => {
        // Running as root defeats the permission bits, so the EACCES this asserts on never happens.
        if (process.getuid?.() === 0) {
            return;
        }
        const dir = at("unreadable-dir");
        fs.mkdirSync(dir);
        fs.writeFileSync(path.join(dir, "secret.txt"), "original\n");
        fs.chmodSync(dir, 0o000);
        // Listed, so the deletion pass leaves it alone and the write is what gets tested.
        checkpoint.fileList.push("unreadable-dir", "unreadable-dir/secret.txt");
        await setStored(checkpoint, "unreadable-dir/secret.txt", "should not be written\n");

        try {
            await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);
        } finally {
            fs.chmodSync(dir, 0o755);
        }

        expect(fs.readFileSync(path.join(dir, "secret.txt"), "utf8")).toBe("original\n");
    });

    it("still restores a checkpoint captured before the root was recorded", async () => {
        delete checkpoint.workspaceRoot;

        await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);

        expect(fs.readFileSync(at("Config.toml"), "utf8")).toBe(ORIGINAL_CONFIG);
    });

    it("refuses a snapshot path that leaves the workspace through a directory symlink", async () => {
        const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "checkpoint-outside-"));
        fs.writeFileSync(path.join(outsideDir, "secret.txt"), "not the checkpoint's business\n");
        fs.symlinkSync(outsideDir, at("linked"), "dir");
        // Listed, so the deletion pass leaves the link itself alone and the write is what gets tested.
        checkpoint.fileList.push("linked", "linked/secret.txt");
        await setStored(checkpoint, "linked/secret.txt", "written through a symlink\n");

        try {
            await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);
            expect(fs.readFileSync(path.join(outsideDir, "secret.txt"), "utf8"))
                .toBe("not the checkpoint's business\n");
        } finally {
            fs.rmSync(outsideDir, { recursive: true, force: true });
        }
    });

    it("refuses a snapshot path that resolves outside the workspace", async () => {
        const outside = path.join(path.dirname(root), "outside-the-workspace.txt");
        fs.writeFileSync(outside, "not the checkpoint's business\n");
        checkpoint.fileList.push("../outside-the-workspace.txt");
        await setStored(checkpoint, "../outside-the-workspace.txt", "written by a tampered checkpoint\n");

        try {
            await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);
            expect(fs.readFileSync(outside, "utf8")).toBe("not the checkpoint's business\n");
        } finally {
            fs.rmSync(outside, { force: true });
        }
    });
});
