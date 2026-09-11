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

import { captureWorkspaceSnapshot, restoreWorkspaceSnapshot } from "../views/ai-panel/checkpoint/checkpointUtils";

const ORIGINAL_CONFIG = 'greeting = "before the generation"\n';
/** PNG magic bytes plus sequences no UTF-8 decoder can round-trip. */
const RAW_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0x80]);
const ORIGINAL_BAL = "// before the generation\n";

/** Lets the restore's promise chain run to its next timer-bound step under fake timers. */
async function settle(): Promise<void> {
    for (let i = 0; i < 50; i++) {
        await Promise.resolve();
    }
}

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

describe("checkpoint restore outcome vs. the artifact-update notification", () => {
    let root: string;
    let checkpoint: Checkpoint;

    beforeEach(() => {
        artifactLocationUpdates.length = 0;
        resetArtifactSubscribers();
        dataMapper.context = {};
        dataMapper.refresh = () => Promise.resolve();
        workspace.textDocuments = [];
        root = fs.mkdtempSync(path.join(os.tmpdir(), "checkpoint-restore-"));
        fs.writeFileSync(path.join(root, "main.bal"), "// the generation's edit\n");
        fs.writeFileSync(path.join(root, "Config.toml"), 'greeting = "the generation\'s edit"\n');
        fs.writeFileSync(path.join(root, "extra.txt"), "added by the generation\n");

        checkpoint = {
            id: "cp-1",
            messageId: "msg-1",
            timestamp: 0,
            fileList: ["main.bal", "Config.toml"],
            workspaceSnapshot: { "main.bal": ORIGINAL_BAL, "Config.toml": ORIGINAL_CONFIG },
            snapshotSize: ORIGINAL_BAL.length + ORIGINAL_CONFIG.length,
        };

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
    });

    it("reports the restore as successful when no artifact update ever arrives", async () => {
        const restore = restoreWorkspaceSnapshot(checkpoint);
        await settle();
        await jest.advanceTimersByTimeAsync(10_000);

        await expect(restore).resolves.toBe(true);
        expect(fs.readFileSync(path.join(root, "Config.toml"), "utf8")).toBe(ORIGINAL_CONFIG);
        expect(fs.existsSync(path.join(root, "extra.txt"))).toBe(false);
    });

    it("does not miss an artifact update published while the edits are being applied", async () => {
        // The Language Server can answer the edit before the restore gets back to its own wait.
        workspace.applyEdit = () => {
            publishArtifactsUpdated();
            return Promise.resolve(true);
        };

        let settledWithoutTimeout = false;
        const restore = restoreWorkspaceSnapshot(checkpoint).then(result => {
            settledWithoutTimeout = true;
            return result;
        });
        await settle();

        expect(settledWithoutTimeout).toBe(true);
        await expect(restore).resolves.toBe(true);
        expect(artifactLocationUpdates).toEqual([{ artifacts: [{ id: "svc" }] }]);
    });

    it("forwards the artifacts to the visualizer when the update arrives after the edits", async () => {
        const restore = restoreWorkspaceSnapshot(checkpoint);
        await settle();
        publishArtifactsUpdated();
        await settle();

        await expect(restore).resolves.toBe(true);
        expect(artifactLocationUpdates).toEqual([{ artifacts: [{ id: "svc" }] }]);
    });

    it("reports failure when the workspace edit itself does not apply, and stops listening", async () => {
        workspace.applyEdit = () => Promise.resolve(false);

        const restore = restoreWorkspaceSnapshot(checkpoint);
        await settle();

        await expect(restore).resolves.toBe(false);

        publishArtifactsUpdated();
        await jest.advanceTimersByTimeAsync(10_000);
        expect(artifactLocationUpdates).toEqual([]);
    });
});

