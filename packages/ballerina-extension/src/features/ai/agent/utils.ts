// Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import { SourceFile, FileChanges, CodeContext, ProjectSource, ExecutionContext, PROJECT_KIND } from "@wso2/ballerina-core";
import { addToIntegration } from "../../../rpc-managers/ai-panel/utils";
import * as fs from "fs";
import * as path from "path";
import type { TextEdit } from "vscode-languageserver-protocol";
import { StateMachine } from "../../../stateMachine";
import { normalizeToLf, readAndNormalize, restoreEol } from "../utils/eol-utils";
import { isWorkspaceTempProject } from "./tools/path-utils";
import { escapeXmlText } from "../migration/project-map-format";

/**
 * Files that require path sanitization (temp paths replaced with workspace paths)
 */
const FILES_REQUIRING_PATH_SANITIZATION = ["Ballerina.toml"];

/**
 * Sanitizes temp directory paths in file content by replacing them with workspace paths
 * @param content File content that may contain temp directory paths
 * @param tempPath Temporary project path to be replaced
 * @param workspacePath Workspace path to replace with
 * @returns Sanitized content with workspace paths
 */
function sanitizeTempPaths(content: string, tempPath: string, workspacePath: string): string {
    // Normalize paths to forward slashes for consistent replacement
    const normalizedTempPath = tempPath.replace(/\\/g, "/");
    const normalizedWorkspacePath = workspacePath.replace(/\\/g, "/");

    // Replace all occurrences of temp path with workspace path
    return content.replace(new RegExp(normalizedTempPath, "g"), normalizedWorkspacePath);
}

/**
 * Integrates code from temp directory to workspace
 * @param tempProjectPath Path to the temporary project directory
 * @param modifiedFiles Set of file paths that were actually modified during the sessionDependencies.toml
 * @param ctx Execution context containing project paths
 */
export async function integrateCodeToWorkspace(
    tempProjectPath: string,
    modifiedFiles: Set<string> | undefined,
    ctx: ExecutionContext
): Promise<void> {
    if (!tempProjectPath) {
        console.log("[Agent Integration] No temp project path provided");
        return;
    }

    if (!fs.existsSync(tempProjectPath)) {
        console.warn("[Agent Integration] Temp project path does not exist:", tempProjectPath);
        return;
    }

    let workspaceFolderPath = ctx.projectPath;
    const workspacePath = ctx.workspacePath;
    if (workspacePath) {
        workspaceFolderPath = workspacePath;
    }

    const fileChanges: FileChanges[] = [];

    if (modifiedFiles && modifiedFiles.size > 0) {
        for (const relativePath of modifiedFiles) {
            const fullPath = path.join(tempProjectPath, relativePath);

            if (fs.existsSync(fullPath)) {
                let content = fs.readFileSync(fullPath, "utf-8");

                // Check if this file requires path sanitization
                const fileName = path.basename(relativePath);
                if (FILES_REQUIRING_PATH_SANITIZATION.includes(fileName)) {
                    content = sanitizeTempPaths(content, tempProjectPath, workspaceFolderPath);
                    console.log(`[Agent Integration] Sanitized temp paths in: ${relativePath}`);
                }

                fileChanges.push({
                    filePath: relativePath,
                    content: content,
                });
                console.log(`[Agent Integration] Prepared modified file: ${relativePath}`);
            } else {
                fileChanges.push({
                    filePath: relativePath,
                    content: "",
                    deleted: true,
                });
                console.log(`[Agent Integration] Prepared deleted file: ${relativePath}`);
            }
        }
    } else {
        console.log("[Agent Integration] No modified files to integrate");
    }

    if (fileChanges.length === 0) {
        console.warn("[Agent Integration] No files found in temp project");
        return;
    }

    try {
        console.log(`[Agent Integration] Integrating ${fileChanges.length} file(s) from temp project...`);
        await addToIntegration(workspaceFolderPath, fileChanges);
        console.log("[Agent Integration] Successfully integrated code");
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("[Agent Integration] Failed:", errorMessage);
        throw new Error(`Failed to integrate code to workspace: ${errorMessage}`);
    }
}

