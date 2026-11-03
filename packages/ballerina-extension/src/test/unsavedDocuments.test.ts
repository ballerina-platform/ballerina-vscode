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
import { workspace } from "./__mocks__/vscode";
import { hasUnsavedChanges, saveIfUnsaved, saveUnsavedDocuments } from "../features/ai/utils/project/unsaved-documents";

type MockDocument = (typeof workspace.textDocuments)[number] & { save: jest.Mock };

let ws: string;
const at = (relative: string) => path.join(ws, relative);

function documentFor(fsPath: string, { isDirty = true, scheme = "file", saves = true, onDisk = true } = {}): MockDocument {
    if (onDisk) {
        fs.mkdirSync(path.dirname(fsPath), { recursive: true });
        fs.writeFileSync(fsPath, "");
    }
    const document = {
        uri: { fsPath, scheme, toString: () => `${scheme}://${fsPath}` },
        isDirty,
        save: jest.fn(async () => {
            if (!saves) {
                return false;
            }
            document.isDirty = false;
            return true;
        }),
    };
    return document;
}

describe("saveUnsavedDocuments", () => {
    beforeEach(() => {
        ws = fs.mkdtempSync(path.join(os.tmpdir(), "unsaved-docs-"));
        workspace.textDocuments = [];
    });

    afterEach(() => {
        fs.rmSync(ws, { recursive: true, force: true });
        fs.rmSync(`${ws}-other`, { recursive: true, force: true });
    });

    it("saves only unsaved files inside the project", async () => {
        const inside = documentFor(at("main.bal"));
        const nested = documentFor(at("modules/db/db.bal"));
        const clean = documentFor(at("types.bal"), { isDirty: false });
        const sibling = documentFor(path.join(path.dirname(ws), `${path.basename(ws)}-other`, "main.bal"));
        const untitled = documentFor(at("Untitled-1"), { scheme: "untitled" });
        const gitView = documentFor(at("main.bal"), { scheme: "git" });
        workspace.textDocuments = [inside, nested, clean, sibling, untitled, gitView];

        expect(await saveUnsavedDocuments(ws)).toEqual([]);

        expect(inside.save).toHaveBeenCalled();
        expect(nested.save).toHaveBeenCalled();
        for (const skipped of [clean, sibling, untitled, gitView]) {
            expect(skipped.save).not.toHaveBeenCalled();
        }
    });

    it("returns the files that could not be saved", async () => {
        workspace.textDocuments = [documentFor(at("main.bal"), { saves: false }), documentFor(at("types.bal"))];

        expect(await saveUnsavedDocuments(ws)).toEqual([at("main.bal")]);
    });

    it("treats a document saved in the meantime as saved", async () => {
        const document = documentFor(at("main.bal"));
        document.save.mockImplementation(async () => {
            document.isDirty = false;
            return false;
        });
        workspace.textDocuments = [document];

        expect(await saveUnsavedDocuments(ws)).toEqual([]);
    });

    it("leaves a tab whose file was deleted, so saving doesn't bring the file back", async () => {
        const deleted = documentFor(at("foo.bal"), { onDisk: false });
        workspace.textDocuments = [deleted];

        expect(await saveUnsavedDocuments(ws)).toEqual([]);
        expect(deleted.save).not.toHaveBeenCalled();
        expect(fs.existsSync(at("foo.bal"))).toBe(false);
    });

    it("treats a save that throws as not saved", async () => {
        const document = documentFor(at("main.bal"));
        document.save.mockRejectedValue(new Error("disk full"));
        workspace.textDocuments = [document, documentFor(at("types.bal"))];

        expect(await saveUnsavedDocuments(ws)).toEqual([at("main.bal")]);
    });
});

describe("saveIfUnsaved", () => {
    beforeEach(() => {
        ws = fs.mkdtempSync(path.join(os.tmpdir(), "unsaved-docs-"));
        workspace.textDocuments = [];
    });

    afterEach(() => {
        fs.rmSync(ws, { recursive: true, force: true });
        fs.rmSync(`${ws}-other`, { recursive: true, force: true });
    });

    it("is true for a file that is not open", async () => {
        expect(await saveIfUnsaved(at("main.bal"))).toBe(true);
    });

    it("is true for an open file without unsaved changes", async () => {
        const document = documentFor(at("main.bal"), { isDirty: false });
        workspace.textDocuments = [document];

        expect(await saveIfUnsaved(at("main.bal"))).toBe(true);
        expect(document.save).not.toHaveBeenCalled();
    });

    it("saves the matching file only", async () => {
        const target = documentFor(at("main.bal"));
        const other = documentFor(at("types.bal"));
        workspace.textDocuments = [documentFor(at("main.bal"), { scheme: "git" }), other, target];

        expect(await saveIfUnsaved(at("main.bal"))).toBe(true);
        expect(target.save).toHaveBeenCalled();
        expect(other.save).not.toHaveBeenCalled();
    });

    it("ignores a tab whose file was deleted", async () => {
        const deleted = documentFor(at("foo.bal"), { onDisk: false });
        workspace.textDocuments = [deleted];

        expect(hasUnsavedChanges(at("foo.bal"))).toBe(false);
        expect(await saveIfUnsaved(at("foo.bal"))).toBe(true);
        expect(deleted.save).not.toHaveBeenCalled();
    });

    it("is false when the file stays unsaved", async () => {
        workspace.textDocuments = [documentFor(at("main.bal"), { saves: false })];

        expect(await saveIfUnsaved(at("main.bal"))).toBe(false);
    });
});