describe("what a checkpoint restore is allowed to touch", () => {
    let root: string;
    let checkpoint: Checkpoint;
    let applied: { op: string; uri: { fsPath: string }; content?: string }[];
    let warnings: string[];

    const at = (name: string) => path.join(root, name);

    beforeEach(() => {
        artifactLocationUpdates.length = 0;
        resetArtifactSubscribers();
        dataMapper.context = {};
        dataMapper.refresh = () => Promise.resolve();
        workspace.textDocuments = [];
        applied = [];
        warnings = [];

        root = fs.mkdtempSync(path.join(os.tmpdir(), "checkpoint-touch-"));
        fs.writeFileSync(at("main.bal"), "// the generation's edit\n");
        fs.writeFileSync(at("Config.toml"), 'greeting = "the generation\'s edit"\n');

        checkpoint = {
            id: "cp-1",
            messageId: "msg-1",
            timestamp: 0,
            fileList: ["main.bal", "Config.toml"],
            workspaceSnapshot: { "main.bal": ORIGINAL_BAL, "Config.toml": ORIGINAL_CONFIG },
            snapshotSize: 0,
        };

        workspace.workspaceFolders = [{ uri: Uri.file(root) }];
        workspace.findFiles = () =>
            Promise.resolve(fs.readdirSync(root).map(name => Uri.file(at(name))));
        workspace.applyEdit = (edit: unknown) => {
            applied.push(...(edit as { entries: typeof applied }).entries);
            return Promise.resolve(true);
        };
        workspace.saveAll = () => Promise.resolve(true);
        window.showWarningMessage = (message: string) => {
            warnings.push(message);
            return Promise.resolve(undefined);
        };
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it("captures a non-text file into the file list but not into the snapshot", async () => {
        fs.writeFileSync(at("logo.png"), RAW_BYTES);

        const captured: any = await captureWorkspaceSnapshot("msg-1");

        // In the file list so a restore never deletes it; out of the snapshot so a restore never
        // writes a lossy decode over it.
        expect(captured.fileList).toContain("logo.png");
        expect(Object.keys(captured.workspaceSnapshot)).not.toContain("logo.png");
        expect(captured.workspaceSnapshot["Config.toml"]).toBeDefined();
    });

    it("leaves a non-text file alone without reporting it, when the snapshot never held it", async () => {
        fs.writeFileSync(at("logo.png"), RAW_BYTES);
        checkpoint.fileList.push("logo.png");

        await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);

        expect(fs.readFileSync(at("logo.png")).equals(RAW_BYTES)).toBe(true);
        expect(warnings).toEqual([]);
    });

    it("never recreates a file from a lossy snapshot entry left by an older checkpoint", async () => {
        // The generation deleted the image, so a restore would have to write it back — and the only
        // content an older checkpoint has for it is the mangled decode.
        checkpoint.fileList.push("logo.png");
        checkpoint.workspaceSnapshot["logo.png"] = RAW_BYTES.toString("utf8");

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

    it("still rewrites a file whose unsaved editor differs from what is on disk", async () => {
        fs.writeFileSync(at("main.bal"), ORIGINAL_BAL);
        workspace.textDocuments = [{
            uri: Uri.file(at("main.bal")),
            isDirty: true,
            save: () => Promise.resolve(true),
            getText: () => "// half-typed edit the user has not saved\n",
        }];

        await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);

        expect(applied.filter(e => e.op === "replace").map(e => e.content)).toContain(ORIGINAL_BAL);
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
    it("refuses a snapshot path that resolves outside the workspace", async () => {
        const outside = path.join(path.dirname(root), "outside-the-workspace.txt");
        fs.writeFileSync(outside, "not the checkpoint's business\n");
        checkpoint.fileList.push("../outside-the-workspace.txt");
        checkpoint.workspaceSnapshot["../outside-the-workspace.txt"] = "written by a tampered checkpoint\n";

        try {
            await expect(restoreWorkspaceSnapshot(checkpoint, true)).resolves.toBe(true);
            expect(fs.readFileSync(outside, "utf8")).toBe("not the checkpoint's business\n");
        } finally {
            fs.rmSync(outside, { force: true });
        }
    });
});
