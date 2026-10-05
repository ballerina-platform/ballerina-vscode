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

// A restore refuses a checkpoint captured in a different workspace by comparing the root recorded
// on it. The whole point is the stale checkpoint that outlives a reload, so the root has to survive
// the trip to disk and back — drop it there and every reloaded checkpoint silently becomes
// restorable anywhere again.

const storedThreads = new Map<string, unknown>();
const storedCheckpoints = new Map<string, unknown>();
let storedMetadata: unknown;

/** Serializes the way the real store does, so anything it cannot carry is lost here too. */
const roundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value));

jest.mock("@wso2/copilot-utilities/chat-persistence", () => ({
    CopilotPersistenceStore: class {
        saveThread(root: string, threadId: string, thread: unknown) {
            storedThreads.set(`${root}::${threadId}`, roundTrip(thread));
            return true;
        }
        loadThread(root: string, threadId: string) { return storedThreads.get(`${root}::${threadId}`); }
        listThreadIds(root: string) {
            return [...storedThreads.keys()]
                .filter(key => key.startsWith(`${root}::`))
                .map(key => key.slice(root.length + 2));
        }
        getWorkspaceMetadata() { return storedMetadata; }
        saveWorkspaceMetadata(_root: string, meta: unknown) { storedMetadata = meta; return true; }
        getWorkspaceDir() { return "/tmp/does-not-matter"; }
        async saveCheckpointAsync(root: string, threadId: string, generationId: string, checkpoint: unknown) {
            storedCheckpoints.set(`${root}::${threadId}::${generationId}`, roundTrip(checkpoint));
            return true;
        }
        listCheckpoints(root: string, threadId: string) {
            return [...storedCheckpoints.keys()]
                .filter(key => key.startsWith(`${root}::${threadId}::`))
                .map(key => key.split("::")[2]);
        }
        loadCheckpoint(root: string, threadId: string, generationId: string) {
            return storedCheckpoints.get(`${root}::${threadId}::${generationId}`);
        }
        deleteCheckpoint() { return true; }
        deleteThread() { return true; }
        deleteWorkspace() { return true; }
    },
}));
jest.mock("../features/ai/state/ApprovalManager", () => ({
    approvalManager: { cancelAllPending: jest.fn() },
}));
jest.mock("../features/ai/utils/project/temp-project", () => ({
    cleanupTempProject: jest.fn(),
    getReviewBaselinePath: (p: string) => `${p}-review-baseline`,
}));

import type { Checkpoint } from "@wso2/ballerina-core/lib/state-machine-types";
import { ChatStateStorage } from "../views/ai-panel/chatStateStorage";

const WORKSPACE = "/ws/orders";
const THREAD = "default";

function checkpointFor(generationId: string): Checkpoint {
    return {
        id: `cp-${generationId}`,
        messageId: generationId,
        timestamp: 1,
        fileList: ["main.bal"],
        workspaceSnapshot: { "main.bal": "// before\n" },
        snapshotSize: 10,
        workspaceRoot: WORKSPACE,
    };
}

describe("the capture root survives persistence", () => {
    beforeEach(() => {
        storedThreads.clear();
        storedCheckpoints.clear();
        storedMetadata = undefined;
    });

    it("comes back on a checkpoint loaded in a later session", async () => {
        const writing = new ChatStateStorage();
        const { id: generationId } = writing.addGeneration(WORKSPACE, THREAD, "add a service", {});
        await writing.addCheckpointToGeneration(WORKSPACE, THREAD, generationId, checkpointFor(generationId));

        // A fresh instance reads what the first one wrote, as a reopened window does.
        const reading = new ChatStateStorage();
        const thread = reading.getOrCreateThread(WORKSPACE, THREAD);
        const reloaded = thread.generations.find(g => g.id === generationId);

        expect(reloaded?.checkpoint?.workspaceRoot).toBe(WORKSPACE);
        expect(reloaded?.checkpoint?.fileList).toEqual(["main.bal"]);
    });
});
