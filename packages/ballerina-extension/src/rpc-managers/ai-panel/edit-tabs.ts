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

import { TabInputText, Uri, window, workspace } from 'vscode';

/**
 * Keeping a live workspace edit out of the user's tab bar.
 *
 * The agent writes `.bal` files through `workspace.applyEdit`, which is what keeps open editors,
 * the diagrams and the Language Server's `file://` view in step — nothing else notifies the LS,
 * since the language client registers no file watcher. The cost is that VS Code materialises a
 * document for every file the edit touches and surfaces one the user never opened as a tab, so a
 * generation writing twenty files buries the editor in twenty tabs.
 */

function textTabs(): { tab: unknown; uri: Uri }[] {
    return window.tabGroups.all
        .flatMap((group) => group.tabs)
        .filter((tab) => tab.input instanceof TabInputText)
        .map((tab) => ({ tab, uri: (tab.input as TabInputText).uri }));
}

function documentFor(uri: Uri) {
    return workspace.textDocuments.find((document) => document.uri.fsPath === uri.fsPath);
}

/** Every file currently shown in a tab, so an edit can tell which tabs are its own doing. */
export function openTabUris(): Set<string> {
    return new Set(textTabs().map(({ uri }) => uri.toString()));
}

/** Saves what this edit touched; `workspace.saveAll` would also flush the user's own unsaved work. */
export async function saveEditedDocuments(uris: Uri[]): Promise<void> {
    for (const uri of uris) {
        const document = documentFor(uri);
        if (document?.isDirty) {
            await document.save();
        }
    }
}

/** Closes the tabs this edit opened, leaving anything that was already on screen alone. */
export async function closeTabsOpenedByEdit(uris: Uri[], tabsBeforeEdit: Set<string>): Promise<void> {
    const edited = new Set(uris.map((uri) => uri.toString()));
    for (const { tab, uri } of textTabs()) {
        if (!edited.has(uri.toString()) || tabsBeforeEdit.has(uri.toString())) {
            continue;
        }
        // A document that would not save still holds the only copy of the edit.
        if (documentFor(uri)?.isDirty) {
            continue;
        }
        try {
            await window.tabGroups.close(tab as never, true);
        } catch (error) {
            console.error(`[EditTabs] Failed to close the tab opened for ${uri.fsPath}:`, error);
        }
    }
}
