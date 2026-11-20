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

import { Uri, workspace } from "vscode";
import { StateMachine } from "../../stateMachine";
import { closeFormCopy as closeCountedCopy, openFormCopy as openCountedCopy, setFormCopyHost } from "./form-state";

// The language server's side of a form's expr:// copy. When a copy is opened and closed is decided
// in form-state, which is kept free of the editor and the language client so that it can be tested.

const exprUri = (filePath: string): string => Uri.file(filePath).with({ scheme: "expr" }).toString();

setFormCopyHost({
    async open(filePath: string): Promise<void> {
        let languageId = "ballerina";
        let version = 1;
        let text = "";
        try {
            const textDocument = await workspace.openTextDocument(Uri.file(filePath));
            languageId = textDocument.languageId;
            version = textDocument.version;
            text = textDocument.getText();
        } catch (error) {
            // The copy is still opened: the language server makes it from the package it has
            // loaded, not from this text (a form can be on a file that is yet to be written).
            console.error(`Error reading ${filePath} for its expr:// copy`, error);
        }
        await StateMachine.langClient().didOpen({
            textDocument: { uri: exprUri(filePath), languageId, version, text }
        });
    },
    async close(filePath: string): Promise<void> {
        await StateMachine.langClient().didClose({ textDocument: { uri: exprUri(filePath) } });
    }
});

// A form's open and close reach the extension as notifications, which nothing waits on: a failure
// is said here, and the form stays counted on its copy until it asks for its close.

export function openFormCopy(filePath: string): Promise<void> {
    return openCountedCopy(filePath).catch((error) => {
        console.error(`Error opening the expr:// copy of ${filePath}`, error);
    });
}

export function closeFormCopy(filePath: string): Promise<void> {
    return closeCountedCopy(filePath).catch((error) => {
        console.error(`Error closing the expr:// copy of ${filePath}`, error);
    });
}
