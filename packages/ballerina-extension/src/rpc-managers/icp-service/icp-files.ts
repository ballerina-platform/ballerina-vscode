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

// The project files behind the ICP toggle (main.bal imports, Ballerina.toml), kept free of
// vscode imports so they can be unit tested.

import * as fs from 'fs';
import * as path from 'path';
import type { TextEdit } from "@wso2/ballerina-core";
import { parse } from "@iarna/toml";
import { addICPBuildOptions, hasICPBuildOptions } from "./build-options";

export const ICP_BRIDGE_IMPORT = 'import wso2/icp.runtime.bridge as _;';

export const ICP_IMPORTS = [
    ICP_BRIDGE_IMPORT,
    'import ballerinax/metrics.logs as _;',
];

export function mainBalPathOf(projectPath: string): string {
    return path.join(projectPath, 'main.bal');
}

export function ballerinaTomlPathOf(projectPath: string): string {
    return path.join(projectPath, 'Ballerina.toml');
}

export function configTomlPathOf(projectPath: string): string {
    return path.join(projectPath, 'Config.toml');
}

/**
 * Throws if the toggle could not finish, so it fails before writing anything rather than
 * after the imports are already in main.bal.
 */
export function checkCanToggleICP(
    projectPath: string,
    isUnsaved: (filePath: string) => boolean,
    enabling: boolean
): void {
    const tomlPath = ballerinaTomlPathOf(projectPath);
    if (!fs.existsSync(tomlPath)) {
        throw new Error(`Ballerina.toml not found in ${projectPath}`);
    }
    // The toggle edits these files from what is on disk: an unsaved buffer would misplace the
    // import edits, have its own changes saved with them, or overwrite the toml writes later.
    const toggledFiles = [mainBalPathOf(projectPath), ballerinaTomlPathOf(projectPath), configTomlPathOf(projectPath)];
    for (const filePath of toggledFiles) {
        if (isUnsaved(filePath)) {
            throw new Error(`${filePath} has unsaved changes. Save it and try again.`);
        }
    }
    // Both toggles rewrite Config.toml through a parser, so one that does not parse would fail
    // only after main.bal and Ballerina.toml were already changed.
    const configPath = configTomlPathOf(projectPath);
    if (fs.existsSync(configPath)) {
        try {
            parse(fs.readFileSync(configPath, 'utf-8'));
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(`${configPath} is not valid TOML. Fix it and try again. ${reason}`);
        }
    }
    // The same build-options edit enabling makes, run without writing, so a manifest it refuses
    // (an inline build-options) is refused before the imports go in.
    if (enabling) {
        addICPBuildOptions(fs.readFileSync(tomlPath, 'utf-8'));
    }
}

interface ImportDeclaration {
    start: number;
    end: number;
    text: string;
}

// Spacing never changes an import, so `import  wso2/icp.runtime.bridge as _ ;` still matches.
function normalizeImport(text: string): string {
    return text.replace(/\s+/g, ' ').replace(/\s*([/.;])\s*/g, '$1').trim();
}

/**
 * The import declarations at the top of a .bal file, as offsets into it. Imports come before
 * every other module-level declaration, so the scan skips whitespace and comments and stops at
 * the first thing that is not an import: commented-out imports and import-like text further
 * down are never taken as present.
 */
function importDeclarations(content: string): ImportDeclaration[] {
    const declarations: ImportDeclaration[] = [];
    let pos = content.charCodeAt(0) === 0xFEFF ? 1 : 0;
    while (pos < content.length) {
        if (/\s/.test(content[pos])) {
            pos++;
        } else if (content.startsWith('//', pos)) {
            const newline = content.indexOf('\n', pos);
            pos = newline === -1 ? content.length : newline + 1;
        } else if (/^import\b/.test(content.slice(pos, pos + 7))) {
            const semicolon = content.indexOf(';', pos);
            if (semicolon === -1) {
                break;
            }
            declarations.push({ start: pos, end: semicolon + 1, text: content.slice(pos, semicolon + 1) });
            pos = semicolon + 1;
        } else {
            break;
        }
    }
    return declarations;
}

function isICPImport(declaration: ImportDeclaration, importLine: string): boolean {
    return normalizeImport(declaration.text) === normalizeImport(importLine);
}

function hasImport(content: string, importLine: string): boolean {
    return importDeclarations(content).some(declaration => isICPImport(declaration, importLine));
}

function isBlank(char: string): boolean {
    return char === ' ' || char === '\t';
}

function positionAt(content: string, offset: number): { line: number; character: number } {
    const before = content.slice(0, offset);
    const line = before.split('\n').length - 1;
    return { line, character: offset - (before.lastIndexOf('\n') + 1) };
}

/**
 * ICP is on only when both halves are in place: the bridge import in main.bal and the build
 * options in Ballerina.toml. Checking only the import reports a half-done enable as enabled.
 */
