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

import { UndoRedoManager } from "../utils/undo-redo-manager";

// Applies the edits the manager asks for to an in-memory workspace, as the visualizer RPC manager does.
class Workspace {
    readonly files = new Map<string, string>();
    readonly manager = new UndoRedoManager();

    edit(changes: Record<string, string>, description?: string) {
        this.manager.startBatchOperation();
        for (const [path, after] of Object.entries(changes)) {
            this.manager.addFileToBatch(path, this.files.get(path) ?? "", after);
            this.files.set(path, after);
        }
        this.manager.commitBatchOperation(description);
    }

    undo(count = 1) {
        this.manager.undo(count)?.forEach((content, path) => this.files.set(path, content));
    }

    redo(count = 1) {
        this.manager.redo(count)?.forEach((content, path) => this.files.set(path, content));
    }

    snapshot() {
        return Object.fromEntries(this.files);
    }
}

describe("UndoRedoManager", () => {
    let ws: Workspace;
    beforeEach(() => {
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        ws = new Workspace();
        ws.files.set("main.bal", "m0");
        ws.files.set("agents.bal", "a0");
    });
    afterEach(() => jest.restoreAllMocks());

    it("undoes and redoes single steps in order", () => {
        ws.edit({ "main.bal": "m1" });
        ws.edit({ "main.bal": "m2" });
        ws.undo();
        expect(ws.snapshot()).toEqual({ "main.bal": "m1", "agents.bal": "a0" });
        ws.undo();
        expect(ws.snapshot()).toEqual({ "main.bal": "m0", "agents.bal": "a0" });
        ws.redo();
        expect(ws.snapshot()).toEqual({ "main.bal": "m1", "agents.bal": "a0" });
        ws.redo();
        expect(ws.snapshot()).toEqual({ "main.bal": "m2", "agents.bal": "a0" });
    });

    it("undoes several steps that touched different files", () => {
        ws.edit({ "main.bal": "m1" });
        ws.edit({ "agents.bal": "a1" });
        ws.edit({ "main.bal": "m2" });
        ws.undo(3);
        expect(ws.snapshot()).toEqual({ "main.bal": "m0", "agents.bal": "a0" });
    });

    it("redoes the oldest undone step first after a multi-step undo", () => {
        ws.edit({ "main.bal": "m1" });
        ws.edit({ "agents.bal": "a1" });
        ws.edit({ "main.bal": "m2" });
        ws.undo(3);
        ws.redo();
        expect(ws.snapshot()).toEqual({ "main.bal": "m1", "agents.bal": "a0" });
        ws.redo();
        expect(ws.snapshot()).toEqual({ "main.bal": "m1", "agents.bal": "a1" });
        ws.redo();
        expect(ws.snapshot()).toEqual({ "main.bal": "m2", "agents.bal": "a1" });
    });

    it("redoes several steps at once and undoes the newest first afterwards", () => {
        ws.edit({ "main.bal": "m1" });
        ws.edit({ "agents.bal": "a1" });
        ws.edit({ "main.bal": "m2" });
        ws.undo(3);
        ws.redo(3);
        expect(ws.snapshot()).toEqual({ "main.bal": "m2", "agents.bal": "a1" });
        ws.undo();
        expect(ws.snapshot()).toEqual({ "main.bal": "m1", "agents.bal": "a1" });
        ws.undo();
        expect(ws.snapshot()).toEqual({ "main.bal": "m1", "agents.bal": "a0" });
    });

    it("merges every commit inside a group into one undo step", () => {
        ws.manager.beginGroup();
        ws.edit({ "agents.bal": "a1" }, "Change in agent");
        ws.edit({ "main.bal": "m1" }, "Delete function");
        ws.edit({ "agents.bal": "a2" }, "Fix imports");
        ws.manager.endGroup("Tool Deletion - search");

        expect(ws.manager.getNextUndoDescription()).toBe("Tool Deletion - search");
        ws.undo();
        expect(ws.snapshot()).toEqual({ "main.bal": "m0", "agents.bal": "a0" });
        expect(ws.manager.canUndo()).toBe(false);
        ws.redo();
        expect(ws.snapshot()).toEqual({ "main.bal": "m1", "agents.bal": "a2" });
    });

    it("keeps commits outside a group as separate steps", () => {
        ws.edit({ "main.bal": "m1" });
        ws.manager.beginGroup();
        ws.edit({ "agents.bal": "a1" });
        ws.edit({ "main.bal": "m2" });
        ws.manager.endGroup();
        ws.edit({ "main.bal": "m3" });

        ws.undo();
        expect(ws.snapshot()).toEqual({ "main.bal": "m2", "agents.bal": "a1" });
        ws.undo();
        expect(ws.snapshot()).toEqual({ "main.bal": "m1", "agents.bal": "a0" });
        ws.undo();
        expect(ws.snapshot()).toEqual({ "main.bal": "m0", "agents.bal": "a0" });
    });

    it("starts a new step when the group's entry is no longer on top", () => {
        ws.manager.beginGroup();
        ws.edit({ "main.bal": "m1" });
        ws.undo();
        ws.edit({ "agents.bal": "a1" });
        ws.manager.endGroup();

        ws.undo();
        expect(ws.snapshot()).toEqual({ "main.bal": "m0", "agents.bal": "a0" });
        expect(ws.manager.canUndo()).toBe(false);
    });
});
