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

const addToIntegration = jest.fn(async (root: string, changes: { filePath: string; content: string }[]) => {
    for (const change of changes) {
        fs.writeFileSync(path.join(root, change.filePath), change.content);
    }
});
jest.mock("../rpc-managers/ai-panel/utils", () => ({ addToIntegration }));
jest.mock("../rpc-managers/diagram-validity", () => ({ recordAiTouchedFile: jest.fn() }));
jest.mock("../features/ai/utils/project/ls-schema-notifications", () => ({ seedNewPackageBaseline: jest.fn() }));

import { workspace } from "./__mocks__/vscode";
import { createEditExecute, createMultiEditExecute, createReadExecute, createWriteExecute } from "../features/ai/agent/tools/text-editor";
import { ReadTracker } from "../features/ai/agent/tools/read-tracker";

const MAIN = "function main() {\n}\n";

let root: string;
let mainPath: string;
let reads: ReadTracker;
let callId = 0;

const call = () => ({ toolCallId: `call-${++callId}` });

function tools(tracker = reads) {
    const ctx = { workspacePath: root, projectPath: root } as never;
    return {
        edit: (old_string: string, new_string: string, file_path = "main.bal") =>
            createEditExecute(jest.fn(), root, [], new Set(), ctx, tracker)({ file_path, old_string, new_string }, call()),
        batch: (old_string: string, new_string: string) =>
            createMultiEditExecute(jest.fn(), root, [], new Set(), ctx, tracker)({ file_path: "main.bal", edits: [{ old_string, new_string }] }, call()),
        write: (file_path: string, content: string, overwrite = false) =>
            createWriteExecute(jest.fn(), root, [], new Set(), ctx, tracker)({ file_path, content, overwrite }, call()),
        read: (file_path = "main.bal", offset?: number, limit?: number) =>
            createReadExecute(jest.fn(), root, tracker)({ file_path, offset, limit }, call()),
    };
}

const toolResult = (toolCallId: string) => ({ role: "tool", content: [{ type: "tool-result", toolCallId, toolName: "file_read", output: { type: "json", value: {} } }] });

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "read-before-edit-"));
    mainPath = path.join(root, "main.bal");
    fs.writeFileSync(mainPath, MAIN);
    workspace.textDocuments = [];
    reads = new ReadTracker(root);
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

describe("read before edit", () => {
    it("refuses an edit of an unread file and leaves it unchanged, then allows it after a read", async () => {
        const refused = await tools().edit("main", "start");

        expect(refused).toMatchObject({ success: false, error: "Error: File has not been read" });
        expect(fs.readFileSync(mainPath, "utf8")).toBe(MAIN);

        await tools().read();
        expect(await tools().edit("main", "start")).toMatchObject({ success: true });
        expect(await tools().edit("start", "begin")).toMatchObject({ success: true });
    });

    it("refuses an edit of a file that changed since the read, until it is read again", async () => {
        await tools().read();
        fs.writeFileSync(mainPath, "function main() {\n    io:println(\"user\");\n}\n");

        expect(await tools().edit("main", "start")).toMatchObject({ success: false, error: "Error: File changed since it was read" });

        await tools().read();
        expect(await tools().edit("main", "start")).toMatchObject({ success: true });
        expect(fs.readFileSync(mainPath, "utf8")).toContain("io:println(\"user\")");
    });

    it("counts a ranged read, but not a read that failed", async () => {
        expect(await tools().read("main.bal", 5, 1)).toMatchObject({ success: false });
        expect(await tools().edit("main", "start")).toMatchObject({ success: false, error: "Error: File has not been read" });

        expect(await tools().read("main.bal", 1, 1)).toMatchObject({ success: true });
        expect(await tools().edit("main", "start")).toMatchObject({ success: true });
    });

    it("refuses a batch edit or an overwrite of an unread file", async () => {
        expect(await tools().batch("main", "start")).toMatchObject({ success: false, error: "Error: File has not been read" });
        expect(await tools().write("main.bal", "function other() {\n}\n", true)).toMatchObject({ success: false, error: "Error: File has not been read" });
        expect(fs.readFileSync(mainPath, "utf8")).toBe(MAIN);
    });

    it("needs no read for a new or an empty file, and counts the agent's own write as seen", async () => {
        expect(await tools().write("types.bal", "type Id int;\n")).toMatchObject({ success: true });
        expect(await tools().edit("int", "string", "types.bal")).toMatchObject({ success: true });

        fs.writeFileSync(path.join(root, "empty.bal"), "");
        expect(await tools().write("empty.bal", "type Name string;\n")).toMatchObject({ success: true });
    });

    it("does not check when nothing tracks reads", async () => {
        const ctx = { workspacePath: root, projectPath: root } as never;
        const edit = createEditExecute(jest.fn(), root, [], new Set(), ctx);

        expect(await edit({ file_path: "main.bal", old_string: "main", new_string: "start" }, call())).toMatchObject({ success: true });
    });

    it("records each read and write under its tool call id, with a project-relative path", async () => {
        await tools().read();
        await tools().write("types.bal", "type Id int;\n");

        expect(reads.seen.map(file => file.path)).toEqual(["main.bal", "types.bal"]);
        expect(new Set(reads.seen.map(file => file.toolCallId)).size).toBe(2);
    });
});

describe("ReadTracker.fromHistory", () => {
    async function seenIn(content: string) {
        fs.writeFileSync(mainPath, content);
        const tracker = new ReadTracker(root);
        await createReadExecute(jest.fn(), root, tracker)({ file_path: "main.bal" }, call());
        return tracker.seen[0];
    }

    it("counts a seen file only when its tool result is in the history", async () => {
        const sent = await seenIn(MAIN);
        const unsent = { ...sent, toolCallId: "never-saved", path: "other.bal" };
        fs.writeFileSync(path.join(root, "other.bal"), "x");

        const tracker = ReadTracker.fromHistory(root, [{ modelMessages: [toolResult(sent.toolCallId)], seenFiles: [sent, unsent] }]);

        expect(tracker.status(mainPath, MAIN)).toBe("fresh");
        expect(tracker.status(path.join(root, "other.bal"), "x")).toBe("unread");
    });

    it("takes the latest generation's view, so a file restored by a revert reads as stale", async () => {
        const before = await seenIn(MAIN);
        const after = await seenIn("function start() {\n}\n");

        const tracker = ReadTracker.fromHistory(root, [
            { modelMessages: [toolResult(before.toolCallId)], seenFiles: [before] },
            { modelMessages: [toolResult(after.toolCallId)], seenFiles: [after] },
        ]);

        expect(tracker.status(mainPath, "function start() {\n}\n")).toBe("fresh");
        expect(tracker.status(mainPath, MAIN)).toBe("stale");
    });

    it("ignores a generation stopped before its messages were saved, and generations left out of the history", async () => {
        const seen = await seenIn(MAIN);

        expect(ReadTracker.fromHistory(root, [{ modelMessages: [], seenFiles: [seen] }]).status(mainPath, MAIN)).toBe("unread");
        expect(ReadTracker.fromHistory(root, []).status(mainPath, MAIN)).toBe("unread");
    });

    it("forgets everything on a compaction restart", async () => {
        await tools().read();
        reads.reset();

        expect(reads.seen).toEqual([]);
        expect(await tools().edit("main", "start")).toMatchObject({ success: false, error: "Error: File has not been read" });
    });
});
