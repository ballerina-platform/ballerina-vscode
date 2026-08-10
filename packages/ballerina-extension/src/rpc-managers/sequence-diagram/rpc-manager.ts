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
 * 
 * THIS FILE INCLUDES AUTO GENERATED CODE
 */
import { SequenceDiagramAPI, SequenceModelRequest, SequenceModelResponse } from "@wso2/ballerina-core";
import { Uri } from "vscode";
import { StateMachine } from "../../stateMachine";
import { isAiSourceParseable } from "../diagram-validity";

export class SequenceDiagramRpcManager implements SequenceDiagramAPI {
    async getSequenceModel(): Promise<SequenceModelResponse> {
        return new Promise((resolve) => {
            const context = StateMachine.context();
            if (!context.position) {
                resolve(undefined);
            }
            const params: SequenceModelRequest = {
                filePath: Uri.file(context.documentUri!).fsPath,
                startLine: {
                    line: context.position.startLine ?? 0,
                    offset: context.position.startColumn ?? 0,
                },
                endLine: {
                    line: context.position.endLine ?? 0,
                    offset: context.position.endColumn ?? 0,
                },
            };
            console.log(">>> requesting sequence model from backend ...", params);
            StateMachine.langClient()
                .getSequenceDiagramModel(params)
                .then(async (model) => {
                    console.log(">>> sequence model from backend:", model);
                    if (model && !(await isAiSourceParseable([params.filePath]))) {
                        resolve(undefined);
                        return;
                    }
                    if (model) {
                        resolve(model);
                    }
                    resolve(undefined);
                })
                .catch((error) => {
                    console.log(">>> ERROR from backend:", error);
                    resolve(undefined);
                });
        });
    }
}
