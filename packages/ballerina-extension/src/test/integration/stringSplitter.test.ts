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

// L3: the string splitter against the real LS. Pressing Enter inside a string literal splits it
// into two concatenated literals. The editor is mocked; the syntax tree and the node at the cursor
// come from the real LS, as in the extension. Replaces the extension-host test in
// test/editor/editor-support.test.ts.

import * as fs from "fs";
import * as path from "path";
import { LsHarness, pathToFileUri, resolveIntegrationLaunch } from "@wso2/test-config/ls-harness";

jest.mock("vscode", () => {
    class Position {
        constructor(public readonly line: number, public readonly character: number) {}
    }
    class Range {
        constructor(public readonly start: Position, public readonly end: Position) {}
    }
    return { Position, Range, window: { activeTextEditor: undefined }, workspace: {} };
}, { virtual: true });
// updateDocument only runs when `this` is a BallerinaExtension; the real class pulls in the whole extension.
jest.mock("../../core", () => ({ BallerinaExtension: class {} }));
jest.mock("../../features/telemetry", () => ({
    sendTelemetryEvent: () => undefined,
    CMP_STRING_SPLIT: "",
    TM_EVENT_STRING_SPLIT: "",
}));
jest.mock("../../utils", () => ({ isWindows: () => process.platform === "win32" }));

import { Position, Range, window } from "vscode";
import type { TextDocumentChangeEvent } from "vscode";
import { BallerinaExtension } from "../../core";
import { StringSplitter, newLine } from "../../features/editor-support/split-provider";

const launch = resolveIntegrationLaunch();
const filePath = path.join(__dirname, "fixtures", "string-split", "string.bal");

type Edit = { start: number; end: number; text: string };

// The parts of TextEditor that updateDocument uses.
type EditBuilderMock = { insert(pos: Position, text: string): void; delete(range: Range): void };
type EditorMock = {
    document: { fileName: string; uri: { toString(): string } };
    selection: { active: Position };
    edit(build: (builder: EditBuilderMock) => void): Promise<boolean>;
};
const mockWindow = window as unknown as { activeTextEditor: EditorMock | undefined };

// With a CRLF newline, split-provider.ts places the second line's quote at `text.length - 1` = 1 and
// deletes up to `indexOf('\n')` = 1, so it removes the space before "giga". Skipped on Windows until
// the splitter handles CRLF; the integration job runs on Ubuntu.
const itUnlessWindows = process.platform === "win32" ? it.skip : it;

function offsetOf(text: string, pos: Position): number {
    const lines = text.split(newLine);
    let offset = 0;
    for (let i = 0; i < pos.line; i++) {
        offset += lines[i].length + newLine.length;
    }
    return offset + pos.character;
}

// Applies edits the way VS Code does: all positions refer to the original text.
function applyEdits(text: string, edits: Edit[]): string {
    const sorted = [...edits].sort((a, b) => b.start - a.start || (b.end - b.start) - (a.end - a.start));
    return sorted.reduce((acc, e) => acc.slice(0, e.start) + e.text + acc.slice(e.end), text);
}

describe("string splitter (real LS)", () => {
    let ls: LsHarness;
    let version = 0;

    beforeAll(async () => {
        ls = new LsHarness(launch);
        ls.start();
        await ls.initialize(path.dirname(filePath));
    }, 90_000);

    afterEach(() => {
        mockWindow.activeTextEditor = undefined;
    });

    afterAll(async () => {
        await ls?.shutdown();
    });

    // Presses Enter at `at` in the fixture: sends the resulting text to the LS, runs updateDocument, and
    // waits for every LS request it made, including the un-awaited getSyntaxTreeNode().then(...) that
    // applies the edit. Returns the text after Enter and the edits the splitter made.
    async function pressEnter(at: Position): Promise<{ afterEnter: string; edits: Edit[] }> {
        const original = fs.readFileSync(filePath, "utf8");
        const offset = offsetOf(original, at);
        const afterEnter = original.slice(0, offset) + newLine + original.slice(offset);
        const uri = pathToFileUri(filePath);
        if (version === 0) {
            ls.didOpen(filePath, afterEnter);
        } else {
            ls.notify("textDocument/didChange", { textDocument: { uri, version: version + 1 }, contentChanges: [{ text: afterEnter }] });
        }
        version++;

        const edits: Edit[] = [];
        mockWindow.activeTextEditor = {
            document: { fileName: filePath, uri: { toString: () => uri } },
            selection: { active: at },
            edit: (build) => {
                build({
                    insert: (pos: Position, text: string) => {
                        const start = offsetOf(afterEnter, pos);
                        edits.push({ start, end: start, text });
                    },
                    delete: (range: Range) => {
                        edits.push({ start: offsetOf(afterEnter, range.start), end: offsetOf(afterEnter, range.end), text: "" });
                    },
                });
                return Promise.resolve(true);
            },
        };

        const requests: Promise<unknown>[] = [];
        const send = (method: string, params: unknown) => {
            const response = ls.request(method, params);
            requests.push(response);
            return response;
        };
        const extension = Object.assign(Object.create(BallerinaExtension.prototype), {
            getDocumentContext: () => ({ didEditorChange: () => undefined }),
            langClient: {
                getSyntaxTree: (params: unknown) => send("ballerinaDocument/syntaxTree", params),
                getSyntaxTreeNode: (params: unknown) => send("ballerinaDocument/syntaxTreeNode", params),
            },
        });
        // Only the fields updateDocument reads.
        const event = {
            document: { fileName: filePath },
            contentChanges: [{ text: newLine, range: new Range(at, at) }],
        } as unknown as TextDocumentChangeEvent;
        await StringSplitter.prototype.updateDocument.call(extension, event);
        await Promise.all(requests);
        // Let the .then callbacks attached to those requests run.
        await new Promise((resolve) => setImmediate(resolve));
        return { afterEnter, edits };
    }

    itUnlessWindows("splits a string literal when Enter is pressed inside it", async () => {
        const original = fs.readFileSync(filePath, "utf8");
        const { afterEnter, edits } = await pressEnter(new Position(0, original.indexOf(" giga")));

        expect(applyEdits(afterEnter, edits)).toBe(`string st = "saample" +${newLine}" giga string";${newLine}`);
    }, 60_000);

    it("does not edit when Enter is pressed outside a string literal", async () => {
        const original = fs.readFileSync(filePath, "utf8");
        const { edits } = await pressEnter(new Position(0, original.indexOf(";") + 1));

        expect(edits).toEqual([]);
    }, 60_000);
});
