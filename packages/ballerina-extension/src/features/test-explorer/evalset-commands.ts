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

import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { EvalSet, EvalThread, EvalsetTrace } from '@wso2/ballerina-core';
import { ensureEvalsetsDirectory, validateEvalsetName, validateThreadName } from './evalset-utils';

export async function createNewEvalset(): Promise<void> {
    try {
        // 1. Ensure evalsets directory exists
        const evalsetsDir = await ensureEvalsetsDirectory();
        if (!evalsetsDir) { return; } // User cancelled project selection

        // 2. Prompt for name
        const name = await vscode.window.showInputBox({
            prompt: 'Enter evalset name',
            placeHolder: 'my-evalset',
            validateInput: (value) => validateEvalsetName(value, evalsetsDir)
        });

        if (!name) { return; } // User cancelled

        // 3. Create EvalSet with empty threads array
        const evalset: EvalSet = {
            id: crypto.randomUUID(),
            name: name,
            threads: [],
            created_on: new Date().toISOString()
        };

        // 4. Write file
        const filePath = path.join(evalsetsDir, `${name}.evalset.json`);
        const jsonContent = JSON.stringify(evalset, null, 2);
        const fileUri = vscode.Uri.file(filePath);

        await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(jsonContent));

        // 5. Success message with Open option
        void vscode.window.showInformationMessage(
            `Evalset created: ${name}.evalset.json`,
            'Open'
        ).then((action) => {
            if (action === 'Open') {
                return vscode.commands.executeCommand('ballerina.openEvalsetViewer', fileUri);
            }
            return undefined;
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to create evalset: ${errorMessage}`);
    }
}

export async function createNewThread(evalsetFileNode?: any, autoRefresh?: boolean): Promise<void> {
    try {
        // Validate that this was called from tree view with proper node
        if (!evalsetFileNode || !evalsetFileNode.uri) {
            vscode.window.showErrorMessage('Please use the + button next to an evalset in the tree view');
            return;
        }

        const filePath = evalsetFileNode.uri.fsPath;

        // 1. Read existing evalset file
        const fileContent = await fs.promises.readFile(filePath, 'utf8');
        let evalset: EvalSet;

        try {
            evalset = JSON.parse(fileContent);
        } catch (parseError) {
            vscode.window.showErrorMessage('Failed to parse evalset file: Invalid JSON');
            return;
        }

        // 2. Validate evalset structure
        if (!evalset.threads || !Array.isArray(evalset.threads)) {
            vscode.window.showErrorMessage('Invalid evalset file: missing threads array');
            return;
        }

        // 3. Prompt for thread name
        const threadCount = evalset.threads.length;
        const defaultName = `Thread ${threadCount + 1}`;

        const threadName = await vscode.window.showInputBox({
            prompt: 'Enter thread name',
            placeHolder: defaultName,
            value: defaultName,
            validateInput: (value) => validateThreadName(value)
        });

        if (!threadName) { return; } // User cancelled

        // 4. Create default trace with empty message turn
        const now = new Date().toISOString();
        const defaultTrace: EvalsetTrace = {
            id: crypto.randomUUID(),
            userMessage: {
                role: 'user',
                content: 'User message'
            },
            iterations: [],
            output: {
                role: 'assistant',
                content: 'Agent response'
            },
            tools: [],
            startTime: now,
            endTime: now
        };

        // 5. Create new thread with default trace
        const newThread: EvalThread = {
            id: threadName,
            description: '',
            traces: [defaultTrace],
            created_on: new Date().toISOString()
        };

        // 6. Add to evalset and write file
        evalset.threads.push(newThread);
        const jsonContent = JSON.stringify(evalset, null, 2);
        const fileUri = vscode.Uri.file(filePath);

        await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(jsonContent));

        // 7. Handle UI refresh based on where the command was called from
        if (autoRefresh) {
            // Called from evalset viewer - refresh immediately to show new thread in list
            vscode.commands.executeCommand('ballerina.openEvalsetViewer', fileUri);

            // Show non-blocking notification
            vscode.window.showInformationMessage(
                `Thread "${threadName}" added to evalset`,
                'Open'
            ).then((action) => {
                if (action === 'Open') {
                    vscode.commands.executeCommand('ballerina.openEvalsetViewer', fileUri, newThread.id);
                }
            });
        } else {
            // Called from tree view - use original behavior with blocking notification
            const action = await vscode.window.showInformationMessage(
                `Thread "${threadName}" added to evalset`,
                'Open'
            );

            if (action === 'Open') {
                vscode.commands.executeCommand('ballerina.openEvalsetViewer', fileUri, newThread.id);
            }
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to create thread: ${errorMessage}`);
    }
}

export async function deleteEvalset(evalsetFileNode?: any): Promise<void> {
    try {
        // Validate that this was called from tree view with proper node
        if (!evalsetFileNode || !evalsetFileNode.uri) {
            vscode.window.showErrorMessage('Please use the delete button on an evalset in the tree view');
            return;
        }

        const filePath = evalsetFileNode.uri.fsPath;
        const fileName = path.basename(filePath);

        // Confirm deletion
        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to delete "${fileName}"? This action cannot be undone.`,
            { modal: true },
            'Delete'
        );

        if (confirmation !== 'Delete') {
            return; // User cancelled
        }

        // Delete the file
        await vscode.workspace.fs.delete(evalsetFileNode.uri);

        vscode.window.showInformationMessage(`Evalset "${fileName}" deleted successfully`);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to delete evalset: ${errorMessage}`);
    }
}

export async function deleteThread(threadNode?: any, autoRefresh?: boolean): Promise<void> {
    try {
        // Validate that this was called from tree view with proper node
        if (!threadNode || !threadNode.parentUri || !threadNode.threadId) {
            vscode.window.showErrorMessage('Please use the delete button on a thread in the tree view');
            return;
        }

        const filePath = threadNode.parentUri.fsPath;
        const threadId = threadNode.threadId;

        // Read existing evalset file
        const fileContent = await fs.promises.readFile(filePath, 'utf8');
        let evalset: EvalSet;

        try {
            evalset = JSON.parse(fileContent);
        } catch (parseError) {
            vscode.window.showErrorMessage('Failed to parse evalset file: Invalid JSON');
            return;
        }

        // Find the thread to get its name for confirmation
        const threadToDelete = evalset.threads.find(t => t.id === threadId);
        if (!threadToDelete) {
            vscode.window.showErrorMessage('Thread not found in evalset');
            return;
        }

        // Confirm deletion
        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to delete thread "${threadToDelete.id}"? This action cannot be undone.`,
            { modal: true },
            'Delete'
        );

        if (confirmation !== 'Delete') {
            return; // User cancelled
        }

        // Remove the thread from evalset
        evalset.threads = evalset.threads.filter(t => t.id !== threadId);

        // Write updated evalset back to file
        const jsonContent = JSON.stringify(evalset, null, 2);
        const fileUri = vscode.Uri.file(filePath);
        await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(jsonContent));

        // Handle UI refresh based on where the command was called from
        if (autoRefresh) {
            vscode.commands.executeCommand('ballerina.openEvalsetViewer', fileUri);
        }
        vscode.window.showInformationMessage(`Thread "${threadToDelete.id}" deleted successfully`);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to delete thread: ${errorMessage}`);
    }
}
