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
import React from "react";

import { NodePosition } from "@wso2/syntax-tree";
import { LangClientRpcClient } from "@wso2/ballerina-rpc-client";
import { DiagnosticData, DiagnosticsResponse } from "@wso2/ballerina-core";
import { Codicon, Tooltip, Typography } from "@wso2/ui-toolkit";
import * as monaco from "monaco-editor";

export const FILE_SCHEME = "file://";
export const EXPR_SCHEME = "expr://";

export function getUpdatedSource(
    statement: string,
    currentFileContent: string,
    targetPosition: NodePosition,
    moduleList?: Set<string>,
    skipSemiColon?: boolean
): string {
    const updatedStatement = skipSemiColon ? statement : statement.trim().endsWith(";") ? statement : statement + ";";
    return addToTargetPosition(currentFileContent, targetPosition, updatedStatement);
}

function addToTargetPosition(currentContent: string, position: NodePosition, codeSnippet: string): string {
    const eol = currentContent.includes("\r\n") ? "\r\n" : "\n";
    const splitContent: string[] = currentContent.split(/\r?\n/g) || [];
    const splitCodeSnippet: string[] = codeSnippet.trimEnd().split(/\r?\n/g) || [];
    const noOfLines: number = position.endLine - position.startLine + 1;
    const startLine = splitContent[position.startLine].slice(0, position.startColumn);
    const endLine = isFinite(position?.endLine)
        ? splitContent[position.endLine].slice(position.endColumn || position.startColumn)
        : "";

    const replacements = splitCodeSnippet.map((line, index) => {
        let modifiedLine = line;
        if (index === 0) {
            modifiedLine = startLine + modifiedLine;
        }
        if (index === splitCodeSnippet.length - 1) {
            modifiedLine = modifiedLine + endLine;
        }
        if (index > 0) {
            modifiedLine = " ".repeat(position.startColumn) + modifiedLine;
        }
        return modifiedLine;
    });

    splitContent.splice(position.startLine, noOfLines, ...replacements);

    return splitContent.join(eol);
}

export async function checkDiagnostics(
    path: string,
    updatedContent: string,
    langServerRpcClient: LangClientRpcClient
): Promise<DiagnosticData[]> {
    const fileURI = monaco.Uri.file(path).toString().replace(FILE_SCHEME, EXPR_SCHEME);
    await sendDidChange(fileURI, updatedContent, langServerRpcClient);
    return handleDiagnostics(fileURI, langServerRpcClient);
}

async function getDiagnostics(docUri: string, langServerRpcClient: LangClientRpcClient): Promise<DiagnosticsResponse> {
    const diagnostics = await langServerRpcClient.getDiagnostics({
        documentIdentifier: {
            uri: docUri,
        },
    });

    return diagnostics;
}

const handleDiagnostics = async (
    fileURI: string,
    langServerRpcClient: LangClientRpcClient
): Promise<DiagnosticData[]> => {
    const diagResp = await getDiagnostics(fileURI, langServerRpcClient);
    const diag = diagResp?.diagnostics ? diagResp.diagnostics : [];
    return diag;
};

async function sendDidChange(docUri: string, content: string, langServerRpcClient: LangClientRpcClient) {
    langServerRpcClient.didChange({
        contentChanges: [
            {
                text: content,
            },
        ],
        textDocument: {
            uri: docUri,
            version: 1,
        },
    });
}

export function getTooltipIconComponent(title: string): React.ReactNode {
    return (
        <Tooltip content={<Typography variant="body1">{title}</Typography>} position="bottom-end">
            <Codicon name="info" />
        </Tooltip>
    );
}
