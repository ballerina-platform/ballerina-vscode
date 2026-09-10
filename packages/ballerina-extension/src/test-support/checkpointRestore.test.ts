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
// boolean, and a stale history against reverted files is what wso2/product-integrator#2406 reports.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Checkpoint } from "@wso2/ballerina-core/lib/state-machine-types";
// The module jest maps `vscode` to, imported by path so the stubs tests reassign stay mutable.
import { Uri, workspace } from "./__mocks__/vscode";
import { ArtifactNotificationHandler, ArtifactsUpdated } from "../utils/project-artifacts-handler";

const artifactLocationUpdates: unknown[] = [];

jest.mock("../rpc-managers/visualizer/rpc-manager", () => ({
    VisualizerRpcManager: class {
        updateCurrentArtifactLocation(params: unknown) {
            artifactLocationUpdates.push(params);
        }
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
    suppressWebviewNotifications: () => () => {},
}));

import { restoreWorkspaceSnapshot } from "../views/ai-panel/checkpoint/checkpointUtils";

const ORIGINAL_CONFIG = 'greeting = "before the generation"\n';
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
