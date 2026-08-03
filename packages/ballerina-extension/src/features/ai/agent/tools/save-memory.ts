// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import * as fs from 'fs';
import * as path from 'path';
import { tool } from 'ai';
import { z } from 'zod';
import {
    getGlobalMemoryDir,
    getMemoryDir,
    isGlobalMemoryType,
    ensureMemoryDirsExist,
    invalidateMemoryPromptCache,
    buildSaveMemoryDescription,
    ENTRYPOINT_NAME,
    MAX_ENTRYPOINT_LINES,
    type MemoryType,
} from '@wso2/copilot-utilities/auto-memory';
import { computeWorkspaceHash } from '@wso2/copilot-utilities/chat-persistence';
import { resolveWorkspaceIdentity } from '../../../../views/ai-panel/chatStateStorage';
import { CopilotEventHandler } from '../../utils/events';

export const SAVE_MEMORY_TOOL_NAME = 'save_memory';

const SaveMemoryInputSchema = z.object({
    scope: z.enum(['global', 'workspace']).describe(
        'Directory to write to. "global" for user/history types; "workspace" for codingstyle/integration/about/reference types.'
    ),
    type: z.enum(['user', 'codingstyle', 'integration', 'about', 'reference', 'history']).describe(
        'Memory type — must match scope: user/history → global; codingstyle/integration/about/reference → workspace.'
    ),
    filename: z.string().describe(
        'Filename for the memory file, e.g. user_prefers_tabs.md or integration_shopify_auth.md'
    ),
    name: z.string()
        .max(100, 'Name must be 100 characters or fewer')
        .regex(/^[^\n\r\x00-\x1f\x7f\]]*$/, 'Name must not contain newlines, control characters, or ]')
        .describe('Display name used in the frontmatter name field'),
    description: z.string()
        .max(200, 'Description must be 200 characters or fewer')
        .regex(/^[^\n\r\x00-\x1f\x7f]*$/, 'Description must not contain newlines or control characters')
        .describe('One-line description for the MEMORY.md index entry, under 150 chars'),
    content_body: z.string().describe('Memory content without frontmatter'),
    overwrite: z.boolean().optional().describe(
        'Set to true to overwrite an existing file with the same name. Default: false.'
    ),
});

type SaveMemoryInput = z.infer<typeof SaveMemoryInputSchema>;

/**
 * Returns an error message if the filename is unsafe, or null if valid.
 * Accepts only a pure basename ending in .md with no control chars, separators,
 * traversal sequences, or absolute-path indicators.
 */
function validateFilename(filename: string): string | null {
    if (!filename) { return 'Filename must not be empty.'; }
    if (filename !== path.basename(filename)) {
        return 'Filename must be a plain basename with no path separators.';
    }
    if (!filename.endsWith('.md')) { return 'Filename must end with .md'; }
    if (filename === ENTRYPOINT_NAME) {
        return `"${ENTRYPOINT_NAME}" is the memory index and cannot be written directly.`;
    }
    if (filename.startsWith('.')) { return 'Hidden filenames (starting with .) are not allowed.'; }
    // Reject .. traversal, ~, null bytes, and control characters
    if (filename.includes('..') || /[~\x00-\x1f\x7f]/.test(filename)) {
        return 'Filename contains invalid characters.';
    }
    return null;
}