export function getCodeBlocks(updatedSourceFiles: SourceFile[], updatedFileNames: string[]): string {
    const codeBlocks = updatedFileNames
        .map((fileName) => {
            const sourceFile = updatedSourceFiles.find((sf) => sf.filePath === fileName);
            if (!sourceFile) {
                return null;
            }

            return `<code filename="${sourceFile.filePath}">
\`\`\`ballerina
${sourceFile.content}
\`\`\`
</code>`;
        })
        .filter((block): block is string => block !== null);

    return codeBlocks.join("\n\n");
}

/** No file contents or listing are sent, so this names the package for imports, or a workspace's packages. */
export function formatProjectLayout(projects: ProjectSource[]): string {
    const isWorkspace = StateMachine.context().projectInfo?.projectKind === PROJECT_KIND.WORKSPACE_PROJECT;
    if (!isWorkspace) {
        const name = projects[0] ? escapeXmlText(projects[0].projectName) : "";
        return name
            ? `<project_layout>\nThis is the Ballerina package "${name}". Import one of its modules, such as a generated connector under generated/moduleName, as: import ${name}.moduleName;\n</project_layout>`
            : "";
    }
    const packages = projects.map(project =>
        `- ${escapeXmlText(project.packagePath?.replace(/\\/g, "/") || ".")} (package ${escapeXmlText(project.projectName)})${project.isActive ? ", active" : ""}`);
    return [
        "<workspace_layout>",
        "This is a Ballerina workspace. File paths start with the package path (e.g. \"mainpackage/main.bal\"). Its packages:",
        ...packages,
        projects.some(project => project.isActive)
            ? "Prefer edits in the active package."
            : "No package is active: work in the package the request is about.",
        "Import another package by its name (e.g. import otherpackage;).",
        "</workspace_layout>",
    ].join("\n");
}

/** The turn's project block: a caller's codebase map (migration), or the layout note. */
export function getProjectBlock(projects: ProjectSource[], codebase?: { omitCodebaseDump?: boolean; codebaseMapText?: string }): string {
    return codebase?.omitCodebaseDump ? codebase.codebaseMapText ?? "" : formatProjectLayout(projects);
}

/**
 * Converts a Position (line, character) to absolute character offset in content
 * @param content File content as string
 * @param line Zero-based line number
 * @param character Zero-based character offset within the line
 * @returns Absolute character offset in the content string
 */
function positionToOffset(content: string, line: number, character: number): number {
    const lines = content.split('\n');
    let offset = 0;

    // Add lengths of all previous lines (including their \n)
    for (let i = 0; i < line && i < lines.length; i++) {
        offset += lines[i].length + 1; // +1 for the newline character
    }

    // Add character offset within the target line
    if (line < lines.length) {
        offset += Math.min(character, lines[line].length);
    }

    return offset;
}

/**
 * Computes the result of applying LSP text edits to a file, using a character
 * offset-based approach for robust handling of all edge cases. Reads the file's current
 * disk content (if it exists) to apply the edits against, but does not write anything —
 * callers persist the returned content themselves (e.g. via addToIntegration), so the
 * write goes through VS Code's document model rather than a raw fs write.
 * @param filePath Absolute path to the file
 * @param textEdits Array of LSP TextEdit objects (positions are 0-based)
 * @returns The file content after applying all edits, with original line endings restored
 */
export async function applyTextEdits(filePath: string, textEdits: TextEdit[]): Promise<string> {
    // Read existing content or start with empty string
    let content = '';
    let originalEol: import("../utils/eol-utils").EolSequence = '\n';
    if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        [content, originalEol] = readAndNormalize(raw);
    }

    // If file is new and empty, ensure at least empty content
    // This handles edits at position (0,0) for new files
    if (content === '' && textEdits.length > 0) {
        const firstEdit = textEdits[0];
        // If editing beyond (0,0) in an empty file, pad with newlines
        if (firstEdit.range.start.line > 0) {
            content = '\n'.repeat(firstEdit.range.start.line);
        }
    }

    // Convert edits to offset-based edits and sort in reverse order
    // Sorting in reverse ensures earlier edits don't affect offsets of later edits
    // Ties are applied last-first so inserts at the same position keep the order given.
    const offsetEdits = textEdits.map((edit, index) => ({
        start: positionToOffset(content, edit.range.start.line, edit.range.start.character),
        end: positionToOffset(content, edit.range.end.line, edit.range.end.character),
        newText: edit.newText,
        index
    })).sort((a, b) => b.start - a.start || b.index - a.index); // Reverse order by start position

    // Apply edits from end to start (preserves offsets)
    let result = content;
    for (const edit of offsetEdits) {
        result = result.substring(0, edit.start) + edit.newText + result.substring(edit.end);
    }

    return restoreEol(result, originalEol);
}

