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

// A generation writes through `workspace.applyEdit`, which materialises a document per file and
// leaves the user staring at a tab per edited file. Closing those again is only safe while it
// stays surgical: the user's own tabs stay, and so does anything still holding unsaved content.

import type { Uri } from "vscode";
// The module jest maps `vscode` to, imported by path so its tabs and documents are typed as the
// mutable stubs they are rather than the read-only API.
import { TabInputText, window, workspace } from "./__mocks__/vscode";
import { closeTabsOpenedByEdit, openTabUris, saveEditedDocuments } from "../rpc-managers/ai-panel/edit-tabs";

const uri = (fsPath: string, scheme = "file") =>
    ({ fsPath, scheme, toString: () => `${scheme}://${fsPath}` }) as unknown as Uri;

function tabFor(fsPath: string) {
    return { input: new TabInputText(uri(fsPath)) };
}

function documentFor(fsPath: string, isDirty = false, scheme = "file") {
    return { uri: uri(fsPath, scheme), isDirty, save: jest.fn().mockResolvedValue(true) };
}

function setTabs(...fsPaths: string[]): void {
    window.tabGroups.all = [{ tabs: fsPaths.map(tabFor) }];
}

describe("edit tab cleanup", () => {
    let closed: unknown[];

    beforeEach(() => {
        closed = [];
        window.tabGroups.close = jest.fn((tab: unknown) => {
            closed.push(tab);
            return Promise.resolve(true);
        });
        workspace.textDocuments = [];
        setTabs();
    });

    it("closes a tab the edit opened", async () => {
        const before = openTabUris();
        setTabs("/ws/main.bal");
        workspace.textDocuments = [documentFor("/ws/main.bal")];

        await closeTabsOpenedByEdit([uri("/ws/main.bal")], before);

        expect(closed).toHaveLength(1);
    });

    it("leaves a tab the user already had open", async () => {
        setTabs("/ws/main.bal");
        const before = openTabUris();
        workspace.textDocuments = [documentFor("/ws/main.bal")];

        await closeTabsOpenedByEdit([uri("/ws/main.bal")], before);

        expect(closed).toHaveLength(0);
    });

    it("leaves tabs for files this edit never touched", async () => {
        const before = openTabUris();
        setTabs("/ws/other.bal");
        workspace.textDocuments = [documentFor("/ws/other.bal")];

        await closeTabsOpenedByEdit([uri("/ws/main.bal")], before);

        expect(closed).toHaveLength(0);
    });

    it("keeps a tab whose document is still unsaved", async () => {
        const before = openTabUris();
        setTabs("/ws/main.bal");
        workspace.textDocuments = [documentFor("/ws/main.bal", true)];

        await closeTabsOpenedByEdit([uri("/ws/main.bal")], before);

        expect(closed).toHaveLength(0);
    });

    it("keeps an unsaved tab even when a clean git: view shares the file's path", async () => {
        const before = openTabUris();
        setTabs("/ws/main.bal");
        workspace.textDocuments = [documentFor("/ws/main.bal", false, "git"), documentFor("/ws/main.bal", true)];

        await closeTabsOpenedByEdit([uri("/ws/main.bal")], before);

        expect(closed).toHaveLength(0);
    });
});

describe("saveEditedDocuments", () => {
    it("saves the edited files and nothing else the user left unsaved", async () => {
        const edited = documentFor("/ws/main.bal", true);
        const untouched = documentFor("/ws/notes.md", true);
        workspace.textDocuments = [edited, untouched];

        await saveEditedDocuments([uri("/ws/main.bal")]);

        expect(edited.save).toHaveBeenCalled();
        expect(untouched.save).not.toHaveBeenCalled();
    });

    it("saves the file itself, not a git: view that shares its path", async () => {
        const edited = documentFor("/ws/main.bal", true);
        workspace.textDocuments = [documentFor("/ws/main.bal", false, "git"), edited];

        await saveEditedDocuments([uri("/ws/main.bal")]);

        expect(edited.save).toHaveBeenCalled();
    });

    it("reports a save that failed and still saves the rest", async () => {
        const failing = documentFor("/ws/a.bal", true);
        failing.save.mockResolvedValue(false);
        const next = documentFor("/ws/b.bal", true);
        workspace.textDocuments = [failing, next];
        const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);

        await saveEditedDocuments([uri("/ws/a.bal"), uri("/ws/b.bal")]);

        expect(next.save).toHaveBeenCalled();
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
});
