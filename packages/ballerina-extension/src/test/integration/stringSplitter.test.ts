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

    beforeAll(async () => {
        ls = new LsHarness(launch);
        ls.start();
        await ls.initialize(path.dirname(filePath));
    }, 90_000);

    afterAll(async () => {
        await ls?.shutdown();
    });

    it("splits a string literal when Enter is pressed inside it", async () => {
        const original = fs.readFileSync(filePath, "utf8");
        const enterAt = new Position(0, original.indexOf(" giga"));
        // The document as the LS sees it right after Enter.
        const afterEnter = original.slice(0, enterAt.character) + newLine + original.slice(enterAt.character);
        ls.didOpen(filePath, afterEnter);

        const uri = pathToFileUri(filePath);
        const edits: Edit[] = [];
        const edited = new Promise<void>((resolve) => {
            (window as any).activeTextEditor = {
                document: { fileName: filePath, uri: { toString: () => uri } },
                selection: { active: enterAt },
                edit: (build: (b: unknown) => void) => {
                    build({
                        insert: (pos: Position, text: string) => {
                            const at = offsetOf(afterEnter, pos);
                            edits.push({ start: at, end: at, text });
                        },
                        delete: (range: Range) => {
                            edits.push({ start: offsetOf(afterEnter, range.start), end: offsetOf(afterEnter, range.end), text: "" });
                        },
                    });
                    resolve();
                    return Promise.resolve(true);
                },
            };
        });

        const extension = Object.assign(Object.create(BallerinaExtension.prototype), {
            getDocumentContext: () => ({ didEditorChange: () => undefined }),
            langClient: {
                getSyntaxTree: (params: unknown) => ls.request("ballerinaDocument/syntaxTree", params),
                getSyntaxTreeNode: (params: unknown) => ls.request("ballerinaDocument/syntaxTreeNode", params),
            },
        });
        // Only the fields updateDocument reads.
        const event = {
            document: { fileName: filePath },
            contentChanges: [{ text: newLine, range: new Range(enterAt, enterAt) }],
        } as unknown as TextDocumentChangeEvent;
        await StringSplitter.prototype.updateDocument.call(extension, event);
        let timer: NodeJS.Timeout;
        await Promise.race([
            edited,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error("The splitter made no edit")), 30_000);
            }),
        ]).finally(() => clearTimeout(timer));

        expect(applyEdits(afterEnter, edits)).toBe(`string st = "saample" +${newLine}" giga string";${newLine}`);
    }, 60_000);
});
