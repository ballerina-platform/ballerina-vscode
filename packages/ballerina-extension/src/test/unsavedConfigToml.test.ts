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

jest.mock("@wso2/ballerina-core", () => ({}));
const requestConfiguration = jest.fn();
jest.mock("../features/ai/state/ApprovalManager", () => ({ approvalManager: { requestConfiguration } }));
jest.mock("../features/ai/activator", () => ({
    langClient: {
        getConfigVariablesV2: async () => ({
            configVariables: {
                "myorg/mypkg": { "": [{ properties: { variable: { value: "apiKey" }, type: { value: "string" } } }] },
            },
        }),
    },
}));
jest.mock("../BalExtensionContext", () => ({ extension: {} }));
jest.mock("../rpc-managers/platform-ext/managed-connections", () => ({ getManagedLibraries: jest.fn() }));

import { workspace } from "./__mocks__/vscode";
import { ConfigCollectorTool } from "../features/ai/agent/tools/config-collector";

const CONFIG = '[myorg.mypkg]\napiKey = "old"\ntimeout = 5\n';

let root: string;
let configPath: string;

function unsavedConfigEditor(saves: boolean) {
    const document = {
        uri: { fsPath: configPath, scheme: "file", toString: () => `file://${configPath}` },
        isDirty: true,
        save: jest.fn(async () => {
            if (saves) {
                fs.writeFileSync(configPath, `${CONFIG}extra = 1\n`);
            }
            document.isDirty = !saves;
            return saves;
        }),
    };
    workspace.textDocuments = [document];
    return document;
}

const remove = (name: string) => ConfigCollectorTool(
    { mode: "remove", variableNames: [name] } as never,
    jest.fn(),
    { tempPath: root, workspacePath: root }
);

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "unsaved-config-"));
    fs.writeFileSync(path.join(root, "Ballerina.toml"), '[package]\norg = "myorg"\nname = "mypkg"\nversion = "0.1.0"\n');
    configPath = path.join(root, "Config.toml");
    fs.writeFileSync(configPath, CONFIG);
    workspace.textDocuments = [];
    requestConfiguration.mockReset();
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

describe("config collector with an unsaved Config.toml", () => {
    it("removes a key that only exists in the unsaved editor text", async () => {
        unsavedConfigEditor(true);

        const result = await remove("extra");

        expect(result.success).toBe(true);
        expect(fs.readFileSync(configPath, "utf8")).toBe(CONFIG);
    });

    it("refuses to rewrite Config.toml when it cannot be saved", async () => {
        unsavedConfigEditor(false);

        const result = await remove("timeout");

        expect(result.success).toBe(false);
        expect(result.message).toContain("unsaved changes");
        expect(fs.readFileSync(configPath, "utf8")).toBe(CONFIG);
    });

    it("refuses before opening the form when Config.toml cannot be saved", async () => {
        unsavedConfigEditor(false);

        const result = await ConfigCollectorTool(
            { mode: "collect", variables: [{ name: "apiKey", description: "" }] } as never,
            jest.fn(),
            { tempPath: root, workspacePath: root }
        );

        expect(result.success).toBe(false);
        expect(result.message).toContain("unsaved changes");
        expect(requestConfiguration).not.toHaveBeenCalled();
    });

    it("refuses to report Config.toml status when it cannot be saved", async () => {
        unsavedConfigEditor(false);

        const result = await ConfigCollectorTool(
            { mode: "check" } as never,
            jest.fn(),
            { tempPath: root, workspacePath: root }
        );

        expect(result.success).toBe(false);
        expect(result.message).toContain("unsaved changes");
    });
});
