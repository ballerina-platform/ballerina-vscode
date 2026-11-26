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
// The editor is mocked. Replaces ui-test/configGeneratorSuggestion.test.ts.

import * as fs from "fs";
import * as path from "path";
import { LsHarness, resolveIntegrationLaunch } from "@wso2/test-config/ls-harness";

const PROJECT = path.join(__dirname, "fixtures", "config-toml");

jest.mock("vscode", () => ({
    CompletionItemKind: { Field: 4 },
    Uri: { file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` }) },
    window: { activeTextEditor: {} },
}), { virtual: true });
// configGenerator.ts imports the extension's views and state; the completion uses none of them.
jest.mock("../../core", () => ({ BallerinaExtension: class {} }));
jest.mock("../../features/project", () => ({}));
jest.mock("../../utils/modification", () => ({}));
jest.mock("../../features/editor-support/activator", () => ({}));
jest.mock("../../stateMachine", () => ({}));
jest.mock("../../features/tracing", () => ({}));
jest.mock("../../views/visualizer/webview", () => ({}));
jest.mock("../../utils/command-utils", () => ({}));
jest.mock("../../features/ai/utils", () => ({}));
jest.mock("../../utils/logger", () => ({ debug: () => undefined }));
jest.mock("@wso2/ballerina-core", () => ({ EVENT_TYPE: {}, MACHINE_VIEW: {}, isSamePath: () => false }));
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
        const service = path.join(PROJECT, "service.bal");
        ls.didOpen(service, fs.readFileSync(service, "utf8"));
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
        return getConfigCompletions(extension, path.join(PROJECT, "service.bal"), document, position);
    }

    it("offers every required configurable for an empty Config.toml, including a module's", async () => {
        const suggestions = await complete("");
        expect(suggestions.map((s) => s.label).sort()).toEqual(["authConfig", "bar", "isAdmin", "url"]);
    }, 60_000);

    it("offers only the required configurables that Config.toml does not set yet", async () => {
        const suggestions = await complete(["bar = 0.0", 'url = ""', "[authConfig]", ""].join("\n"));
        expect(suggestions).toEqual([
            { label: "isAdmin", insertText: "isAdmin = false\t# Type of BOOLEAN", kind: 4 },
        ]);
    }, 60_000);
});