/**
 * Formats code context with surrounding lines (3 before, 3 after) in XML format
 * @param codeContext The code context (addition or selection type) with relative file path from workspace root
 * @param tempProjectPath The temporary project directory path
 * @returns Formatted XML string with file content and context
 */
export function formatCodeContext(codeContext: CodeContext, tempProjectPath: string = ''): string {
    const absolutePath = tempProjectPath
        ? path.join(tempProjectPath, codeContext.filePath)
        : codeContext.filePath;

    if (!fs.existsSync(absolutePath)) {
        console.warn(`[formatCodeContext] File not found in temp project: ${absolutePath}`);
        return '';
    }

    const fileContent = normalizeToLf(fs.readFileSync(absolutePath, "utf-8"));
    const lines = fileContent.split("\n");
    const totalLines = lines.length;

    let startLine: number;
    let endLine: number;
    let markerLine: number | undefined;

    if (codeContext.type === "addition") {
        // For addition: show 3 lines before and after the insertion point
        const insertLine = codeContext.position.line;
        startLine = Math.max(0, insertLine - 3);
        endLine = Math.min(totalLines - 1, insertLine + 3);
        markerLine = insertLine;
    } else {
        // For selection: show 3 lines before start and 3 lines after end
        const selectionStart = codeContext.startPosition.line;
        const selectionEnd = codeContext.endPosition.line;
        startLine = Math.max(0, selectionStart - 3);
        endLine = Math.min(totalLines - 1, selectionEnd + 3);
    }

    // Build the context snippet
    const contextLines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
        const lineContent = lines[i] || "";

        if (codeContext.type === "addition" && i === markerLine) {
            contextLines.push(lineContent);
            contextLines.push(`>>> Cursor Position <<<`);
        } else if (codeContext.type === "selection") {
            // Add selection start marker before the first selected line
            if (i === codeContext.startPosition.line) {
                contextLines.push(`>>> SELECTION START <<<`);
            }
            contextLines.push(lineContent);
            // Add selection end marker after the last selected line
            if (i === codeContext.endPosition.line) {
                contextLines.push(`>>> SELECTION END <<<`);
            }
        } else {
            contextLines.push(lineContent);
        }
    }

    return `
** Note: ${getCodeContextInstruction(codeContext.type)} **
<selected_code>
<file path="${codeContext.filePath}" lines="${startLine + 1}-${endLine + 1}">
${contextLines.join("\n")}
</file>
</selected_code>`;
}

function getCodeContextInstruction(type: "addition" | "selection"): string {
    if (type === "addition") {
        return "The user has indicated a cursor position where new code can be added. The cursor position is marked with >>> Cursor Position <<< in the code context below.";
    } else {
        return "The user has selected a block of code that is relevant to the current task. The selected code is enclosed between >>> SELECTION START <<< and >>> SELECTION END <<< markers in the code context below.";
    }
}


export function solveRelativeTempPath(servicePath: string): { tempProjectPath: string; packagePath?: string } | undefined {
    if (!servicePath || !path.isAbsolute(servicePath)) {
        return undefined;
    }

    const normalizedServicePath = path.normalize(servicePath);
    const parsedPath = path.parse(normalizedServicePath);
    const relativeFromRoot = normalizedServicePath.slice(parsedPath.root.length);
    const segments = relativeFromRoot.split(path.sep).filter(Boolean);
    const tempRootIdx = segments.findIndex((segment) => segment.startsWith("bal-proj-"));

    if (tempRootIdx === -1) {
        return undefined;
    }

    const tempProjectPath = path.join(parsedPath.root, ...segments.slice(0, tempRootIdx + 1));
    if (!fs.existsSync(tempProjectPath)) {
        return undefined;
    }

    const packagePath = isWorkspaceTempProject(tempProjectPath)
        ? path.relative(tempProjectPath, normalizedServicePath)
        : undefined;

    if (packagePath && (packagePath === ".." || packagePath.startsWith(`..${path.sep}`) || path.isAbsolute(packagePath))) {
        return undefined;
    }

    return { tempProjectPath, packagePath };
}
