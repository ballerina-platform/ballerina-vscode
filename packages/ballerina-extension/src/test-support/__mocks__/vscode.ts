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

// Minimal `vscode` stub for host-side unit/contract tests (no real editor).
// Extend as contract tests need more surface.

export const window = {
    showErrorMessage: () => Promise.resolve(undefined),
    showInformationMessage: () => Promise.resolve(undefined),
    showWarningMessage: () => Promise.resolve(undefined),
    createOutputChannel: () => ({ appendLine() {}, append() {}, show() {}, clear() {}, dispose() {} }),
    activeTextEditor: undefined,
};

export const workspace = {
    getConfiguration: () => ({ get: () => undefined, update: () => Promise.resolve(), inspect: () => undefined }),
    workspaceFolders: [] as unknown[],
    isTrusted: true,
    onDidChangeConfiguration: () => ({ dispose() {} }),
    onDidGrantWorkspaceTrust: () => ({ dispose() {} }),
};

export const commands = {
    executeCommand: () => Promise.resolve(undefined),
    registerCommand: () => ({ dispose() {} }),
};

export const Uri = {
    file: (p: string) => ({ fsPath: p, path: p, scheme: "file", toString: () => p }),
    parse: (p: string) => ({ fsPath: p, path: p, scheme: "file", toString: () => p }),
};

export enum ViewColumn {
    Active = -1,
    One = 1,
    Two = 2,
}

export class EventEmitter<T = unknown> {
    event = (_listener: (e: T) => unknown) => ({ dispose() {} });
    fire(_data?: T) {}
    dispose() {}
}

export const env = { openExternal: () => Promise.resolve(true) };

export default { window, workspace, commands, Uri, ViewColumn, EventEmitter, env };
