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

import { Diagnostics, ProjectDiagnosticsResponse, STModification, SyntaxTree } from "@wso2/ballerina-core";
import { ExtendedLangClient } from "../../core";
import { Uri, workspace } from "vscode";
import { TextDocumentEdit } from "vscode-languageserver-types";
import { fileURLToPath } from "url";
import { writeBallerinaFileDidOpenTemp } from "../../utils/modification";

/** Marks errors whose cause is the package failing to compile, not an LS malfunction. */
export const PACKAGE_COMPILATION_FAILED_PREFIX = "Package compilation failed: ";

export async function attemptRepairProject(langClient: ExtendedLangClient, tempDir: string): Promise<Diagnostics[]> {
    // check project diagnostics
    let projectDiags: Diagnostics[] = await checkProjectDiagnostics(langClient, tempDir);
    let isDiagsChanged = await isModuleNotFoundDiagsExist(projectDiags, langClient);
    if (isDiagsChanged) {
        projectDiags = await checkProjectDiagnostics(langClient, tempDir);
    }

    isDiagsChanged = await addMissingImports(projectDiags, langClient);
    if (isDiagsChanged) {
        projectDiags = await checkProjectDiagnostics(langClient, tempDir);
    }

    isDiagsChanged = await removeUnusedImports(projectDiags, langClient);
    if (isDiagsChanged) {
        projectDiags = await checkProjectDiagnostics(langClient, tempDir);
    }
    return projectDiags;
}

export async function checkProjectDiagnostics(langClient: ExtendedLangClient, tempDir: string, isAISchema: boolean = false): Promise<Diagnostics[]> {
    const allDiags: Diagnostics[] = [];
    let projectUri = Uri.file(tempDir).toString();
    if (isAISchema) {
        projectUri = Uri.file(tempDir).with({ scheme: 'ai' }).toString();
    }
    const _diagStartMs = Date.now();
    console.log(`[DiagTiming] getProjectDiagnostics START — URI: ${projectUri}`);
    let response: ProjectDiagnosticsResponse = await langClient.getProjectDiagnostics({
        projectRootIdentifier: {
            uri: projectUri
        }
    });
    const _diagDurationMs = Date.now() - _diagStartMs;
    if (!response.errorDiagnosticMap) {
        console.log(`[DiagTiming] getProjectDiagnostics END — ${_diagDurationMs}ms — no errorDiagnosticMap (${response.errorMsg ?? "internal error"})`);
        // errorMsg carries the language server's reason — typically a package-compilation
        // failure (e.g. unresolvable dependencies), which callers surface to the user.
        throw new Error(response.errorMsg
            ? `${PACKAGE_COMPILATION_FAILED_PREFIX}${response.errorMsg}`
            : "Internal error while getting diagnostics from language server");
    }
    const _fileCount = Object.keys(response.errorDiagnosticMap).length;
    console.log(`[DiagTiming] getProjectDiagnostics END — ${_diagDurationMs}ms, ${_fileCount} files with errors`);
    
    if (Object.keys(response.errorDiagnosticMap).length === 0) {
        return [];
    }
    for (const [filePath, diagnostics] of Object.entries(response.errorDiagnosticMap)) {
        allDiags.push({ uri: filePath, diagnostics: diagnostics });
    }
    return allDiags;
}

export async function isModuleNotFoundDiagsExist(diagnosticsResult: Diagnostics[], langClient): Promise<boolean> {
    // Create a Map to store unique diagnostic messages and their corresponding diagnostic information
    const uniqueDiagnosticMap = new Map<string, { diagnostic: any, uri: string }>();

    // First pass: collect unique diagnostic messages across all files
    for (const diagResult of diagnosticsResult) {
        for (const diag of diagResult.diagnostics) {
            if (diag.code === "BCE2003" && !uniqueDiagnosticMap.has(diag.message)) {
                uniqueDiagnosticMap.set(diag.message, {
                    diagnostic: diag,
                    uri: diagResult.uri
                });
            }
        }
    }

    // If no BCE2003 diagnostics found, return false
    if (uniqueDiagnosticMap.size === 0) {
        return false;
    }

    // Process each unique diagnostic only once
    let projectModified = false;
    for (const [message, { uri }] of uniqueDiagnosticMap.entries()) {
        // Skip resolving dependencies for the invalid config import pattern
        if (message.includes("ballerinax/.config as config")) {
            continue;
        }

        const dependenciesResponse = await langClient.resolveModuleDependencies({
            documentIdentifier: {
                uri: uri
            }
        });

        const response = dependenciesResponse;
        if (!response.success) {
            throw new Error("Module resolving failed");
        }
        projectModified = true;
    }

    return projectModified;
}

