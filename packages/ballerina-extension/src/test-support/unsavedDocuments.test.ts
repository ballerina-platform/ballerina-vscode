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

import { workspace } from "./__mocks__/vscode";
import { saveIfUnsaved, saveUnsavedDocuments } from "../features/ai/utils/project/unsaved-documents";

type MockDocument = (typeof workspace.textDocuments)[number] & { save: jest.Mock };

function documentFor(fsPath: string, { isDirty = true, scheme = "file", saves = true } = {}): MockDocument {
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
        workspace.textDocuments = [];
    });

    it("saves only unsaved files inside the project", async () => {
        const inside = documentFor("/ws/main.bal");
        const nested = documentFor("/ws/modules/db/db.bal");
        const clean = documentFor("/ws/types.bal", { isDirty: false });
        const sibling = documentFor("/ws-other/main.bal");
        const untitled = documentFor("/ws/Untitled-1", { scheme: "untitled" });
        const gitView = documentFor("/ws/main.bal", { scheme: "git" });
        workspace.textDocuments = [inside, nested, clean, sibling, untitled, gitView];

        expect(await saveUnsavedDocuments("/ws")).toEqual([]);

        expect(inside.save).toHaveBeenCalled();
        expect(nested.save).toHaveBeenCalled();
        for (const skipped of [clean, sibling, untitled, gitView]) {
            expect(skipped.save).not.toHaveBeenCalled();
        }
    });

    it("returns the files that could not be saved", async () => {
        workspace.textDocuments = [documentFor("/ws/main.bal", { saves: false }), documentFor("/ws/types.bal")];

        expect(await saveUnsavedDocuments("/ws")).toEqual(["/ws/main.bal"]);
    });

    it("treats a document saved in the meantime as saved", async () => {
        const document = documentFor("/ws/main.bal");
        document.save.mockImplementation(async () => {
            document.isDirty = false;
            return false;
        });
        workspace.textDocuments = [document];

        expect(await saveUnsavedDocuments("/ws")).toEqual([]);
    });

    it("treats a save that throws as not saved", async () => {
        const document = documentFor("/ws/main.bal");
        document.save.mockRejectedValue(new Error("disk full"));
        workspace.textDocuments = [document, documentFor("/ws/types.bal")];

        expect(await saveUnsavedDocuments("/ws")).toEqual(["/ws/main.bal"]);
    });
});

describe("saveIfUnsaved", () => {
    beforeEach(() => {
        workspace.textDocuments = [];
    });

    it("is true for a file that is not open", async () => {
        expect(await saveIfUnsaved("/ws/main.bal")).toBe(true);
    });

    it("is true for an open file without unsaved changes", async () => {
        const document = documentFor("/ws/main.bal", { isDirty: false });
        workspace.textDocuments = [document];

        expect(await saveIfUnsaved("/ws/main.bal")).toBe(true);
        expect(document.save).not.toHaveBeenCalled();
    });

    it("saves the matching file only", async () => {
        const target = documentFor("/ws/main.bal");
        const other = documentFor("/ws/types.bal");
        workspace.textDocuments = [documentFor("/ws/main.bal", { scheme: "git" }), other, target];

        expect(await saveIfUnsaved("/ws/main.bal")).toBe(true);
        expect(target.save).toHaveBeenCalled();
        expect(other.save).not.toHaveBeenCalled();
    });

    it("is false when the file stays unsaved", async () => {
        workspace.textDocuments = [documentFor("/ws/main.bal", { saves: false })];

        expect(await saveIfUnsaved("/ws/main.bal")).toBe(false);
    });
});