/** Wraps a string in double-quoted YAML, escaping \ and " inside. */
function yamlQuote(s: string): string {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildFileContent(input: SaveMemoryInput): string {
    return [
        '---',
        `name: ${yamlQuote(input.name)}`,
        `description: ${yamlQuote(input.description)}`,
        `type: ${input.type}`,
        '---',
        '',
        input.content_body,
    ].join('\n');
}

function upsertMemoryIndex(
    indexPath: string,
    filename: string,
    name: string,
    description: string
): void {
    let existing = '';
    try { existing = fs.readFileSync(indexPath, 'utf-8'); } catch { /* new index */ }

    const newEntry = `- [${name}](${filename}) — ${description}`;
    const lines = existing ? existing.split('\n') : [];

    const existingIdx = lines.findIndex(l => l.includes(`(${filename})`));
    if (existingIdx >= 0) {
        lines[existingIdx] = newEntry;
        fs.writeFileSync(indexPath, lines.join('\n'), 'utf-8');
    } else {
        // Keep non-empty lines and trim to leave room for the new entry
        const trimmed = lines.filter(l => l.trim()).slice(0, MAX_ENTRYPOINT_LINES - 1);
        trimmed.push(newEntry);
        fs.writeFileSync(indexPath, trimmed.join('\n') + '\n', 'utf-8');
    }
}

export function createSaveMemoryTool(projectRootPath: string, eventHandler: CopilotEventHandler) {
    const identity     = resolveWorkspaceIdentity(projectRootPath);
    const hash         = computeWorkspaceHash(identity);
    const globalDir    = getGlobalMemoryDir();
    const workspaceDir = getMemoryDir(hash);

    return tool({
        description: buildSaveMemoryDescription(),
        inputSchema: SaveMemoryInputSchema,
        execute: async (input: SaveMemoryInput): Promise<string> => {
            eventHandler({ type: 'tool_call', toolName: SAVE_MEMORY_TOOL_NAME });

            const fail = (msg: string): string => {
                eventHandler({ type: 'tool_result', toolName: SAVE_MEMORY_TOOL_NAME, toolOutput: { action: 'error', error: msg } });
                return msg;
            };

            // Validate scope ↔ type routing
            const expectGlobal = isGlobalMemoryType(input.type as MemoryType);
            if (expectGlobal && input.scope !== 'global') {
                return fail(`Type "${input.type}" must use scope "global". Retry with scope: "global".`);
            }
            if (!expectGlobal && input.scope !== 'workspace') {
                return fail(`Type "${input.type}" must use scope "workspace". Retry with scope: "workspace".`);
            }

            // Validate filename before any filesystem access
            const filenameError = validateFilename(input.filename);
            if (filenameError) { return fail(`Invalid filename: ${filenameError}`); }

            const targetDir = input.scope === 'global' ? globalDir : workspaceDir;
            ensureMemoryDirsExist(hash);

            // Resolve and assert the file stays inside the target directory
            const resolvedTarget = path.resolve(targetDir);
            const filePath       = path.resolve(path.join(targetDir, input.filename));
            if (!filePath.startsWith(resolvedTarget + path.sep)) {
                return fail('Filename resolves outside the memory directory. Operation rejected.');
            }
            const indexPath = path.join(resolvedTarget, ENTRYPOINT_NAME);

            // Reject symlinks — lstatSync does not follow symlinks, unlike statSync/existsSync
            try {
                if (fs.lstatSync(filePath).isSymbolicLink()) {
                    return fail('Target path is a symbolic link. Operation rejected.');
                }
            } catch { /* file doesn't exist yet — safe to write */ }

            if (fs.existsSync(filePath) && !input.overwrite) {
                return fail(`Memory file "${input.filename}" already exists. Use overwrite: true to update it.`);
            }

            // Track whether the file pre-existed so we can roll back a newly-created
            // file if indexing fails — without deleting a file that predated this call.
            const fileExistedBefore = fs.existsSync(filePath);

            try {
                fs.writeFileSync(filePath, buildFileContent(input), 'utf-8');
            } catch (e) {
                return fail(`Failed to save memory: ${e instanceof Error ? e.message : String(e)}`);
            }

            // Keep the file write and index update consistent: if indexing fails, the
            // memory file would otherwise exist on disk without a MEMORY.md entry and
            // never be loaded into the prompt. Roll back the just-created file so the
            // two never diverge.
            try {
                upsertMemoryIndex(indexPath, input.filename, input.name, input.description);
            } catch (e) {
                if (!fileExistedBefore) {
                    try { fs.unlinkSync(filePath); } catch { /* best-effort rollback */ }
                }
                return fail(`Failed to update memory index: ${e instanceof Error ? e.message : String(e)}`);
            }

            invalidateMemoryPromptCache(hash);
            const result = `Saved ${input.scope} memory "${input.filename}".`;
            eventHandler({ type: 'tool_result', toolName: SAVE_MEMORY_TOOL_NAME, toolOutput: { action: 'saved', scope: input.scope, filename: input.filename, name: input.name } });
            return result;
        },
    });
}
