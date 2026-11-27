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

// L3: completion in Config.toml against the real LS. The completion lists each required configurable
// that the file does not set yet, with a value to insert; the config schema comes from the real LS.
// The editor is mocked.
//
// The fixture has no dependencies. A dependency with its own configurables, such as ballerina/http,
// makes the completion fail when the LS lists that org first. Add one back once that is fixed:
// https://github.com/wso2/product-integrator/issues/3080

import * as fs from "fs";
import * as path from "path";
import { LsHarness, resolveIntegrationLaunch } from "@wso2/test-config/ls-harness";

const PROJECT = path.join(__dirname, "fixtures", "config-toml");

jest.mock("vscode", () => ({
    CompletionItemKind: { Field: 4 },
    Uri: { file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` }) },
    window: { activeTextEditor: {} },
}), { virtual: true });
// The logger opens an output channel when it loads.
jest.mock("../../utils/logger", () => ({ debug: () => undefined }));
// project-utils loads the extension's state; the completion only needs the current package's name.
jest.mock("../../utils/project-utils", () => ({
    getCurrentBallerinaProject: () => Promise.resolve({ packageName: "configServiceProject" }),
}));

import type { BallerinaExtension } from "../../core";
import type { Position, TextDocument } from "vscode";
import { getConfigCompletions } from "../../features/config-generator/utils";

const launch = resolveIntegrationLaunch();

describe("Config.toml completion (real LS)", () => {
    let ls: LsHarness;

    beforeAll(async () => {
        ls = new LsHarness(launch);
        ls.start();
        await ls.initialize(PROJECT);
        const main = path.join(PROJECT, "main.bal");
        ls.didOpen(main, fs.readFileSync(main, "utf8"));
    }, 120_000);

    afterAll(async () => {
        await ls?.shutdown();
    });

    async function complete(toml: string) {
        const lines = toml.split("\n");
        const document = {
            fileName: path.join(PROJECT, "Config.toml"),
            getText: () => toml,
            lineAt: (line: number) => ({ text: lines[line] }),
        } as unknown as TextDocument;
        const extension = {
            getDocumentContext: () => ({ setCurrentProject: () => undefined }),
            langClient: {
                getBallerinaProjectConfigSchema: (params: unknown) => ls.request("ballerinaPackage/configSchema", params),
            },
        } as unknown as BallerinaExtension;
        const position = { line: lines.length - 1, character: 0 } as Position;
        // The extension passes the project root when a project is open (configRun.ts). With the
        // Config.toml path instead, the LS returns no schema:
        // https://github.com/wso2/product-integrator/issues/3080
        return getConfigCompletions(extension, PROJECT, document, position);
    }

    it("offers every required configurable for an empty Config.toml, and none with a default", async () => {
        const suggestions = await complete("");
        // foo has a default value, so it is not offered.
        expect(suggestions.map((s) => s.label).sort()).toEqual(["authConfig", "isAdmin", "url"]);
    }, 60_000);

    it("offers only the required configurables that Config.toml does not set yet", async () => {
        const suggestions = await complete(['url = ""', "[authConfig]", 'token = "x"', ""].join("\n"));
        expect(suggestions).toEqual([
            { label: "isAdmin", insertText: "isAdmin = false\t# Type of BOOLEAN", kind: 4 },
        ]);
    }, 60_000);

    it("offers the members of a union configurable on the line after its table header", async () => {
        const suggestions = await complete(['url = ""', "isAdmin = true", "[authConfig]", ""].join("\n"));
        expect(suggestions.map((s) => s.label)).toEqual([
            "wso2/configServiceProject:0.0.1:Credentials",
            "wso2/configServiceProject:0.0.1:Token",
        ]);
    }, 60_000);
});