export function isICPEnabledOnDisk(projectPath: string): boolean {
    try {
        const mainBal = fs.readFileSync(mainBalPathOf(projectPath), 'utf-8');
        const manifest = fs.readFileSync(ballerinaTomlPathOf(projectPath), 'utf-8');
        return hasImport(mainBal, ICP_BRIDGE_IMPORT) && hasICPBuildOptions(manifest);
    } catch {
        return false;
    }
}

/**
 * The edits that add the missing ICP imports after the last import of main.bal. A missing
 * main.bal gets an insertion at the start, for the caller to create the file with.
 */
export function buildAddImportsTextEdits(projectPath: string): { [key: string]: TextEdit[] } {
    const mainBalPath = mainBalPathOf(projectPath);
    const content = fs.existsSync(mainBalPath) ? fs.readFileSync(mainBalPath, 'utf-8') : '';

    const missingImports = ICP_IMPORTS.filter(imp => !hasImport(content, imp));
    if (missingImports.length === 0) {
        return {};
    }

    // Written with the file's own line ending, so a CRLF main.bal gets no LF-only lines.
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const imports = missingImports.join(eol);
    const declarations = importDeclarations(content);
    const lastImport = declarations[declarations.length - 1];
    const newline = lastImport ? content.indexOf('\n', lastImport.end) : -1;
    const restOfLine = lastImport
        ? content.slice(lastImport.end, newline === -1 ? content.length : newline).trim()
        : '';
    let position = { line: 0, character: 0 };
    let newText = imports + eol;
    if (lastImport && restOfLine !== '' && !restOfLine.startsWith('//')) {
        // Source follows the last import on its line: imports must come before it, so the new
        // ones go straight after that import rather than on the next line.
        position = positionAt(content, lastImport.end);
        newText = eol + imports + eol;
    } else if (lastImport && newline === -1) {
        // The last import ends the file with no newline: a position past the last line would be
        // clamped to its end, gluing the new imports onto it.
        position = positionAt(content, content.length);
        newText = eol + imports;
    } else if (lastImport) {
        position = { line: positionAt(content, newline).line + 1, character: 0 };
    }
    return { [mainBalPath]: [{ range: { start: position, end: position }, newText }] };
}

/**
 * The edits that remove every ICP import from main.bal. An import that shares its lines with
 * nothing but other ICP imports and a trailing comment takes the whole lines with it; one that
 * shares them with other source is cut out alone, leaving that source in place.
 */
export function buildRemoveImportsTextEdits(projectPath: string): { [key: string]: TextEdit[] } {
    const mainBalPath = mainBalPathOf(projectPath);
    if (!fs.existsSync(mainBalPath)) {
        return {};
    }

    const content = fs.readFileSync(mainBalPath, 'utf-8');
    const icpImports = importDeclarations(content)
        .filter(declaration => ICP_IMPORTS.some(imp => isICPImport(declaration, imp)));

    // Group the ICP imports by the lines they span, so each group is decided as a whole.
    const groups: { start: number; end: number; imports: ImportDeclaration[] }[] = [];
    for (const declaration of icpImports) {
        const start = content.lastIndexOf('\n', declaration.start - 1) + 1;
        const newline = content.indexOf('\n', declaration.end);
        const end = newline === -1 ? content.length : newline + 1;
        const last = groups[groups.length - 1];
        if (last && start < last.end) {
            last.end = Math.max(last.end, end);
            last.imports.push(declaration);
        } else {
            groups.push({ start, end, imports: [declaration] });
        }
    }

    const ranges: { start: number; end: number }[] = [];
    for (const group of groups) {
        let rest = '';
        let cursor = group.start;
        for (const declaration of group.imports) {
            rest += content.slice(cursor, declaration.start);
            cursor = declaration.end;
        }
        rest += content.slice(cursor, group.end);
        if (rest.split('\n').every(line => line.trim() === '' || line.trim().startsWith('//'))) {
            ranges.push({ start: group.start, end: group.end });
            continue;
        }
        for (const declaration of group.imports) {
            let start = declaration.start;
            let end = declaration.end;
            while (end < content.length && isBlank(content[end])) {
                end++;
            }
            // Last on its line: take the spacing before it instead, so none is left trailing.
            if (end === content.length || content[end] === '\n' || content[end] === '\r') {
                end = declaration.end;
                while (start > 0 && isBlank(content[start - 1])) {
                    start--;
                }
            }
            const previous = ranges[ranges.length - 1];
            if (previous && previous.end >= start) {
                previous.end = Math.max(previous.end, end);
            } else {
                ranges.push({ start, end });
            }
        }
    }

    if (ranges.length === 0) {
        return {};
    }

    // Last first, so applying one removal doesn't shift the ones still to apply.
    const edits: TextEdit[] = ranges.reverse().map(range => ({
        range: { start: positionAt(content, range.start), end: positionAt(content, range.end) },
        newText: '',
    }));
    return { [mainBalPath]: edits };
}
