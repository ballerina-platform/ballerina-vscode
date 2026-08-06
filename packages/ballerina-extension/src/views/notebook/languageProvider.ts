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

import {
    CancellationToken, CompletionContext, CompletionItem, CompletionItemProvider, CompletionList,
    Disposable, DocumentSelector, languages, Position, TextDocument, Uri,
} from "vscode";
import { CompletionItemKind as MonacoCompletionItemKind } from "monaco-languageclient";
import { SyntaxTree, NotebookFileSource } from "@wso2/ballerina-core";
import { BallerinaExtension, ExtendedLangClient, LANGUAGE, NOT_SUPPORTED } from "../../core";
import { filterCompletions, getInsertText, getLabel, translateCompletionItemKind } from "./utils";
import { NOTEBOOK_TYPE } from "./constants";

export class NotebookCompletionItemProvider implements CompletionItemProvider {
    private ballerinaExtension: BallerinaExtension;

    constructor(extensionInstance: BallerinaExtension) {
        this.ballerinaExtension = extensionInstance;
    }

    async provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken,
        context: CompletionContext): Promise<CompletionItem[] | CompletionList<CompletionItem>> {
        if (this.ballerinaExtension.langClient) {
            return await this.getCodeCompletionList(document, position, context);
        }
        return [];
    }

    private async getCodeCompletionList(document: TextDocument, position: Position, context: CompletionContext):
        Promise<any> {
        let langClient: ExtendedLangClient = <ExtendedLangClient>this.ballerinaExtension.langClient;

        if (!langClient) {
            return [];
        }
        let response = await langClient.getShellBufferFilePath();
        if (response === NOT_SUPPORTED) {
            return [];
        }
        let { content, filePath } = response as NotebookFileSource;
        const fileUri = Uri.file(filePath).toString();
        performDidOpen(langClient, fileUri, content);
        let endPositionOfMain = await this.getEndPositionOfMain(langClient, fileUri);
        let textToWrite = content ? `${content.substring(0, content.length - 1)}${document.getText()}\n}` : document.getText();
        langClient.didChange({
            textDocument: {
                uri: fileUri,
                version: 2,
            },
            contentChanges: [
                {
                    text: textToWrite
                }
            ]
        });
        let completions = await langClient.getCompletion({
            textDocument: {
                uri: fileUri
            },
            position: {
                character: endPositionOfMain.character + position.character,
                line: endPositionOfMain.line + position.line
            },
            context: {
                triggerKind: context.triggerKind
            }
        });
        return filterCompletions(completions).map(item => {
            return {
                ...item,
                label: getLabel(item),
                insertText: getInsertText(item),
                kind: translateCompletionItemKind(item.kind as MonacoCompletionItemKind)
            };
        });
    }

    private async getEndPositionOfMain(langClient: ExtendedLangClient, fileUri: string) {
        let response = await langClient.getSyntaxTree({
            documentIdentifier: {
                uri: fileUri
            }
        });
        let syntaxTree = response as any;
        if (syntaxTree && syntaxTree.syntaxTree && syntaxTree.syntaxTree.members) {
            var main = syntaxTree.syntaxTree.members.find((member: { kind: string; functionName: { value: string; }; }) =>
                member.kind === 'FunctionDefinition' && member.functionName.value === 'main'
            );
            if (main) {
                return {
                    line: main.position.endLine,
                    character: main.position.endColumn - 1
                };
            }
        }
        return {
            line: 0,
            character: 0
        };
    }
}

export function registerLanguageProviders(ballerinaExtInstance: BallerinaExtension): Disposable {
    const selector: DocumentSelector = {
        notebookType: NOTEBOOK_TYPE,
        language: LANGUAGE.BALLERINA
    };
    const disposables: Disposable[] = [];
    disposables.push(
        languages.registerCompletionItemProvider(selector, new NotebookCompletionItemProvider(ballerinaExtInstance)));
    return Disposable.from(...disposables);
}

function performDidOpen(langClient: ExtendedLangClient, fileUri: string, content: string) {
    langClient.didOpen({
        textDocument: {
            uri: fileUri,
            languageId: LANGUAGE.BALLERINA,
            version: 1,
            text: content
        }
    });
}
