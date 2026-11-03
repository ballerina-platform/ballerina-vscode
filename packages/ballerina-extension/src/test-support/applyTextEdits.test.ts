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

/**
 * Inserts at the same position must keep the order given: for an empty main.bal the service
 * generator returns the import and then the service, both at (0,0).
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// The barrel pulls in an ESM-only websocket transport; nothing from it is needed here.
jest.mock("@wso2/ballerina-core", () => ({}));
jest.mock("../stateMachine", () => ({ StateMachine: { context: () => ({}) } }));
jest.mock("../rpc-managers/ai-panel/utils", () => ({ addToIntegration: jest.fn() }));

import { applyTextEdits } from "../features/ai/agent/utils";

const at = (line: number, character: number) => ({ line, character });
const insert = (line: number, character: number, newText: string) =>
    ({ range: { start: at(line, character), end: at(line, character) }, newText });

let dir: string;
const fileWith = (content: string) => {
    const file = path.join(dir, "main.bal");
    fs.writeFileSync(file, content);
    return file;
};

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "apply-edits-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("applyTextEdits", () => {
    it("keeps the given order for inserts at the same position", async () => {
        const result = await applyTextEdits(fileWith(""), [
            insert(0, 0, "import ballerina/http;\n"),
            insert(0, 0, "service on new http:Listener(9090) {}\n"),
        ]);
        expect(result).toBe("import ballerina/http;\nservice on new http:Listener(9090) {}\n");
    });

    it("keeps that order for three inserts at the same position", async () => {
        const result = await applyTextEdits(fileWith("x"), [insert(0, 0, "a"), insert(0, 0, "b"), insert(0, 0, "c")]);
        expect(result).toBe("abcx");
    });

    it("applies edits at different positions regardless of their order", async () => {
        const result = await applyTextEdits(fileWith("one\ntwo\n"), [
            insert(1, 0, "B-"),
            insert(0, 0, "A-"),
        ]);
        expect(result).toBe("A-one\nB-two\n");
    });

    it("replaces a range", async () => {
        const result = await applyTextEdits(fileWith("hello world"),
            [{ range: { start: at(0, 6), end: at(0, 11) }, newText: "there" }]);
        expect(result).toBe("hello there");
    });
});