export async function addMissingImports(diagnosticsResult: Diagnostics[], langClient: ExtendedLangClient): Promise<boolean> {
    let projectModified = false;
    for (const diag of diagnosticsResult) {
        const fielUri = diag.uri;
        const diagnostics = diag.diagnostics;

        // Find all BCE2000 diagnostics (undefined module errors)
        const bce2000Diagnostics = diagnostics.filter(d => d.code === "BCE2000");
        if (!bce2000Diagnostics.length) { continue; }

        // Filter to get unique diagnostics based on their message
        const uniqueDiagnosticMap = new Map();
        for (const diag of bce2000Diagnostics) {
            if (!uniqueDiagnosticMap.has(diag.message)) {
                uniqueDiagnosticMap.set(diag.message, diag);
            }
        }
        const uniqueDiagnostics = Array.from(uniqueDiagnosticMap.values());
        const astModifications: STModification[] = [];
        for (const diag of uniqueDiagnostics) {
            // Get code actions for the unique diagnostics
            const codeActions = await langClient.codeAction({
                textDocument: { uri: fielUri },
                range: {
                    start: diag.range.start,
                    end: diag.range.end
                },
                context: { diagnostics: diag }
            });
            // Find and apply the appropriate code action
            const action = codeActions.find(action => action.title && action.title.startsWith("Import module"));
            if (!action?.edit?.documentChanges?.length) { continue; }
            const docEdit = action.edit.documentChanges[0] as TextDocumentEdit;
            const edit = docEdit.edits[0];
            astModifications.push({
                startLine: edit.range.start.line,
                startColumn: edit.range.start.character,
                endLine: edit.range.end.line,
                endColumn: edit.range.end.character,
                type: "INSERT",
                isImport: false,
                config: { STATEMENT: edit.newText }
            });
        }

        // Apply modifications to syntax tree
        const syntaxTree = await langClient.stModify({
            documentIdentifier: { uri: fielUri },
            astModifications: astModifications
        });

        // Update file content
        const { source } = syntaxTree as SyntaxTree;
        if (!source) {
            // Handle the case where source is undefined, when compiler issue occurs
            return false;
        }
        const absolutePath = fileURLToPath(fielUri);
        writeBallerinaFileDidOpenTemp(absolutePath, source);
        if (astModifications.length > 0) {
            projectModified = true;
        }
    }

    return projectModified;
}

export async function removeUnusedImports(diagnosticsResult: Diagnostics[], langClient): Promise<boolean> {
    let projectModified = false;
    for (const diag of diagnosticsResult) {
        const fielUri = diag.uri;
        const diagnostics = diag.diagnostics;
        // Filter the unused import diagnostics
        const diagnostic = diagnostics.find(d => d.code === "BCE2002");
        if (!diagnostic) { continue; }
        const codeActions = await langClient.codeAction({
            textDocument: { uri: fielUri },
            range: {
                start: diagnostic.range.start,
                end: diagnostic.range.end
            },
            context: { diagnostics: [diagnostic] }
        });

        // Find and apply the appropriate code action
        const action = codeActions.find(action => action.title === "Remove all unused imports");
        if (!action?.edit?.documentChanges?.length) { continue; }
        const docEdit = action.edit.documentChanges[0] as TextDocumentEdit;

        // Apply modifications to syntax tree
        const syntaxTree = await langClient.stModify({
            documentIdentifier: { uri: docEdit.textDocument.uri },
            astModifications: docEdit.edits.map(edit => ({
                startLine: edit.range.start.line,
                startColumn: edit.range.start.character,
                endLine: edit.range.end.line,
                endColumn: edit.range.end.character,
                type: "INSERT",
                isImport: true,
                config: { STATEMENT: edit.newText }
            }))
        });

        // Update file content
        const { source } = syntaxTree as SyntaxTree;
        if (!source) {
            // Handle the case where source is undefined, when compiler issue occurs
            return false;
        }
        const absolutePath = fileURLToPath(fielUri);
        writeBallerinaFileDidOpenTemp(absolutePath, source);
        projectModified = true;
    }
    return projectModified;
}

