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
const createServiceAndListener = jest.fn();
const didClose = jest.fn();
jest.mock("../features/ai/activator", () => ({
    langClient: {
        openApiGenerateClient,
        createServiceAndListener,
        didClose,
        getServiceInitModel: async () => ({ serviceInitModel: {} }),
    },
}));
jest.mock("../features/ai/agent/tools/openapi-service-model", () => ({
    ...jest.requireActual("../features/ai/agent/tools/openapi-service-model"),
    selectOpenApiDesign: (model: unknown) => model,
}));
jest.mock("../features/ai/state/ApprovalManager", () => ({ approvalManager: {} }));
jest.mock("../rpc-managers/diagram-validity", () => ({ recordAiTouchedFile: jest.fn() }));
jest.mock("../utils/modification", () => ({
    writeBallerinaFileDidOpen: async (filePath: string, content: string) => fs.writeFileSync(filePath, content),
}));
const addToIntegration = jest.fn(async (root: string, changes: { filePath: string; content: string; deleted?: boolean }[]) => {
    for (const change of changes) {
        if (change.deleted) {
            fs.rmSync(path.join(root, change.filePath), { force: true });
        } else {
            fs.writeFileSync(path.join(root, change.filePath), change.content);
        }
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
let specPath: string;
let modifiedFiles: string[];

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

const generate = (mode: "client" | "service" = "client") => ConnectorGeneratorTool(
    { serviceName: "Orders", specContent: SPEC, mode } as never,
    jest.fn(),
    root,
    "project",
    modifiedFiles
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
    specPath = path.join(root, "resources", "specs", "orders.yaml");
    modifiedFiles = [];
    workspace.textDocuments = [];
    openApiGenerateClient.mockReset();
    createServiceAndListener.mockReset();
    didClose.mockClear();
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

    it("refuses before writing anything when a file it will edit can't be saved", async () => {
        unsavedEditor(path.join(root, "Ballerina.toml"), "", false);

        const result = await generate();

        expect(result.success).toBe(false);
        expect(JSON.stringify(result)).toContain("Ballerina.toml");
        expect(openApiGenerateClient).not.toHaveBeenCalled();
        expect(fs.existsSync(specPath)).toBe(false);
        expect(modifiedFiles).toEqual([]);
    });

    it("goes ahead when only an unrelated file can't be saved", async () => {
        const typesPath = path.join(root, "types.bal");
        fs.writeFileSync(typesPath, "");
        unsavedEditor(typesPath, "", false);
        openApiGenerateClient.mockResolvedValue(editsFor(mainPath));

        const result = await generate();

        expect(result.success).toBe(true);
    });

    it("removes the spec it wrote when a file it edits gets unsaved changes while the edits are computed", async () => {
        openApiGenerateClient.mockImplementation(async () => {
            unsavedEditor();
            return editsFor(mainPath);
        });

        const result = await generate();

        expect(result.success).toBe(false);
        expect(addToIntegration).not.toHaveBeenCalled();
        expect(fs.readFileSync(mainPath, "utf8")).toBe(SAVED);
        expect(fs.existsSync(specPath)).toBe(false);
        expect(modifiedFiles).toEqual([]);
    });

    it("puts back the spec it replaced when it is refused after the edits are computed", async () => {
        fs.mkdirSync(path.dirname(specPath), { recursive: true });
        fs.writeFileSync(specPath, "openapi: 3.0.3\n");
        const earlier = path.relative(root, specPath);
        modifiedFiles.push(earlier);
        openApiGenerateClient.mockImplementation(async () => {
            unsavedEditor();
            return editsFor(mainPath);
        });

        const result = await generate();

        expect(result.success).toBe(false);
        expect(fs.readFileSync(specPath, "utf8")).toBe("openapi: 3.0.3\n");
        expect(modifiedFiles).toEqual([earlier]);
    });

    it("removes the main.bal it created when the service is refused after the edits are computed", async () => {
        fs.rmSync(mainPath);
        const typesPath = path.join(root, "types.bal");
        fs.writeFileSync(typesPath, "");
        createServiceAndListener.mockImplementation(async () => {
            unsavedEditor(typesPath, "type T record {};\n");
            return { textEdits: { ...editsFor(mainPath).source.textEditsMap, ...editsFor(typesPath).source.textEditsMap } };
        });

        const result = await generate("service");

        expect(result.success).toBe(false);
        expect(fs.existsSync(mainPath)).toBe(false);
        expect(didClose).toHaveBeenCalledWith({ textDocument: { uri: mainPath } });
        expect(fs.existsSync(specPath)).toBe(false);
    });

    it("keeps the main.bal it created once the user has typed in it", async () => {
        fs.rmSync(mainPath);
        createServiceAndListener.mockImplementation(async () => {
            unsavedEditor(mainPath, "\n");
            return { textEdits: editsFor(mainPath).source.textEditsMap };
        });

        const result = await generate("service");

        expect(result.success).toBe(false);
        expect(fs.existsSync(mainPath)).toBe(true);
        expect(didClose).not.toHaveBeenCalled();
    });
});
