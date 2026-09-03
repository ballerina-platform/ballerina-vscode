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

import { commands, Position, TextDocument, Uri, window, workspace, WorkspaceEdit } from "vscode";
import * as fs from 'fs';

// Emitted by AddToConfigTomlCodeAction on the language server side when the project has no Config.toml yet.
const CREATE_CONFIG_TOML_COMMAND = "create.config.toml";

function activateCreateConfigTomlCommand() {
    // register the create Config.toml code action command handler
    commands.registerCommand(CREATE_CONFIG_TOML_COMMAND, async (configTomlPath: string, content: string) => {
        try {
            // The arguments arrive through command execution, so they are unchecked at runtime.
            if (typeof configTomlPath !== 'string' || !configTomlPath || typeof content !== 'string') {
                window.showErrorMessage(
                    `${CREATE_CONFIG_TOML_COMMAND} expects a non-empty configTomlPath string and a content string.`);
                return;
            }

            const uri: Uri = Uri.file(configTomlPath);
            const edit = new WorkspaceEdit();

            if (fs.existsSync(configTomlPath)) {
                // The file appeared after the code action was computed. Append instead of prepending so the
                // existing entries are not pushed below the generated ones.
                const existing: TextDocument = await workspace.openTextDocument(uri);
                const endOfFile = existing.lineAt(existing.lineCount - 1).range.end;
                const prefix = existing.getText().endsWith('\n') || existing.getText().length === 0 ? '' : '\n';
                edit.insert(uri, endOfFile, `${prefix}${content}`);
            } else {
                edit.createFile(uri, { overwrite: false, ignoreIfExists: true });
                edit.insert(uri, new Position(0, 0), content);
            }

            if (!await workspace.applyEdit(edit)) {
                window.showErrorMessage(`Failed to update ${configTomlPath}.`);
                return;
            }

            const document: TextDocument = await workspace.openTextDocument(uri);
            // save() also resolves false for an already-clean document, so only treat it as a
            // failure while there are still unpersisted changes.
            if (!await document.save() && document.isDirty) {
                window.showErrorMessage(`Failed to save ${configTomlPath}.`);
                return;
            }
            await window.showTextDocument(document, { preview: false });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error occurred.";
            window.showErrorMessage(`Failed to create Config.toml: ${message}`);
        }
    });
}

export { activateCreateConfigTomlCommand };
