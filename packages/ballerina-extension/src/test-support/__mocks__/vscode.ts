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

import * as nodeFs from "fs";

/** Editor tab input, matched with `instanceof` by anything that filters tabs. */
export class TabInputText {
    constructor(public readonly uri: { fsPath: string; toString(): string }) {}
}

export const window = {
    // Tests reassign these to record what the user would have been shown.
    showErrorMessage: (_message?: string, ..._items: string[]) => Promise.resolve(undefined),
    showInformationMessage: (_message?: string, ..._items: string[]) => Promise.resolve(undefined),
    showWarningMessage: (_message?: string, ..._items: string[]) => Promise.resolve(undefined),
    withProgress: <T>(_options: unknown, task: (progress: { report(_v: unknown): void }) => Thenable<T>) =>
        task({ report() {} }),
    createOutputChannel: () => ({ appendLine() {}, append() {}, show() {}, clear() {}, dispose() {} }),
    activeTextEditor: undefined,
    // Tests assign `all` and spy on `close`.
    tabGroups: {
        all: [] as { tabs: { input: unknown }[] }[],
        close: (_tab: unknown, _preserveFocus?: boolean) => Promise.resolve(true),
    },
};

export const workspace = {
    getConfiguration: () => ({
        // Real `get` falls back to the caller's default, and code that reads settings relies on it.
        get: (_section: string, defaultValue?: unknown) => defaultValue,
        update: () => Promise.resolve(),
        inspect: () => undefined,
    }),
    // Backed by the real filesystem so tests can drive file-restoring code against a temp dir.
    fs: {
        readFile: (uri: { fsPath: string }) => Promise.resolve(nodeFs.readFileSync(uri.fsPath)),
        writeFile: (uri: { fsPath: string }, content: Uint8Array) => {
            nodeFs.writeFileSync(uri.fsPath, content);
            return Promise.resolve();
        },
        // Tests reassign this to assert on the options (useTrash) the caller passes.
        delete: (uri: { fsPath: string }, _options?: { recursive?: boolean; useTrash?: boolean }) => {
            nodeFs.rmSync(uri.fsPath, { force: true });
            return Promise.resolve();
        },
    },
    // Tests assign these to stand in for the editor's own file scan and edit application.
    findFiles: (_include?: unknown, _exclude?: unknown) => Promise.resolve([] as unknown[]),
    applyEdit: (_edit: unknown) => Promise.resolve(true),
    saveAll: (_includeUntitled?: boolean) => Promise.resolve(true),
    workspaceFolders: [] as unknown[],
    isTrusted: true,
    // Tests assign this to stand in for the documents VS Code has materialised.
    textDocuments: [] as {
        uri: { fsPath: string; toString(): string };
        isDirty: boolean;
        save(): Promise<boolean>;
        getText?(): string;
    }[],
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

export enum ProgressLocation {
    SourceControl = 1,
    Window = 10,
    Notification = 15,
}

export class Position {
    constructor(public readonly line: number, public readonly character: number) {}
}

export class Range {
    constructor(public readonly start: Position, public readonly end: Position) {}
}

export class RelativePattern {
    constructor(public readonly base: unknown, public readonly pattern: string) {}
}

/** Records what an edit would do; tests assert on `entries` and stub `workspace.applyEdit`. */
export class WorkspaceEdit {
    entries: { op: "create" | "delete" | "replace"; uri: { fsPath: string }; content?: string }[] = [];
    createFile(uri: { fsPath: string }, _options?: unknown) {
        this.entries.push({ op: "create", uri });
    }
    deleteFile(uri: { fsPath: string }, _options?: unknown) {
        this.entries.push({ op: "delete", uri });
    }
    replace(uri: { fsPath: string }, _range: unknown, content: string) {
        this.entries.push({ op: "replace", uri, content });
    }
}

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

export default {
    window,
    workspace,
    commands,
    Uri,
    ViewColumn,
    ProgressLocation,
    Position,
    Range,
    RelativePattern,
    WorkspaceEdit,
    EventEmitter,
    env,
};
