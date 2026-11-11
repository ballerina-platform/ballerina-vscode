/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { BallerinaExtension } from "../../core";
import { Disposable, EndOfLine, Position, Range, TextDocumentChangeEvent, TextDocumentContentChangeEvent, window, workspace } from "vscode";
import { CMP_STRING_SPLIT, sendTelemetryEvent, TM_EVENT_STRING_SPLIT } from "../telemetry";
import { traversNode } from "@wso2/syntax-tree";
import { SplitProviderVisitor } from "./split-provider-visitor";
import { SyntaxTree, SyntaxTreeNode } from "@wso2/ballerina-core";

const STRING_LITERAL: string = 'STRING_LITERAL';
const WHITESPACE: string = 'WHITESPACE_MINUTIAE';

/**
 * Provides string split capablity upon new line event.
 */
export class StringSplitter {

    public async updateDocument(event: TextDocumentChangeEvent) {
        const editor = window.activeTextEditor;
        if (!editor || !editor.document.fileName.endsWith('.bal') || event.contentChanges.length === 0 ||
            event.document.fileName.includes("extension-output-wso2.ballerina")) {
            return;
        }
        if (this instanceof BallerinaExtension) {
            // Add change for diagram edit callback
            this.getDocumentContext().didEditorChange({
                fileUri: editor.document.uri,
                startLine: editor.selection.active.line,
                startColumn: editor.selection.active.character
            });

            // The document's own line ending: a Windows machine can hold LF files and other systems CRLF files.
            const eol = event.document.eol === EndOfLine.CRLF ? "\r\n" : "\n";
            let documentChange: TextDocumentContentChangeEvent | undefined;
            event.contentChanges.forEach(change => {
                if (change.text.startsWith(eol)) {
                    documentChange = change;
                }
            });

            if (!documentChange) {
                return;
            }

            const range: Range = documentChange!.range;
            const extension: BallerinaExtension = this;
            if (!this.langClient) {
                return;
            }

            let st = await this.langClient.getSyntaxTree({
                documentIdentifier: {
                    uri: editor.document.uri.toString()
                }
            });
            const visitor = new SplitProviderVisitor(range, eol);

            traversNode((st as SyntaxTree).syntaxTree, visitor, undefined);

            if (!visitor.isValidSplit()) {
                return;
            }

            this.langClient.getSyntaxTreeNode({
                documentIdentifier: {
                    uri: editor.document.uri.toString()
                },
                range: {
                    start: {
                        line: range.start.line,
                        character: range.start.character
                    },
                    end: {
                        line: range.end.line,
                        character: range.end.character
                    }
                }
            }).then((stResponse) => {
                const response = stResponse as SyntaxTreeNode;
                if (!response.kind) {
                    return;
                }
                if (response.kind === WHITESPACE) {
                    sendTelemetryEvent(extension, TM_EVENT_STRING_SPLIT, CMP_STRING_SPLIT);
                    editor.edit(editBuilder => {
                        const startPosition = new Position(range.start.line, range.start.character);
                        // The inserted text is the line break followed by the new line's indentation.
                        const nextLinePosition = new Position(range.start.line + 1, documentChange!.text.length - eol.length);
                        const endPosition = new Position(range.end.line + 1, 0);
                        editBuilder.insert(startPosition, `\" +${eol}`);
                        editBuilder.insert(nextLinePosition, `\"`);
                        editBuilder.delete(new Range(startPosition, endPosition));
                    });
                }
            });
        }
    }
}

/**
 * Configures string split capability for the extension.
 */
export class StringSplitFeature implements Disposable {

    private disposables: Disposable[] = [];
    private provider: StringSplitter;
    private ballerinaExtInstance: BallerinaExtension;

    constructor(provider: StringSplitter, ballerinaExtInstance: BallerinaExtension) {
        this.provider = provider;
        this.ballerinaExtInstance = ballerinaExtInstance;
        workspace.onDidChangeTextDocument(this.provider.updateDocument, this.ballerinaExtInstance, this.disposables);
    }

    dispose() {
        this.disposables.forEach((disposable) => disposable.dispose());
    }
}
