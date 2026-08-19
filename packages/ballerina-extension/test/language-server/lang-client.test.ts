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

import assert = require('assert');
import { expect } from 'chai';
import { join } from 'path';
import { getServerOptions } from "../../src/utils/server/server";
import { getBallerinaCmd, isWindows } from "../test-util";
import { commands, Uri } from "vscode";
import { runSemanticTokensTestCases } from './semantic-tokens.test';
import { readFileSync } from 'fs';
import {
    BallerinaExampleList, BallerinaProject, BallerinaProjectComponents, ExecutorPositions,
    JsonToRecord, NoteBookCellOutput, NotebookFileSource,
    NotebookVariable, OpenAPISpec, PackageConfigSchema, PartialST,
    SymbolInfo, SyntaxTreeNode,
    Connectors, Completion, Diagnostics,
    SyntaxTree} from '@wso2/ballerina-core';
import { ExtendedLangClient } from '../../src/core/extended-language-client';
import { extension } from '../../src/BalExtensionContext';

const PROJECT_ROOT = join(__dirname, '..', '..', '..', 'test', 'data');

suite.skip("Language Server Tests", function () {
    this.timeout(30000);
    let langClient: ExtendedLangClient;

    suiteSetup((done): any => {
        langClient = new ExtendedLangClient(
            'ballerina-vscode',
            'Ballerina LS Client',
            getServerOptions(extension.ballerinaExtInstance),
            { documentSelector: [{ scheme: 'file', language: 'ballerina' }] },
            undefined,
            false
        );
        langClient.start();
        done();
    });


    test("Test Language Server Start", function (done): void {
        langClient.start().then(async () => {
            await langClient.registerExtendedAPICapabilities();
            done();
        }, () => {
            done(new Error("Language Server start failed"));
        }).catch((err) => {
            done(new Error("Language Server start failed"));
        });
    });

    test("Test getSyntaxTree", function (done): void {
        const uri = Uri.file(join(PROJECT_ROOT, 'hello_world.bal'));
        commands.executeCommand('vscode.open', uri).then(() => {
            langClient.getSyntaxTree({
                documentIdentifier: {
                    uri: uri.toString()
                }
            }).then((response) => {
                expect(response).to.contain.keys('syntaxTree', 'parseSuccess');
                done();
            }, (reason) => {
                done(reason);
            });
        });
    });

    test("Test getBallerinaProject - Ballerina project", (done) => {
        const projectPath = join(PROJECT_ROOT, 'helloPackage');
        const uri = Uri.file(join(projectPath, 'main.bal').toString());
        commands.executeCommand('vscode.open', uri).then(() => {
            const projectPath = join(PROJECT_ROOT, 'helloPackage');
            const documentIdentifier = {
                documentIdentifier: {
                    uri: uri.toString()
                }
            };
            langClient.getBallerinaProject(documentIdentifier).then((projectResponse) => {
                const response = projectResponse as BallerinaProject;
                assert.equal(response.packageName, 'helloproject', "Invalid package name.");
                !isWindows() ? assert.equal(response.path, projectPath, 'Invalid project path') :
                    assert.equal(response.path!.toLowerCase(), projectPath.toLowerCase(), 'Invalid project path');
                assert.equal(response.kind, 'BUILD_PROJECT', 'Invalid project kind.');
                done();
            }, (reason) => {
                done(reason);
            });
        });
    });

    test("Test getBallerinaProject - Single file", (done) => {
        const uri = Uri.file(join(PROJECT_ROOT, 'hello_world.bal'));
        commands.executeCommand('vscode.open', uri).then(() => {
            const documentIdentifier = {
                documentIdentifier: {
                    uri: uri.toString()
                }
            };
            langClient.getBallerinaProject(documentIdentifier).then((projectResponse) => {
                const response = projectResponse as BallerinaProject;
                assert.equal(response.kind, 'SINGLE_FILE_PROJECT', 'Invalid project kind.');
                done();
            }, (reason) => {
                done(reason);
            });
        });
    });

    test("Test fetchExamples", (done) => {
        langClient.fetchExamples().then((examplesResponse) => {
            const response = examplesResponse as BallerinaExampleList;
            assert.notEqual(response.samples.length, 0, 'No samples listed');
            done();
        }, (reason) => {
            done(reason);
        });
    });

    test("Test Folding Range - Ballerina project", (done) => {
        const uri = Uri.file(join(PROJECT_ROOT, 'helloPackage', 'modules', 'hello', 'hello_service.bal').toString());
        commands.executeCommand('vscode.open', uri).then(() => {
            const foldingRangeParam = {
                textDocument: {
                    uri: uri.toString()
                }
            };
            langClient.sendRequest('textDocument/foldingRange', foldingRangeParam).then((response: any) => {
                assert.equal(response.length, 5, 'Invalid folding start position.');
                assert.equal(response[0].startLine, 4, 'Invalid folding start position - 4.');
                assert.equal(response[0].endLine, 12, 'Invalid folding end position - 12.');
                assert.equal(response[0].kind, 'region', 'Invalid folding kind - 0th.');
                assert.equal(response[1].startLine, 8, 'Invalid folding start position - 8.');
                assert.equal(response[1].endLine, 11, 'Invalid folding end position - 11.');
                assert.equal(response[1].kind, 'region', 'Invalid folding kind - 1st.');
                assert.equal(response[2].startLine, 15, 'Invalid folding start position - 15.');
                assert.equal(response[2].endLine, 17, 'Invalid folding end position - 17.');
                assert.equal(response[2].kind, 'region', 'Invalid folding kind - 2nd.');
                assert.equal(response[3].startLine, 17, 'Invalid folding start position - 17.');
                assert.equal(response[3].endLine, 17, 'Invalid folding end position - 17.');
                assert.equal(response[3].kind, 'region', 'Invalid folding kind - 3rd.');
                assert.equal(response[4].startLine, 0, 'Invalid folding start position - 0.');
                assert.equal(response[4].endLine, 1, 'Invalid folding end position - 1.');
                assert.equal(response[4].kind, 'region', 'Invalid folding kind - 4th.');
                done();
            });
        });
    });

    test("Test Folding Range - Single file", (done) => {
        const uri = Uri.file(join(PROJECT_ROOT, 'hello_world.bal').toString());
        commands.executeCommand('vscode.open', uri).then(() => {
            const foldingRangeParam = {
                textDocument: {
                    uri: uri.toString()
                }
            };
            langClient.sendRequest('textDocument/foldingRange', foldingRangeParam).then((response: any) => {
                assert.equal(response.length, 4, 'Invalid folding start position.');
                assert.equal(response[0].startLine, 3, 'Invalid folding start position - 3.');
                assert.equal(response[0].endLine, 4, 'Invalid folding end position - 4.');
                assert.equal(response[0].kind, 'region', 'Invalid folding kind - 0th.');
                assert.equal(response[1].startLine, 7, 'Invalid folding start position - 7.');
                assert.equal(response[1].endLine, 9, 'Invalid folding end position - 9.');
                assert.equal(response[1].kind, 'comment', 'Invalid folding kind - 1st.');
                assert.equal(response[2].startLine, 10, 'Invalid folding start position - 10.');
                assert.equal(response[2].endLine, 11, 'Invalid folding end position - 11.');
                assert.equal(response[2].kind, 'region', 'Invalid folding kind - 2nd.');
                assert.equal(response[3].startLine, 11, 'Invalid folding start position - 11.');
                assert.equal(response[3].endLine, 11, 'Invalid folding end position - 11.');
                assert.equal(response[3].kind, 'region', 'Invalid folding kind - 3rd.');
                done();
            });
        });
    });

    test("Test Goto Defition - Ballerina project", (done) => {
        const uri = Uri.file(join(PROJECT_ROOT, 'helloPackage', 'main.bal'));
        const definitionParam = {
            textDocument: {
                uri: uri.toString()
            }, position: {
                line: 5,
                character: 33
            }
        };
        langClient.sendRequest('textDocument/definition', definitionParam).then((response: any) => {
            const gotoDefFilePath = Uri.file(join(PROJECT_ROOT, 'helloPackage', 'modules', 'hello',
                'hello_service.bal').toString());
            assert.equal(response[0].uri, isWindows() ? gotoDefFilePath.toString().replace('%3A', ':') :
                gotoDefFilePath, 'Invalid goto definitopn file uri.');
            assert.equal(response[0].range.start.line, 15, 'Invalid goto def start line.');
            assert.equal(response[0].range.start.character, 16, 'Invalid goto def start character.');
            assert.equal(response[0].range.end.line, 15, 'Invalid goto def end line.');
            assert.equal(response[0].range.end.character, 26, 'Invalid goto def start character.');
            done();
        });
    });

    test("Test Goto Defition - Single file", (done) => {
        const uri = Uri.file(join(PROJECT_ROOT, 'hello_world.bal'));
        const definitionParam = {
            textDocument: {
                uri: uri.toString()
            }, position: {
                line: 4,
                character: 20
            }
        };
        langClient.sendRequest('textDocument/definition', definitionParam).then((response: any) => {
            assert.equal(response[0].uri, !isWindows() ? uri : uri.toString().replace('%3A', ':'),
                'Invalid goto definitopn file uri.');
            assert.equal(response[0].range.start.line, 10, 'Invalid goto def start line.');
            assert.equal(response[0].range.start.character, 16, 'Invalid goto def start character.');
            assert.equal(response[0].range.end.line, 10, 'Invalid goto def end line.');
            assert.equal(response[0].range.end.character, 26, 'Invalid goto def start character.');
            done();
        });
    });

    test("Test Hover - Ballerina project", (done) => {
        const hoverParam = {
            textDocument: {
                uri: Uri.file(join(PROJECT_ROOT, 'helloPackage', 'main.bal')).toString()
            },
            position: {
                line: 6,
                character: 10
            }
        };
        langClient.sendRequest('textDocument/hover', hoverParam).then((response: any) => {
            assert.equal(response.contents.kind, 'markdown', 'Invalid content kind.');
            assert.equal(response.contents.value.includes('Prints'), true, 'Invalid hover value.');
            done();
        });
    });

    test("Test Hover - Single file", (done) => {
        const hoverParam = {
            textDocument: {
                uri: Uri.file(join(PROJECT_ROOT, 'hello_world.bal')).toString()
            },
            position: {
                line: 10,
                character: 20
            }
        };
        langClient.sendRequest('textDocument/hover', hoverParam).then((response: any) => {
            assert.equal(response.contents.kind, 'markdown', 'Invalid content kind.');
            assert.equal(response.contents.value.includes('Returns a message'), true, 'Invalid hover value.');
            done();
        });
    });

    test("Test Code Action - Ballerina project", (done) => {
        const actionParam = {
            textDocument: {
                uri: Uri.file(join(PROJECT_ROOT, 'helloPackage', 'main.bal')).toString()
            },
            range: {
                start: {
                    line: 4,
                    character: 10
                },
                end: {
                    line: 4,
                    character: 11
                }
            },
            context: {
                diagnostics: []
            }
        };
        langClient.sendRequest('textDocument/codeAction', actionParam).then((response: any) => {
            assert.equal(response.length, 2, 'Invalid number of code actions.');
            assert.equal(response[0].command.title, 'Document this', 'Invalid \'Document this\' action.');
            assert.equal(response[1].command.title, 'Document all', 'Invalid \'Document all\' action.');
            done();
        });
    });

    test("Test Code Action - Single file", (done) => {
        const actionParam = {
            textDocument: {
                uri: Uri.file(join(PROJECT_ROOT, 'hello_world.bal')).toString()
            },
            range: {
                start: {
                    line: 10,
                    character: 20
                },
                end: {
                    line: 10,
                    character: 22
                }
            },
            context: {
                diagnostics: []
            }
        };
        langClient.sendRequest('textDocument/codeAction', actionParam).then((response: any) => {
            assert.equal(response.length, 1, 'Invalid number of code actions.');
            assert.equal(response[0].command.title, 'Document all', 'Invalid \'Document all\' action.');
            done();
        });
    });

    test("Test No Code Action - Single file (source)", (done) => {
        const actionParam = {
            textDocument: {
                uri: Uri.file(join(PROJECT_ROOT, 'sample1.bal')).toString()
            },
            range: {
                start: {
                    line: 7,
                    character: 11
                },
                end: {
                    line: 7,
                    character: 13
                }
            },
            context: {
                diagnostics: []
            }
        };
        langClient.sendRequest('textDocument/codeAction', actionParam).then((response: any) => {
            assert.equal(response.length, 0, 'Invalid number of code actions.');
            done();
        });
    });

    test("Test No Code Action - Single file (comment)", (done) => {
        const actionParam = {
            textDocument: {
                uri: Uri.file(join(PROJECT_ROOT, 'sample1.bal')).toString()
            },
            range: {
                start: {
                    line: 22,
                    character: 16
                },
                end: {
                    line: 22,
                    character: 17
                }
            },
            context: {
                diagnostics: []
            }
        };
        langClient.sendRequest('textDocument/codeAction', actionParam).then((response: any) => {
            assert.equal(response.length, 0, 'Invalid number of code actions.');
            done();
        });
    });

    test("Test Folding Range - Different Ballerina components", (done) => {
        const uri = Uri.file(join(PROJECT_ROOT, 'sample1.bal').toString());
        commands.executeCommand('vscode.open', uri).then(() => {
            const foldingRangeParam = {
                textDocument: {
                    uri: uri.toString()
                }
            };
            langClient.sendRequest('textDocument/foldingRange', foldingRangeParam).then((response: any) => {
                assert.equal(response.length, 38, 'Invalid folding start position.');
                assert.equal(response[0].startLine, 5, 'Invalid folding start position - 5. (function)');
                assert.equal(response[0].endLine, 7, 'Invalid folding end position - 6. (function)');
                assert.equal(response[0].kind, 'region', 'Invalid folding kind - 0th. (function)');
                assert.equal(response[1].startLine, 10, 'Invalid folding start position - 9. (function comment)');
                assert.equal(response[1].endLine, 11, 'Invalid folding end position - 10. (function comment)');
                assert.equal(response[1].kind, 'comment', 'Invalid folding kind - 1st. (function comment)');
                assert.equal(response[2].startLine, 12, 'Invalid folding start position - 11. (function)');
                assert.equal(response[2].endLine, 17, 'Invalid folding end position - 17. (function)');
                assert.equal(response[2].kind, 'region', 'Invalid folding kind - 2nd. (function)');
                assert.equal(response[3].startLine, 25, 'Invalid folding start position - 25. (class)');
                assert.equal(response[3].endLine, 52, 'Invalid folding end position - 52. (class)');
                assert.equal(response[3].kind, 'region', 'Invalid folding kind - 3rd. (class)');
                assert.equal(response[4].startLine, 20, 'Invalid folding start position - 20. (class comment)');
                assert.equal(response[4].endLine, 24, 'Invalid folding end position - 24. (class comment)');
                assert.equal(response[4].kind, 'comment', 'Invalid folding kind - 4th. (class comment)');
                assert.equal(response[5].startLine, 30, 'Invalid folding start position - 30. (inner function comment)');
                assert.equal(response[5].endLine, 34, 'Invalid folding end position - 34. (inner function comment)');
                assert.equal(response[5].kind, 'comment', 'Invalid folding kind - 5th. (inner function comment)');
                assert.equal(response[6].startLine, 35, 'Invalid folding start position - 35. (inner function)');
                assert.equal(response[6].endLine, 38, 'Invalid folding end position - 38. (inner function)');
                assert.equal(response[6].kind, 'region', 'Invalid folding kind - 6th. (inner function)');
                assert.equal(response[7].startLine, 41, 'Invalid folding start position - 41. (inner function comment)');
                assert.equal(response[7].endLine, 43, 'Invalid folding end position - 43. (inner function comment)');
                assert.equal(response[7].kind, 'comment', 'Invalid folding kind - 7th. (inner function comment)');
                assert.equal(response[8].startLine, 44, 'Invalid folding start position - 44. (inner function)');
                assert.equal(response[8].endLine, 45, 'Invalid folding end position - 45. (inner function)');
                assert.equal(response[8].kind, 'region', 'Invalid folding kind - 8th. (inner function)');
                assert.equal(response[9].startLine, 45, 'Invalid folding start position - 45. (function return)');
                assert.equal(response[9].endLine, 45, 'Invalid folding end position - 45. (function return)');
                assert.equal(response[9].kind, 'region', 'Invalid folding kind - 9th. (function return)');
                assert.equal(response[10].startLine, 48, 'Invalid folding start position - 48. (inner function)');
                assert.equal(response[10].endLine, 51, 'Invalid folding end position - 51. (inner function)');
                assert.equal(response[10].kind, 'region', 'Invalid folding kind - 10th. (inner function)');
                assert.equal(response[11].startLine, 49, 'Invalid folding start position - 49. (if clause)');
                assert.equal(response[11].endLine, 50, 'Invalid folding end position - 50. (if clause)');
                assert.equal(response[11].kind, 'region', 'Invalid folding kind - 11th. (if clause)');
                assert.equal(response[12].startLine, 55, 'Invalid folding start position - 55. (record)');
                assert.equal(response[12].endLine, 58, 'Invalid folding end position - 58. (record)');
                assert.equal(response[12].kind, 'region', 'Invalid folding kind - 12th. (record)');
                assert.equal(response[13].startLine, 61, 'Invalid folding start position - 61. (record comment)');
                assert.equal(response[13].endLine, 62, 'Invalid folding end position - 62. (record comment)');
                assert.equal(response[13].kind, 'comment', 'Invalid folding kind - 13th. (record comment)');
                assert.equal(response[14].startLine, 63, 'Invalid folding start position - 63. (closed record)');
                assert.equal(response[14].endLine, 65, 'Invalid folding end position - 65. (closed record)');
                assert.equal(response[14].kind, 'region', 'Invalid folding kind - 14th. (closed record)');
                assert.equal(response[15].startLine, 68, 'Invalid folding start position - 68. (object comment)');
                assert.equal(response[15].endLine, 71, 'Invalid folding end position - 71. (object comment)');
                assert.equal(response[15].kind, 'comment', 'Invalid folding kind - 15th. (object comment)');
                assert.equal(response[16].startLine, 72, 'Invalid folding start position - 72. (object)');
                assert.equal(response[16].endLine, 84, 'Invalid folding end position - 84. (object)');
                assert.equal(response[16].kind, 'region', 'Invalid folding kind - 16th. (object)');
                assert.equal(response[17].startLine, 78, 'Invalid folding start position - 78. (method declaration)');
                assert.equal(response[17].endLine, 78, 'Invalid folding end position - 78. (method declaration)');
                assert.equal(response[17].kind, 'region', 'Invalid folding kind - 17th. (method declaration)');
                assert.equal(response[18].startLine, 84, 'Invalid folding start position - 84. (method declaration)');
                assert.equal(response[18].endLine, 84, 'Invalid folding end position - 84. (method declaration)');
                assert.equal(response[18].kind, 'region', 'Invalid folding kind - 18th. (method declaration)');
                assert.equal(response[19].startLine, 80, 'Invalid folding start position - 80. (method declaration comment)');
                assert.equal(response[19].endLine, 83, 'Invalid folding end position - 83. (method declaration comment)');
                assert.equal(response[19].kind, 'comment', 'Invalid folding kind - 19th. (method declaration comment)');
                assert.equal(response[20].startLine, 89, 'Invalid folding start position - 89. (service)');
                assert.equal(response[20].endLine, 146, 'Invalid folding end position - 146. (service)');
                assert.equal(response[20].kind, 'region', 'Invalid folding kind - 20th. (service)');
                assert.equal(response[21].startLine, 87, 'Invalid folding start position - 87. (service comment)');
                assert.equal(response[21].endLine, 88, 'Invalid folding end position - 88. (service comment)');
                assert.equal(response[21].kind, 'comment', 'Invalid folding kind - 21st. (service comment)');
                assert.equal(response[22].startLine, 93, 'Invalid folding start position - 93. (resource)');
                assert.equal(response[22].endLine, 106, 'Invalid folding end position - 106. (resource)');
                assert.equal(response[22].kind, 'region', 'Invalid folding kind - 22nd. (resource)');
                assert.equal(response[23].startLine, 97, 'Invalid folding start position - 97. (if clause)');
                assert.equal(response[23].endLine, 98, 'Invalid folding end position - 98. (if clause)');
                assert.equal(response[23].kind, 'region', 'Invalid folding kind - 23rd. (if clause)');
                assert.equal(response[24].startLine, 99, 'Invalid folding start position - 99. (else clause)');
                assert.equal(response[24].endLine, 101, 'Invalid folding end position - 101. (else clause)');
                assert.equal(response[24].kind, 'region', 'Invalid folding kind - 24th. (else clause)');
                assert.equal(response[25].startLine, 104, 'Invalid folding start position - 104. (if clause)');
                assert.equal(response[25].endLine, 105, 'Invalid folding end position - 105. (if clause)');
                assert.equal(response[25].kind, 'region', 'Invalid folding kind - 25th. (if clause)');
                assert.equal(response[26].startLine, 109, 'Invalid folding start position - 109. (resource comment)');
                assert.equal(response[26].endLine, 114, 'Invalid folding end position - 114. (resource comment)');
                assert.equal(response[26].kind, 'comment', 'Invalid folding kind - 26th. (resource comment)');
                assert.equal(response[27].startLine, 115, 'Invalid folding start position - 115. (resource)');
                assert.equal(response[27].endLine, 124, 'Invalid folding end position - 124. (resource)');
                assert.equal(response[27].kind, 'region', 'Invalid folding kind - 27th. (resource)');
                assert.equal(response[28].startLine, 122, 'Invalid folding start position - 122. (if clause)');
                assert.equal(response[28].endLine, 123, 'Invalid folding end position - 123. (if clause)');
                assert.equal(response[28].kind, 'region', 'Invalid folding kind - 28th. (if clause)');
                assert.equal(response[29].startLine, 129, 'Invalid folding start position - 129. (annotation)');
                assert.equal(response[29].endLine, 129, 'Invalid folding end position - 129. (annotation)');
                assert.equal(response[29].kind, 'comment', 'Invalid folding kind - 29th. (annotation)');
                assert.equal(response[30].startLine, 130, 'Invalid folding start position - 130. (resource)');
                assert.equal(response[30].endLine, 145, 'Invalid folding end position - 145. (resource)');
                assert.equal(response[30].kind, 'region', 'Invalid folding kind - 30th. (resource)');
                assert.equal(response[31].startLine, 143, 'Invalid folding start position - 143. (if clause)');
                assert.equal(response[31].endLine, 144, 'Invalid folding end position - 144. (if clause)');
                assert.equal(response[31].kind, 'region', 'Invalid folding kind - 31st. (if clause)');
                assert.equal(response[32].startLine, 149, 'Invalid folding start position - 149. (function)');
                assert.equal(response[32].endLine, 155, 'Invalid folding end position - 155. (function)');
                assert.equal(response[32].kind, 'region', 'Invalid folding kind - 32nd. (function)');
                assert.equal(response[33].startLine, 150, 'Invalid folding start position - 150. (if clause)');
                assert.equal(response[33].endLine, 152, 'Invalid folding end position - 152. (if clause)');
                assert.equal(response[33].kind, 'region', 'Invalid folding kind - 33rd. (if clause)');
                assert.equal(response[34].startLine, 152, 'Invalid folding start position - 152. (fuction return)');
                assert.equal(response[34].endLine, 152, 'Invalid folding end position - 152. (fuction return)');
                assert.equal(response[34].kind, 'region', 'Invalid folding kind - 34th. (fuction return)');
                assert.equal(response[35].startLine, 153, 'Invalid folding start position - 153. (else clause)');
                assert.equal(response[35].endLine, 154, 'Invalid folding end position - 154. (else clause)');
                assert.equal(response[35].kind, 'region', 'Invalid folding kind - 35th. (else clause)');
                assert.equal(response[36].startLine, 154, 'Invalid folding start position - 149. (fuction return)');
                assert.equal(response[36].endLine, 154, 'Invalid folding end position - 155. (fuction return)');
                assert.equal(response[36].kind, 'region', 'Invalid folding kind - 36th. (fuction return)');
                assert.equal(response[37].startLine, 0, 'Invalid folding start position - 149. (imports)');
                assert.equal(response[37].endLine, 3, 'Invalid folding end position - 155. (imports)');
                assert.equal(response[37].kind, 'region', 'Invalid folding kind - 37th. (imports)');
                done();
            });
        });
    });

    test("Test Incompatible Params Action - Single file", (done) => {
        const uri = Uri.file(join(PROJECT_ROOT, 'sample1.bal').toString());
        commands.executeCommand('vscode.open', uri).then(() => {
            const actionParam = {
                textDocument: {
                    uri: Uri.file(join(PROJECT_ROOT, 'sample1.bal')).toString()
                },
                range: {
                    start: {
                        line: 15,
                        character: 24
                    },
                    end: {
                        line: 15,
                        character: 24
                    }
                },
                context: {
                    diagnostics: []
                }
            };

            langClient.sendRequest('textDocument/codeAction', actionParam).then((response: any) => {
                assert.equal(response.length, 4, 'Invalid number of code actions.');
                assert.equal(response[3].title, "Change variable 'piValue' type to 'string'", 'Invalid change variable action.');
                assert.equal(response[3].kind, "quickfix", "Invalid code action kind - 1st.");
                done();
            });
        });
    });

    test("Test Create Variable Action - Single file", (done) => {
        const uri = Uri.file(join(PROJECT_ROOT, 'sample1.bal').toString());
        commands.executeCommand('vscode.open', uri).then(() => {
            const actionParam = {
                textDocument: {
                    uri: Uri.file(join(PROJECT_ROOT, 'sample1.bal')).toString()
                },
                range: {
                    start: {
                        line: 16,
                        character: 6
                    },
                    end: {
                        line: 16,
                        character: 7
                    }
                },
                context: {
                    diagnostics: []
                }
            };

            langClient.sendRequest('textDocument/codeAction', actionParam).then((response: any) => {
                assert.equal(response.length, 2, 'Invalid number of code actions.');
                assert.equal(response[1].title, 'Create variable', 'Invalid create variable action.');
                assert.equal(response[1].kind, "quickfix", "Invalid code action kind - 1st.");
                assert.equal(response[0].title, 'Ignore return value', 'Invalid ignore return value action.');
                assert.equal(response[0].kind, "quickfix", "Invalid code action kind - 0th.");
                done();
            });
        });
    });

    test("Test Create Variable With Unions Action - Single file", (done) => {
        const uri = Uri.file(join(PROJECT_ROOT, 'sample1.bal').toString());
        commands.executeCommand('vscode.open', uri).then(() => {
            const actionParam = {
                textDocument: {
                    uri: Uri.file(join(PROJECT_ROOT, 'sample1.bal')).toString()
                },
                range: {
                    start: {
                        line: 7,
                        character: 10
                    },
                    end: {
                        line: 7,
                        character: 11
                    }
                },
                context: {
                    diagnostics: []
                }
            };

            langClient.sendRequest('textDocument/codeAction', actionParam).then((response: any) => {
                assert.equal(response.length, 3, "Invalid number of code actions.");
                assert.equal(response[0].title, "Create variable and type guard", "Invalid create variable and type guard action.");
                assert.equal(response[0].kind, "quickfix", "Invalid code action kind - 0th.");
                assert.equal(response[1].title, "Create variable and check error", "Invalid create variable and check error action.");
                assert.equal(response[1].kind, "quickfix", "Invalid code action kind - 1st.");
                assert.equal(response[2].title, "Create variable", "Invalid create variable action.");
                assert.equal(response[2].kind, "quickfix", "Invalid code action kind - 2nd.");
                done();
            });
        });
    });

    test("Test CodeLens - Single file", (done) => {
        const uri = Uri.file(join(PROJECT_ROOT, 'sample1.bal').toString());
        commands.executeCommand('vscode.open', uri).then(() => {

            const lensParam = {
                textDocument: {
                    uri: Uri.file(join(PROJECT_ROOT, 'sample1.bal')).toString()
                }
            };

            langClient.sendRequest('textDocument/codeLens', lensParam).then((response: any) => {
                assert.equal(response.length, 1, 'Invalid number of code actions.');
                assert.equal(response[0].command.title, 'Document this', 'Invalid code lens title.');
                assert.equal(response[0].range.start.line, 55, "Invalid start line.");
                assert.equal(response[0].range.end.line, 59, 'Invalid end line.');
                done();
            });
        });
    });

    test("Test Update Document Action - Single file", (done) => {
        const uri = Uri.file(join(PROJECT_ROOT, 'sample2.bal').toString());
        commands.executeCommand('vscode.open', uri).then(() => {
            const actionParam = {
                textDocument: {
                    uri: Uri.file(join(PROJECT_ROOT, 'sample2.bal')).toString()
                },
                range: {
                    start: {
                        line: 7,
                        character: 6
                    },
                    end: {
                        line: 7,
                        character: 6
                    }
                },
                context: {
                    diagnostics: []
                }
            };

            langClient.sendRequest('textDocument/codeAction', actionParam).then((response: any) => {
                assert.equal(response.length, 1, 'Invalid number of code actions.');
                assert.equal(response[0].title, 'Update documentation', 'Invalid update documentation action.');
                done();
            });
        });
    });

    test("Test BallerinaProjectComponents, and ExecutorPositions", function (done): void {
        const uri = Uri.file(join(PROJECT_ROOT, 'hello_world.bal'));
        commands.executeCommand('vscode.open', uri).then(async () => {
            await langClient.getBallerinaProjectComponents({
                documentIdentifiers: [{
                    uri: uri.toString()
                }]
            }).then((projectResponse) => {
                const response = projectResponse as BallerinaProjectComponents;
                expect(response).to.contain.keys('packages');
                assert.equal(response!.packages![0].modules[0].functions[0].name, 'main',
                    "Invalid project component function name.");
                done();
            }, (reason) => {
                done(reason);
            });
        });
    });

    test("Test SyntaxTreeNode", function (done): void {
        const uri = Uri.file(join(PROJECT_ROOT, 'hello_world.bal'));
        langClient.getSyntaxTreeNode({
            documentIdentifier: {
                uri: uri.toString()
            },
            range: {
                start: {
                    line: 11,
                    character: 20,
                },
                end: {
                    line: 11,
                    character: 22
                }
            }
        }).then((stResponse) => {
            const response = stResponse as SyntaxTreeNode;
            expect(response).to.contain.keys('kind');
            assert.equal(response.kind, 'STRING_LITERAL', 'Invalid syntax tree node kind.');
            done();
        }, (reason) => {
            done(reason);
        });
    });

    test("Test ExecutorPositions", function (done): void {
        const uri = Uri.file(join(PROJECT_ROOT, 'hello_world.bal'));
        langClient.getExecutorPositions({
            documentIdentifier: {
                uri: uri.toString()
            }
        }).then((execResponse) => {
            const response = execResponse as ExecutorPositions;
            expect(response).to.contain.keys('executorPositions');
            assert.equal(response.executorPositions?.length, 1, "Invalid numer of executor positions");
            assert.equal(response.executorPositions![0].name, 'main', "Invalid executor position function name");
            done();
        }, (reason) => {
            done(reason);
        });
    });

    test("Test Semantic Highlighting", async function (): Promise<void> {
        await langClient.start();
        const result: boolean = await runSemanticTokensTestCases(langClient);
        assert.equal(result, true, "Semantic highlighting test cases failed.");
    });

    test("Test json to record", function (done): void {
        const json: string = readFileSync(join(PROJECT_ROOT, 'record.json'), 'utf-8');
        const expected: string = readFileSync(join(PROJECT_ROOT, 'record.bal'), 'utf-8');
        langClient.convertJsonToRecord({ jsonString: json, isClosed: false, isRecordTypeDesc: false, recordName: "", forceFormatRecordFields: false })
            .then(lSResponse => {
                const response = lSResponse as JsonToRecord;
                expect(response).to.contain.keys("codeBlock");
                assert.strictEqual(response.codeBlock, expected, "Invalid codeblock");
                done();
            }, error => {
                done(error);
            });
    });

    test("Test partial parser - get ST for single statement", function (done): void {
        langClient.getSTForSingleStatement({
            codeSnippet: "int x = 0;"
        }).then(async (epResponse) => {
            const response = epResponse as PartialST;
            expect(response).to.contain.keys("syntaxTree");

            assert.strictEqual(response.syntaxTree.position.endColumn, 10, "Invalid st response");
            done();
        }, error => {
            done(error);
        });
    });

    test("Test partial parser - get ST for module members", function (done): void {
        langClient.getSTForModuleMembers({
            codeSnippet: "configurable STATEMENT  CONF_NAME = ?;"
        }).then(async (res) => {
            const response = res as PartialST;
            expect(response).to.contain.keys("syntaxTree");

            assert.strictEqual(response.syntaxTree.position.endColumn, 37, "Invalid st response");
            done();
        }, error => {
            done(error);
        });
    });

    test("Test open API generator", function (done): void {
        const uri = Uri.file(join(PROJECT_ROOT, 'helloServicePackage', 'hello_service.bal').toString());
        commands.executeCommand('vscode.open', uri).then(() => {
            langClient.convertToOpenAPI({
                documentFilePath: uri.fsPath
            }).then(async (res) => {
                const response = res as OpenAPISpec;
                expect(response).to.contain.keys("content");
                assert.strictEqual(response.content.length, 1, "Invalid open API content");
                assert.strictEqual(response.content[0].diagnostics.length, 0, "Invalid open API content");
                done();
            }, error => {
                done(error);
            });
        });
    });

    test("Test get diagnostics", function (done): void {
        const uri = Uri.file(join(PROJECT_ROOT, 'error.bal'));
        commands.executeCommand('vscode.open', uri).then(() => {
            langClient.getDiagnostics({
                documentIdentifier: {
                    uri: uri.toString()
                }
            }).then(async (res) => {
                const response = res as Diagnostics[];
                expect(response).to.lengthOf(1);
                assert.strictEqual(response[0].diagnostics.length, 3, "Invalid diagnostics");
                done();
            }, error => {
                done(error);
            });
        });
    });

    test("Test get completion", function (done): void {
        const uri = Uri.file(join(PROJECT_ROOT, 'hello_world.bal'));
        commands.executeCommand('vscode.open', uri).then(() => {
            langClient.getCompletion({
                textDocument: {
                    uri: uri.toString()
                },
                position: {
                    character: 4,
                    line: 4
                },
                context: {
                    triggerKind: 1
                }
            }).then(async (res) => {
                const response = res as Completion[];
                expect(response).length.to.greaterThan(70);
                assert.strictEqual(response[0].detail, "Snippet", "Invalid completion");
                done();
            }, error => {
                done(error);
            });
        });
    });

    test("Test get connectors", function (done): void {
        langClient.getConnectors({
            query: "",
            limit: 2
        }).then(async (res) => {
            const response = res as Connectors;
            expect(response).not.contains.keys("error");
            assert.strictEqual(response.central.length, 2, "Invalid triggers");
            done();
        }, error => {
            done(error);
        });
    });

    // TODO: Enable test. https://github.com/wso2/ballerina-plugin-vscode/issues/937
    // test.skip("Test get connector", function (done): void {
    //     langClient.getConnector({
    //         name: "Client",
    //         moduleName: "googleapis.sheets",
    //         package: { organization: "ballerinax", name: "googleapis.sheets", version: "3.1.0" },
    //     }).then(async (res) => {
    //         const response = res as Connector;
    //         expect(response).not.contains.keys("error");
    //         assert.strictEqual(response.name, "Client", "Invalid trigger");
    //         done();
    //     }, error => {
    //         done(error);
    //     });
    // });

    test("Test st modify", function (done): void {
        const uri = Uri.file(join(PROJECT_ROOT, 'error.bal')).toString();
        langClient.stModify({
            documentIdentifier: {
                uri
            },
            astModifications: [{
                config: {
                    STATEMENT:
                        'int age;'
                },
                startColumn: 0,
                startLine: 0,
                endColumn: 2,
                endLine: 0,
                type: 'INSERT'
            }]
        }).then(async (res) => {
            const response = res as SyntaxTree;
            expect(response).to.contains.keys("source");
            assert.strictEqual(response.parseSuccess, true, "Invalid st modification");
            assert.strictEqual(response.source, "int age;\n", "Invalid st modification");
            done();
        }, error => {
            done(error);
        });
    });

    test("Test get symbol documentation", function (done): void {
        const uri = Uri.file(join(PROJECT_ROOT, 'error.bal'));
        langClient.didChange({
            textDocument: {
                uri: uri.toString(),
                version: 1
            },
            contentChanges: [{
                text: 'import ballerina/regex; \nconfigurable string token = ?;\n\npublic function main() returns error? {\n\nvar variable = regex:split(receiver, delimiter);\n}\n'
            }]
        });

        langClient.getSymbolDocumentation({
            textDocumentIdentifier: {
                uri: uri.toString()
            },
            position: {
                character: 25,
                line: 5,
            }
        }).then(async (res) => {
            const response = res as SymbolInfo;
            expect(response).to.contains.keys("documentation", "symbolKind");
            assert.strictEqual(response.documentation.parameters?.length, 2, "Invalid symbol documentation");
            assert.strictEqual(response.documentation.parameters[0].name, "receiver", "Invalid symbol documentation");
            done();
        }, error => {
            done(error);
        });
    });

    test("Test get project config", function (done): void {
        const uri = Uri.file(join(PROJECT_ROOT, 'helloServicePackage', 'Ballerina.toml')).toString();
        langClient.getBallerinaProjectConfigSchema({
            documentIdentifier: {
                uri
            },
        }).then(async (res) => {
            const response = res as PackageConfigSchema;
            expect(response).to.contains.keys("configSchema");
            assert.strictEqual(response.configSchema.$schema, "http://json-schema.org/draft-07/schema#", "Invalid project config");
            done();
        }, error => {
            done(error);
        });
    });

    test.skip("Test notebook support - get result for code snippet", function (done): void {
        langClient.getBalShellResult({
            source: "15*15"
        }).then((res) => {
            const response = res as NoteBookCellOutput;
            expect(response).to.contain.keys("shellValue", "errors", "diagnostics", "metaInfo", "consoleOut");

            assert.strictEqual(response.shellValue?.value, "225", "Invalid result from code snippet execution");
            done();
        }, error => {
            done(error);
        });
    });

    test.skip("Test notebook support - get file source", function (done): void {
        langClient.getShellBufferFilePath().then((res) => {
            const response = res as NotebookFileSource;
            expect(response).to.contain.keys("content", "filePath");

            expect(response.filePath).to.not.equal(null, "Shell file source is empty.");
            done();
        }, error => {
            done(error);
        });
    });

    test.skip("Test notebook support - notebook restart", function (done): void {
        langClient.restartNotebook().then((res) => {
            const response = res as boolean;
            assert.strictEqual(response, true, "Notebook not restarted correctly.");
            done();
        }, error => {
            done(error);
        });
    });

    test.skip("Test notebook support - get variable list", function (done): void {
        langClient.getBalShellResult({
            source: "int number = 10; string hello = \"hello world\";"
        }).then(async () => {
            const response = await langClient.getNotebookVariables() as NotebookVariable[];
            expect(response).to.be.an("array");
            assert.strictEqual(response.length, 2, "Variable list does not contain enough items.");
            expect(response[0]).to.contain.keys("name", "type", "value");
            const sorted = response.sort((val1, val2) => val1.name.localeCompare(val2.name));
            assert.strictEqual(sorted[0].name, "hello", "Variable value does not have correct name");
            assert.strictEqual(sorted[0].type, "string", "Variable value does not have correct type");
            assert.strictEqual(sorted[0].value, "\"hello world\"", "Variable value does not have correct value");
            assert.strictEqual(sorted[1].name, "number", "Variable value does not have correct name");
            assert.strictEqual(sorted[1].type, "int", "Variable value does not have correct type");
            assert.strictEqual(sorted[1].value, "10", "Variable value does not have correct value");
            done();
        }, error => {
            done(error);
        });
    });

    test.skip("Test notebook support - remove variables from memory", function (done): void {
        langClient.getBalShellResult({
            source: "int number = 10; string hello = \"hello world\""
        }).then(async () => {
            const response = await langClient.deleteDeclarations({
                varToDelete: "number"
            }) as boolean;
            assert.strictEqual(response, true, "Value has not removed from memory correctly.");

            // calling to get number to ensure it was deleted
            let res = await langClient.getBalShellResult({
                source: "number"
            }) as NoteBookCellOutput;
            expect(res).to.contain.keys("errors", "diagnostics", "metaInfo", "consoleOut");
            expect(res).to.not.contain.keys("shellValue");

            assert.notStrictEqual(res.errors, 0, "Invalid result from code snippet execution - should produce errors");
            assert.notStrictEqual(res.diagnostics, 0, "Invalid result from code snippet execution - should produce diagnostics");
            done();
        }, error => {
            done(error);
        });
    });

    test("Test Language Server Stop", (done) => {
        langClient.stop().then(() => {
            done();
        }, () => {
            done(new Error("Language Server stop failed"));
        });
    });
});
