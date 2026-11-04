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
import { REQ_KEY } from "../../../rpc-managers/ai-panel/constants";

const LISTING_MAX_CHARS = 16_000;

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

/**
 * Collects files from a ProjectSource, split into regular files and generated connector files.
 * Paths are posix, prefixed with the package path when `includePackagePath` is set.
 */
function collectFilesFromProject(
    project: ProjectSource,
    includePackagePath: boolean = false
): { files: SourceFile[]; generatedFiles: SourceFile[] } {
    const files: SourceFile[] = [];
    const generatedFiles: SourceFile[] = [];
    const packagePath = project.packagePath?.replace(/\\/g, "/");
    const prefix = includePackagePath && packagePath ? `${packagePath}/` : "";

    for (const sourceFile of project.sourceFiles) {
        // The requirements entry is not a file; the Natural Programming note carries its text.
        if (sourceFile.filePath === REQ_KEY) {
            continue;
        }
        files.push({
            filePath: `${prefix}${sourceFile.filePath}`,
            content: sourceFile.content,
        });
    }

    // Collect module files — generated modules go to generatedFiles (paths only)
    if (project.projectModules) {
        for (const module of project.projectModules) {
            for (const sourceFile of module.sourceFiles) {
                if (module.isGenerated) {
                    generatedFiles.push({
                        filePath: `${prefix}generated/${module.moduleName}/${sourceFile.filePath}`,
                        content: "",
                    });
                } else {
                    // getProjectSource stores module files under their bare name; without the
                    // prefix the agent is told they sit at the package root.
                    files.push({
                        filePath: `${prefix}modules/${module.moduleName}/${sourceFile.filePath}`,
                        content: sourceFile.content,
                    });
                }
            }
        }
    }

    if (project.projectTests) {
        for (const testFile of project.projectTests) {
            files.push({
                filePath: `${prefix}tests/${testFile.filePath.replace(/\\/g, "/")}`,
                content: testFile.content,
            });
        }
    }

    return { files, generatedFiles };
}

function countLines(content: string): number {
    // Same count as file_read reports, so a listed line count is a valid offset bound.
    return content.length === 0 ? 0 : content.split("\n").length;
}

function formatConfigFiles(tempProjectPath: string | undefined, project: ProjectSource, isWorkspace: boolean): string {
    if (!tempProjectPath) {
        return "";
    }
    const pkgRoot = isWorkspace && project.packagePath
        ? path.join(tempProjectPath, project.packagePath)
        : tempProjectPath;
    const mainConfig = fs.existsSync(path.join(pkgRoot, "Config.toml")) ? "present" : "absent";
    const testConfig = fs.existsSync(path.join(pkgRoot, "tests", "Config.toml")) ? "present" : "absent";
    return `<config_files main="${mainConfig}" tests="${testConfig}"/>`;
}

/** Files with line counts but no contents; the agent reads what it needs with glob, grep and file_read. */
export function formatCodebaseStructure(projects: ProjectSource[], tempProjectPath?: string): string {
    let text = "<codebase_structure>\n";
    text += "The project's Ballerina source and config files with their line counts. ";
    text += "Contents are not included, and other files (OpenAPI specs, SQL, data) are not listed: ";
    text += "use glob, grep and file_read.\n\n";

    const context = StateMachine.context();
    const isWorkspace = context.projectInfo?.projectKind === PROJECT_KIND.WORKSPACE_PROJECT;

    if (isWorkspace && tempProjectPath) {
        text += formatWorkspaceToml(tempProjectPath);
    }

    // A workspace opened at its root has no active package; then none is listed in full or marked active.
    const activeProject = projects.find(project => project.isActive) ?? (isWorkspace ? undefined : projects[0]);

    // Other packages are charged first and never dropped: one short line each, and the prompt tells the model they are here.
    for (const project of projects) {
        if (project === activeProject) {
            continue;
        }
        const { files, generatedFiles } = collectFilesFromProject(project, isWorkspace);
        const packagePath = project.packagePath?.replace(/\\/g, "/") ?? "";
        text += `<package name="${escapeXmlText(project.projectName)}" path="${escapeXmlText(packagePath)}" files="${files.length + generatedFiles.length}">${formatConfigFiles(tempProjectPath, project, isWorkspace)}</package>\n`;
    }

    let budget = LISTING_MAX_CHARS - text.length;
    let unlisted = 0;
    const listWithinBudget = (entries: string[]): number => {
        for (let i = 0; i < entries.length; i++) {
            if (unlisted > 0 || entries[i].length + 1 > budget) {
                return entries.length - i;
            }
            budget -= entries[i].length + 1;
            text += `${entries[i]}\n`;
        }
        return 0;
    };

    if (activeProject) {
        const { files, generatedFiles } = collectFilesFromProject(activeProject, isWorkspace);
        text += `<project name="${escapeXmlText(activeProject.projectName)}" active="true">\n<files>\n`;
        unlisted += listWithinBudget(files.map(file => `<file path="${escapeXmlText(file.filePath)}" lines="${countLines(file.content)}"/>`));
        text += "</files>\n";
        if (generatedFiles.length > 0 && unlisted > 0) {
            unlisted += generatedFiles.length;
        } else if (generatedFiles.length > 0) {
            text += "<generated_files>\n";
            unlisted += listWithinBudget(generatedFiles.map(file => `<file path="${escapeXmlText(file.filePath)}"/>`));
            text += "</generated_files>\n";
        }
        const configFiles = formatConfigFiles(tempProjectPath, activeProject, isWorkspace);
        text += configFiles ? `${configFiles}\n` : "";
        text += "</project>\n";
    }

    if (unlisted > 0) {
        text += `… ${unlisted} more files not listed. Use glob to find them.\n`;
    }
    text += isWorkspace ? "</codebase_structure>\n" : "</codebase_structure>";

    if (isWorkspace && activeProject) {
        text += `Note: This is a Ballerina workspace with multiple packages. File paths are prefixed with their package paths (e.g., "mainpackage/main.bal").
Only the active package's files are listed; each other package is a <package> entry, so use glob to find its files.
You can import another package by its package name (e.g., import otherpackage;).
When creating or modifying files, you should always prefer making edits for the current active package. Make sure to include the package path as prefix for the file edits.`;
    } else if (isWorkspace) {
        text += `Note: This is a Ballerina workspace with multiple packages. File paths are prefixed with their package paths (e.g., "mainpackage/main.bal").
No package is active, so each package is a <package> entry: use glob to find its files, and work in the package the request is about.
You can import another package by its package name (e.g., import otherpackage;).
Make sure to include the package path as prefix for the file edits.`;
    }

    return text;
}

/**
 * Reads the workspace root Ballerina.toml and formats it as XML for the codebase structure.
 * Only applicable for workspace projects (containing [workspace] section).
 * @param tempProjectPath Path to the temporary project directory
 * @returns Formatted XML string with workspace config, or empty string if not found
 */
function formatWorkspaceToml(tempProjectPath: string): string {
    const tomlPath = path.join(tempProjectPath, "Ballerina.toml");
    if (!fs.existsSync(tomlPath)) {
        return "";
    }
    try {
        const content = fs.readFileSync(tomlPath, "utf-8");
        return `<workspace_config path="Ballerina.toml">\n${content}\n</workspace_config>\n\n`;
    } catch (error) {
        console.warn("[formatWorkspaceToml] Error reading workspace Ballerina.toml:", error);
        return "";
    }
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
