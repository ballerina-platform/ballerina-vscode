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

// Reference L4 test: drives a real headless Ballerina LS (no VSCode) against a
// small .bal fixture project. See docs/TEST_BACKLOG.md L4-01/L4-02.
// Skips automatically when no Ballerina distribution is available.

import * as fs from "fs";
import * as path from "path";
import { LsHarness, resolveBalCommand, pathToFileUri } from "@wso2/test-config/ls-harness";

const bal = resolveBalCommand();
const projectRoot = path.join(__dirname, "fixtures", "hello");
const mainBal = path.join(projectRoot, "main.bal");

if (!bal) {
    // eslint-disable-next-line no-console
    console.warn("[ls-integration] No Ballerina distribution found (set BALLERINA_HOME); skipping LS tests.");
}

const describeLs = bal ? describe : describe.skip;

describeLs("Ballerina LS integration (headless)", () => {
    let ls: LsHarness;

    beforeAll(async () => {
        ls = new LsHarness(bal!);
        ls.start();
        const init = await ls.initialize(projectRoot);
        expect(init.capabilities).toBeDefined();
        ls.didOpen(mainBal, fs.readFileSync(mainBal, "utf8"));
    }, 90_000);

    afterAll(async () => {
        await ls?.shutdown();
    });

    it("returns document symbols including the main function", async () => {
        const symbols: Array<{ name: string }> = await ls.request("textDocument/documentSymbol", {
            textDocument: { uri: pathToFileUri(mainBal) },
        });
        expect(Array.isArray(symbols)).toBe(true);
        expect(symbols.map((s) => s.name)).toContain("main");
    }, 60_000);
});
