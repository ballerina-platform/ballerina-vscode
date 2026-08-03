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
    ensureMemoryDirsExist,
    invalidateMemoryPromptCache,
    ENTRYPOINT_NAME,
} from '@wso2/copilot-utilities/auto-memory';
import { computeWorkspaceHash } from '@wso2/copilot-utilities/chat-persistence';
import { resolveWorkspaceIdentity } from '../../../../views/ai-panel/chatStateStorage';
import { CopilotEventHandler } from '../../utils/events';

export const DELETE_MEMORY_TOOL_NAME = 'delete_memory';

const DeleteMemoryInputSchema = z.object({
    scope: z.enum(['global', 'workspace']).describe(
        'Directory the file lives in. "global" for user/history; "workspace" for codingstyle/integration/about/reference.'
    ),
    filename: z.string().describe('Exact filename of the memory to delete, e.g. user_prefers_tabs.md'),
});

type DeleteMemoryInput = z.infer<typeof DeleteMemoryInputSchema>;

/**
 * Returns an error message if the filename is unsafe, or null if valid.
 * Mirrors the validation in save-memory.ts.
 */
function validateFilename(filename: string): string | null {
    if (!filename) { return 'Filename must not be empty.'; }
    if (filename !== path.basename(filename)) {
        return 'Filename must be a plain basename with no path separators.';
    }
    if (!filename.endsWith('.md')) { return 'Filename must end with .md'; }
    if (filename === ENTRYPOINT_NAME) {
        return `"${ENTRYPOINT_NAME}" is the memory index and cannot be deleted directly.`;
    }
    if (filename.startsWith('.')) { return 'Hidden filenames (starting with .) are not allowed.'; }
    if (filename.includes('..') || /[~\x00-\x1f\x7f]/.test(filename)) {
        return 'Filename contains invalid characters.';
    }
    return null;
}

function removeFromIndex(indexPath: string, filename: string): void {
    let content = '';
    try { content = fs.readFileSync(indexPath, 'utf-8'); } catch { return; /* nothing to update */ }

    const filtered = content
        .split('\n')
        .filter(l => !l.includes(`(${filename})`))
        .join('\n')
        // Trim trailing whitespace but keep a final newline if the file had content
        .replace(/\n+$/, '');

    fs.writeFileSync(indexPath, filtered ? filtered + '\n' : '', 'utf-8');
}

export function createDeleteMemoryTool(projectRootPath: string, eventHandler: CopilotEventHandler) {
    const identity     = resolveWorkspaceIdentity(projectRootPath);
    const hash         = computeWorkspaceHash(identity);
    const globalDir    = getGlobalMemoryDir();
    const workspaceDir = getMemoryDir(hash);

    return tool({
        description: `Delete a memory file and remove it from the MEMORY.md index. Use when the user asks to forget a specific memory, or when a memory is stale/incorrect and should be removed entirely rather than updated.`,
        inputSchema: DeleteMemoryInputSchema,
        execute: async (input: DeleteMemoryInput): Promise<string> => {
            eventHandler({ type: 'tool_call', toolName: DELETE_MEMORY_TOOL_NAME });

            const fail = (msg: string): string => {
                eventHandler({ type: 'tool_result', toolName: DELETE_MEMORY_TOOL_NAME, toolOutput: { action: 'error', error: msg } });
                return msg;
            };

            const filenameError = validateFilename(input.filename);
            if (filenameError) { return fail(`Invalid filename: ${filenameError}`); }

            const targetDir      = input.scope === 'global' ? globalDir : workspaceDir;
            ensureMemoryDirsExist(hash);

            // Path-containment check
            const resolvedTarget = path.resolve(targetDir);
            const filePath       = path.resolve(path.join(targetDir, input.filename));
            if (!filePath.startsWith(resolvedTarget + path.sep)) {
                return fail('Filename resolves outside the memory directory. Operation rejected.');
            }

            if (!fs.existsSync(filePath)) {
                return fail(`Memory file "${input.filename}" does not exist in the ${input.scope} directory.`);
            }

            try {
                fs.unlinkSync(filePath);
                removeFromIndex(path.join(resolvedTarget, ENTRYPOINT_NAME), input.filename);
                invalidateMemoryPromptCache(hash);

                const result = `Deleted ${input.scope} memory "${input.filename}".`;
                eventHandler({ type: 'tool_result', toolName: DELETE_MEMORY_TOOL_NAME, toolOutput: { action: 'deleted', scope: input.scope, filename: input.filename } });
                return result;
            } catch (e) {
                return fail(`Failed to delete memory: ${e instanceof Error ? e.message : String(e)}`);
            }
        },
    });
}