export async function addMissingRequiredFields(
    diagnosticsResult: Diagnostics[],
    langClient: ExtendedLangClient
): Promise<boolean> {
    let projectModified = false;

    for (const diag of diagnosticsResult) {
        const fileUri = diag.uri;
        const diagnostics = diag.diagnostics;

        // Filter BCE2520 diagnostics (missing required record fields)
        const bce2520Diagnostics = diagnostics.filter(d => d.code === "BCE2520");
        if (!bce2520Diagnostics.length) {
            continue;
        }

        // Group diagnostics by their range (same location = same record literal)
        const diagnosticsByRange = new Map<string, typeof bce2520Diagnostics>();
        
        for (const d of bce2520Diagnostics) {
            const rangeKey = `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character}`;
            if (!diagnosticsByRange.has(rangeKey)) {
                diagnosticsByRange.set(rangeKey, []);
            }
            diagnosticsByRange.get(rangeKey)!.push(d);
        }

        const astModifications: STModification[] = [];

        // Process each group of diagnostics (one group per record literal)
        for (const [rangeKey, groupedDiagnostics] of diagnosticsByRange) {
            try {
                // Use the first diagnostic's range, but pass ALL diagnostics in the group
                const firstDiag = groupedDiagnostics[0];
                
                // Get code actions with ALL diagnostics for this location
                const codeActions = await langClient.codeAction({
                    textDocument: { uri: fileUri },
                    range: {
                        start: firstDiag.range.start,
                        end: firstDiag.range.end
                    },
                    context: { 
                        diagnostics: groupedDiagnostics, 
                        only: ['quickfix'],
                        triggerKind: 1
                    }
                });

                if (!codeActions?.length) {
                    console.warn(`No code actions returned for ${fileUri} at ${rangeKey}`);
                    continue;
                }

                // Find the action that fills required fields
                const action = codeActions.find(
                    action => action.title && action.title.includes("required fields")
                );

                if (!action?.edit?.documentChanges?.length) {
                    continue;
                }

                const docEdit = action.edit.documentChanges[0] as TextDocumentEdit;
                const edit = docEdit.edits[0];

                astModifications.push({
                    startLine: edit.range.start.line,
                    startColumn: edit.range.start.character,
                    endLine: edit.range.end.line,
                    endColumn: edit.range.end.character,
                    type: "INSERT",
                    isImport: false,
                    config: { STATEMENT: edit.newText }
                });
            } catch (err) {
                console.warn(`Could not apply code action for ${fileUri} at ${rangeKey}:`, err);
            }
        }

        // Apply modifications to syntax tree
        if (astModifications.length > 0) {
            const syntaxTree = await langClient.stModify({
                documentIdentifier: { uri: fileUri },
                astModifications: astModifications
            });

            // Update file content
            const { source } = syntaxTree as SyntaxTree;
            if (!source) {
                // Handle the case where source is undefined, when compiler issue occurs
                return false;
            }
            const absolutePath = fileURLToPath(fileUri);
            writeBallerinaFileDidOpenTemp(absolutePath, source);
            projectModified = true;
        }
    }

    return projectModified;
}

export async function addCheckExpressionErrors(
    diagnosticsResult: Diagnostics[],
    langClient: ExtendedLangClient
): Promise<boolean> {
    let projectModified = false;

    for (const diag of diagnosticsResult) {
        const fileUri = diag.uri;
        const diagnostics = diag.diagnostics;

        // Filter BCE3032 diagnostics (check expression errors)
        const checkExprDiagnostics = diagnostics.filter(d => d.code === "BCE3032");
        if (!checkExprDiagnostics.length) {
            continue;
        }

        // Process each diagnostic individually
        for (const diagnostic of checkExprDiagnostics) {
            try {
                // Get code actions for the diagnostic
                const codeActions = await langClient.codeAction({
                    textDocument: { uri: fileUri },
                    range: {
                        start: diagnostic.range.start,
                        end: diagnostic.range.end
                    },
                    context: {
                        diagnostics: [diagnostic],
                        only: ['quickfix'],
                        triggerKind: 1
                    }
                });

                if (!codeActions?.length) {
                    console.warn(`No code actions returned for ${fileUri} at line ${diagnostic.range.start.line}`);
                    continue;
                }

                // Find the action that adds error to return type
                const action = codeActions.find(
                    action => action.title && (
                        action.title.toLowerCase().includes("change") &&
                        action.title.toLowerCase().includes("return") &&
                        action.title.toLowerCase().includes("error")
                    )
                );

                if (!action?.edit?.documentChanges?.length) {
                    continue;
                }

                const docEdit = action.edit.documentChanges[0] as TextDocumentEdit;

                // Apply modifications to syntax tree
                const syntaxTree = await langClient.stModify({
                    documentIdentifier: { uri: docEdit.textDocument.uri },
                    astModifications: docEdit.edits.map(edit => ({
                        startLine: edit.range.start.line,
                        startColumn: edit.range.start.character,
                        endLine: edit.range.end.line,
                        endColumn: edit.range.end.character,
                        type: "INSERT",
                        isImport: false,
                        config: { STATEMENT: edit.newText }
                    }))
                });

                // Update file content
                const { source } = syntaxTree as SyntaxTree;
                if (!source) {
                    // Handle the case where source is undefined, when compiler issue occurs
                    return false;
                }
                const absolutePath = fileURLToPath(fileUri);
                writeBallerinaFileDidOpenTemp(absolutePath, source);
                projectModified = true;
            } catch (err) {
                console.warn(`Could not apply code action for ${fileUri} at line ${diagnostic.range.start.line}:`, err);
            }
        }
    }
    return projectModified;
}
