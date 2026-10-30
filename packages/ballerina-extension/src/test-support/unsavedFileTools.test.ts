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
import { createEditExecute, createReadExecute, createWriteExecute } from "../features/ai/agent/tools/text-editor";

const SAVED = "function main() {\n}\n";
const TYPED = "function main() {\n}\n\nfunction validate() {\n}\n";

let root: string;
let mainPath: string;

function unsavedEditor(saves: boolean) {
    const document = {
        uri: { fsPath: mainPath, scheme: "file", toString: () => `file://${mainPath}` },
        isDirty: true,
        save: jest.fn(async () => {
            if (!saves) {
                return false;
            }
            fs.writeFileSync(mainPath, TYPED);
            document.isDirty = false;
            return true;
        }),
    };
    workspace.textDocuments = [document];
    return document;
}

function tools() {
    const ctx = { workspacePath: root, projectPath: root } as never;
    return {
        edit: createEditExecute(jest.fn(), root, [], new Set(), ctx),
        write: createWriteExecute(jest.fn(), root, [], new Set(), ctx),
        read: createReadExecute(jest.fn(), root),
    };
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "unsaved-tools-"));
    mainPath = path.join(root, "main.bal");
    fs.writeFileSync(mainPath, SAVED);
    workspace.textDocuments = [];
    addToIntegration.mockClear();
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

describe("file tools with unsaved editor changes", () => {
    it("edits on top of the user's unsaved text once it is saved", async () => {
        unsavedEditor(true);

        const result = await tools().edit({ file_path: "main.bal", old_string: "function validate() {\n}", new_string: "function validate() {\n    check run();\n}" });

        expect(result.success).toBe(true);
        expect(fs.readFileSync(mainPath, "utf8")).toContain("check run();");
        expect(fs.readFileSync(mainPath, "utf8")).toContain("function main()");
    });

    it("refuses to edit when the unsaved text cannot be saved", async () => {
        unsavedEditor(false);

        const result = await tools().edit({ file_path: "main.bal", old_string: "function main() {", new_string: "public function main() {" });

        expect(result.success).toBe(false);
        expect(result.message).toContain("unsaved changes");
        expect(addToIntegration).not.toHaveBeenCalled();
        expect(fs.readFileSync(mainPath, "utf8")).toBe(SAVED);
    });

    it("refuses to overwrite when the unsaved text cannot be saved", async () => {
        unsavedEditor(false);

        const result = await tools().write({ file_path: "main.bal", content: "function other() {\n}\n", overwrite: true });

        expect(result.success).toBe(false);
        expect(addToIntegration).not.toHaveBeenCalled();
    });

    it("checks the file the edit is written to when that differs from the one read", async () => {
        const copy = fs.mkdtempSync(path.join(os.tmpdir(), "unsaved-tools-copy-"));
        fs.writeFileSync(path.join(copy, "main.bal"), SAVED);
        const document = unsavedEditor(false);
        const ctx = { workspacePath: root, projectPath: root } as never;

        try {
            const result = await createWriteExecute(jest.fn(), copy, [], new Set(), ctx)(
                { file_path: "main.bal", content: "function other() {\n}\n", overwrite: true }
            );

            expect(document.save).toHaveBeenCalled();
            expect(result.success).toBe(false);
            expect(addToIntegration).not.toHaveBeenCalled();
        } finally {
            fs.rmSync(copy, { recursive: true, force: true });
        }
    });

    it("reads the user's text once it is saved", async () => {
        unsavedEditor(true);

        const result = await tools().read({ file_path: "main.bal" });

        expect(result.message).toContain("function validate()");
    });

    it("tells the agent when the editor holds text it cannot see", async () => {
        unsavedEditor(false);

        const result = await tools().read({ file_path: "main.bal" });

        expect(result.success).toBe(true);
        expect(result.message).toContain("unsaved changes");
        expect(result.message).not.toContain("function validate()");
    });
});
