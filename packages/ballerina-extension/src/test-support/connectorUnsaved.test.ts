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
jest.mock("../stateMachine", () => ({ StateMachine: {} }));
jest.mock("../BalExtensionContext", () => ({ extension: {} }));
const openApiGenerateClient = jest.fn();
jest.mock("../features/ai/activator", () => ({ langClient: { openApiGenerateClient } }));
jest.mock("../features/ai/state/ApprovalManager", () => ({ approvalManager: {} }));
jest.mock("../rpc-managers/diagram-validity", () => ({ recordAiTouchedFile: jest.fn() }));
jest.mock("../utils/modification", () => ({ writeBallerinaFileDidOpen: jest.fn() }));
const addToIntegration = jest.fn(async (root: string, changes: { filePath: string; content: string }[]) => {
    for (const change of changes) {
        fs.writeFileSync(path.join(root, change.filePath), change.content);
    }
});
jest.mock("../rpc-managers/ai-panel/utils", () => ({ addToIntegration }));

import { workspace } from "./__mocks__/vscode";
import { ConnectorGeneratorTool } from "../features/ai/agent/tools/connector-generator";

const SPEC = "openapi: 3.0.3\ninfo:\n  title: Orders\n  version: 1.0.0\npaths:\n  /orders:\n    get:\n      responses:\n        '200':\n          description: OK\n";
const SAVED = "function main() {\n}\n";
const TYPED = "function main() {\n}\n\nfunction validate() {\n}\n";
const IMPORT = "import orders;\n";

let root: string;
let mainPath: string;

function unsavedEditor(filePath = mainPath, typed = TYPED, saves = true) {
    const document = {
        uri: { fsPath: filePath, scheme: "file", toString: () => `file://${filePath}` },
        isDirty: true,
        save: jest.fn(async () => {
            if (!saves) {
                return false;
            }
            fs.writeFileSync(filePath, typed);
            document.isDirty = false;
            return true;
        }),
    };
    workspace.textDocuments = [document];
    return document;
}

const generate = () => ConnectorGeneratorTool(
    { serviceName: "Orders", specContent: SPEC } as never,
    jest.fn(),
    root,
    "project"
);

const editsFor = (filePath: string) => ({
    source: {
        textEditsMap: {
            [filePath]: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: IMPORT }],
        },
    },
});

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "unsaved-connector-"));
    fs.writeFileSync(path.join(root, "Ballerina.toml"), '[package]\norg = "myorg"\nname = "project"\nversion = "0.1.0"\n');
    mainPath = path.join(root, "main.bal");
    fs.writeFileSync(mainPath, SAVED);
    workspace.textDocuments = [];
    openApiGenerateClient.mockReset();
    addToIntegration.mockClear();
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

describe("connector generator with unsaved editor changes", () => {
    it("saves before the language server computes its edits", async () => {
        unsavedEditor();
        let diskWhenAsked = "";
        openApiGenerateClient.mockImplementation(async () => {
            diskWhenAsked = fs.readFileSync(mainPath, "utf8");
            return editsFor(mainPath);
        });

        const result = await generate();

        expect(diskWhenAsked).toBe(TYPED);
        expect(result.success).toBe(true);
        expect(fs.readFileSync(mainPath, "utf8")).toBe(IMPORT + TYPED);
    });

    it("generates from the submitted spec when the spec file has unsaved changes", async () => {
        const specPath = path.join(root, "resources", "specs", "orders.yaml");
        fs.mkdirSync(path.dirname(specPath), { recursive: true });
        fs.writeFileSync(specPath, "openapi: 3.0.3\n");
        unsavedEditor(specPath, "openapi: 3.0.3\ninfo:\n  title: Old\n");
        let specWhenAsked = "";
        openApiGenerateClient.mockImplementation(async () => {
            specWhenAsked = fs.readFileSync(specPath, "utf8");
            return editsFor(mainPath);
        });

        const result = await generate();

        expect(result.success).toBe(true);
        expect(specWhenAsked).toBe(SPEC);
    });

    it("refuses to replace a spec file whose unsaved changes cannot be saved", async () => {
        const specPath = path.join(root, "resources", "specs", "orders.yaml");
        fs.mkdirSync(path.dirname(specPath), { recursive: true });
        fs.writeFileSync(specPath, "openapi: 3.0.3\n");
        unsavedEditor(specPath, "", false);

        const result = await generate();

        expect(result.success).toBe(false);
        expect(openApiGenerateClient).not.toHaveBeenCalled();
        expect(fs.readFileSync(specPath, "utf8")).toBe("openapi: 3.0.3\n");
    });

    it("refuses when a file it edits gets unsaved changes while the edits are computed", async () => {
        openApiGenerateClient.mockImplementation(async () => {
            unsavedEditor();
            return editsFor(mainPath);
        });

        const result = await generate();

        expect(result.success).toBe(false);
        expect(addToIntegration).not.toHaveBeenCalled();
        expect(fs.readFileSync(mainPath, "utf8")).toBe(SAVED);
    });
});
